import type { D1Database } from '@cloudflare/workers-types'
import type { Env } from '../env'
import type { Admin } from '@taiping/content-model/auth'
import { hashPassword, hmacSign, hmacVerify, verifyPassword, timingSafeEqual } from '../lib/crypto'
import { checkLoginAllowed, hashClientIp, recordAttempt, type LoginBlockReason } from './authAttempts'
import { newId } from '../lib/cache'
import { readCookie } from '../lib/cookie'
import { nowIso, randomToken } from '@taiping/shared-utils'

const COOKIE_NAME = 'tp_session'
const TRUSTED_TTL_MS = 7 * 24 * 60 * 60 * 1000
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000

export { COOKIE_NAME }

interface AdminRow {
  id: string
  username: string
  password_hash: string
  created_at: string
  updated_at: string
}

function rowToAdmin(row: AdminRow): Admin {
  return {
    id: row.id,
    username: row.username,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function getAdmin(db: D1Database): Promise<Admin | null> {
  const row = await db
    .prepare('SELECT * FROM admins ORDER BY created_at ASC LIMIT 1')
    .first<AdminRow>()
  return row ? rowToAdmin(row) : null
}

/**
 * 首次播种：admins 表为空时，用环境变量创建唯一管理员。
 * 播种后环境变量不再参与登录校验，可自行清除。
 * 未配置环境变量时返回 null，改走 /auth/register 初始化。
 */
export async function seedAdminIfEmpty(db: D1Database, env: Env): Promise<Admin | null> {
  const existing = await getAdmin(db)
  if (existing) return existing
  if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD) return null

  const now = nowIso()
  const id = newId('adm')
  const passwordHash = await hashPassword(env.ADMIN_PASSWORD)
  await db
    .prepare(
      `INSERT INTO admins (id, username, password_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(id, env.ADMIN_USERNAME, passwordHash, now, now)
    .run()
  console.log(`[auth] 环境变量首次播种管理员 username=${env.ADMIN_USERNAME} id=${id}`)
  return { id, username: env.ADMIN_USERNAME, createdAt: now, updatedAt: now }
}

/** 系统是否仍待初始化（尚无管理员） */
export async function isBootstrapRequired(db: D1Database): Promise<boolean> {
  const admin = await getAdmin(db)
  return admin === null
}

/**
 * 首次初始化注册：仅当 admins 表为空时创建唯一管理员，并直接签发会话。
 * 限流表异常时降级放行（不阻断建号）；插入用 COUNT 守卫降低并发首注风险。
 */
export async function registerAdmin(
  db: D1Database,
  env: Env,
  username: string,
  password: string,
  userAgent: string | undefined,
  trusted: boolean,
  isSecureRequest: boolean,
  clientIp?: string,
): Promise<{ sessionId: string; expiresAt: string; cookie: string }> {
  const ctx = {
    db,
    ipHash: await hashClientIp(clientIp ?? '', env.SESSION_SECRET),
    username,
    secret: env.SESSION_SECRET,
  }

  let blocked: LoginBlockReason | null = null
  try {
    blocked = await checkLoginAllowed(ctx)
  } catch (err) {
    console.error('[auth] 注册限流检查失败，已放行', err)
  }
  if (blocked) {
    console.warn(`[auth] 注册被限流 reason=${blocked} username=${username}`)
    throw Object.assign(new Error('too many attempts'), {
      code: blocked === 'account' ? 'ACCOUNT_LOCKED' : 'RATE_LIMITED',
    })
  }

  if (await getAdmin(db)) {
    await safeRecordAttempt(ctx, false)
    console.warn('[auth] 注册拒绝：系统已有管理员')
    throw Object.assign(new Error('admin already exists'), { code: 'SETUP_ALREADY_DONE' })
  }

  const passwordHash = await hashPassword(password)
  const now = nowIso()
  const id = newId('adm')
  try {
    const result = await db
      .prepare(
        `INSERT INTO admins (id, username, password_hash, created_at, updated_at)
         SELECT ?, ?, ?, ?, ?
         WHERE (SELECT COUNT(*) FROM admins) = 0`,
      )
      .bind(id, username, passwordHash, now, now)
      .run()
    const changes = result?.meta?.changes ?? 0
    if (!changes) {
      await safeRecordAttempt(ctx, false)
      console.warn('[auth] 注册拒绝：并发初始化已完成')
      throw Object.assign(new Error('admin already exists'), { code: 'SETUP_ALREADY_DONE' })
    }
  } catch (err) {
    if ((err as { code?: string }).code === 'SETUP_ALREADY_DONE') throw err
    console.error('[auth] 注册写入失败', err)
    await safeRecordAttempt(ctx, false)
    const message = err instanceof Error ? err.message : String(err)
    if (/unique|constraint|SQLITE_CONSTRAINT/i.test(message)) {
      throw Object.assign(new Error('admin already exists'), { code: 'SETUP_ALREADY_DONE' })
    }
    throw err
  }

  await safeRecordAttempt(ctx, true)
  console.log(`[auth] 管理员注册成功 username=${username} id=${id}`)
  return issueSession(db, env, userAgent, trusted, isSecureRequest)
}

/** 限流审计失败不阻断主流程，仅记日志 */
async function safeRecordAttempt(
  ctx: { db: D1Database; ipHash: string; username: string; secret: string },
  success: boolean,
): Promise<void> {
  try {
    await recordAttempt(ctx, success)
  } catch (err) {
    console.error('[auth] 记录登录尝试失败', err)
  }
}

async function issueSession(
  db: D1Database,
  env: Env,
  userAgent: string | undefined,
  trusted: boolean,
  isSecureRequest: boolean,
): Promise<{ sessionId: string; expiresAt: string; cookie: string }> {
  const sessionId = randomToken()
  const now = nowIso()
  const ttl = trusted ? TRUSTED_TTL_MS : DEFAULT_TTL_MS
  const expMs = Date.now() + ttl
  const expiresAt = new Date(expMs).toISOString()
  await db
    .prepare(
      `INSERT INTO sessions (id, created_at, expires_at, trusted, user_agent)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(sessionId, now, expiresAt, trusted ? 1 : 0, userAgent ?? null)
    .run()
  // cookie 仅使用安全字符，避免解析歧义
  const payload = `${sessionId}.${expMs}`
  const sig = await hmacSign(payload, env.SESSION_SECRET)
  // Secure 标志依据实际请求协议判定，不依赖可配错的站点 URL
  const secure = isSecureRequest ? '; Secure' : ''
  const cookie = `${COOKIE_NAME}=${payload}.${sig}; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=${Math.floor(ttl / 1000)}`
  return { sessionId, expiresAt, cookie }
}

export async function login(
  db: D1Database,
  env: Env,
  username: string,
  password: string,
  userAgent: string | undefined,
  trusted: boolean,
  isSecureRequest: boolean,
  clientIp?: string,
): Promise<{ sessionId: string; expiresAt: string; cookie: string }> {
  const ctx = {
    db,
    ipHash: await hashClientIp(clientIp ?? '', env.SESSION_SECRET),
    username,
    secret: env.SESSION_SECRET,
  }

  // 先判限流，避免对已锁定的来源继续做昂贵的 PBKDF2 校验
  const blocked = await checkLoginAllowed(ctx)
  if (blocked) {
    throw Object.assign(new Error('too many attempts'), {
      code: blocked === 'account' ? 'ACCOUNT_LOCKED' : 'RATE_LIMITED',
    })
  }

  // 表为空时先播种，使首次部署即可用环境变量登录
  const admin = (await getAdmin(db)) ?? (await seedAdminIfEmpty(db, env))

  let ok = false
  if (admin) {
    const row = await db
      .prepare('SELECT password_hash, username FROM admins WHERE id = ?')
      .bind(admin.id)
      .first<{ password_hash: string; username: string }>()
    if (row) {
      // 用户名恒定时间比较 + 口令走 PBKDF2 校验，避免用户名枚举的时序差异
      const userOk = await timingSafeEqual(username, row.username)
      const passOk = await verifyPassword(password, row.password_hash)
      ok = userOk && passOk
    }
  }
  if (!ok) {
    // 失败路径也执行一次哈希，拉平响应耗时的差异
    await verifyPassword(password, 'pbkdf2$600000$00$00')
    await recordAttempt(ctx, false)
    throw Object.assign(new Error('invalid credentials'), { code: 'AUTH_INVALID' })
  }
  await recordAttempt(ctx, true)

  return issueSession(db, env, userAgent, trusted, isSecureRequest)
}

/**
 * 修改当前管理员口令。校验旧口令后写入新哈希，并清空既有会话
 * （防止旧会话在被盗用的情形下继续有效）。
 */
export async function changeAdminPassword(
  db: D1Database,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const admin = await getAdmin(db)
  if (!admin) {
    throw Object.assign(new Error('admin not found'), { code: 'NOT_FOUND' })
  }
  const row = await db
    .prepare('SELECT password_hash FROM admins WHERE id = ?')
    .bind(admin.id)
    .first<{ password_hash: string }>()
  const currentOk = row ? await verifyPassword(currentPassword, row.password_hash) : false
  if (!currentOk) {
    throw Object.assign(new Error('invalid current password'), { code: 'AUTH_INVALID' })
  }
  const nextHash = await hashPassword(newPassword)
  await db.batch([
    db
      .prepare('UPDATE admins SET password_hash = ?, updated_at = ? WHERE id = ?')
      .bind(nextHash, nowIso(), admin.id),
    db.prepare('DELETE FROM sessions'),
    // 改口令即视为身份已确认，解除账号锁定
    db.prepare('DELETE FROM auth_attempts WHERE success = 0'),
  ])
}

// ===== 口令重置（邮件链接）=====

/** 重置令牌有效期（分钟） */
export const RESET_TTL_MINUTES = 30

export interface ResetRequestResult {
  /** 是否已发出邮件（未配置邮箱或邮件服务时为 false，但不向调用方暴露具体原因） */
  sent: boolean
}

async function hashResetToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * 创建重置令牌并返回明文令牌（仅此一次可见，入库的是哈希）。
 * 若管理员未设置恢复邮箱则返回 null。
 */
export async function createPasswordResetToken(
  db: D1Database,
  env: Env,
): Promise<{ token: string; email: string; ttlMinutes: number } | null> {
  const row = await db
    .prepare('SELECT id, email FROM admins ORDER BY created_at ASC LIMIT 1')
    .first<{ id: string; email: string | null }>()
  if (!row) return null
  const email = (row.email ?? '').trim()
  if (!email) return null

  const token = randomToken()
  const now = nowIso()
  const expiresAt = new Date(Date.now() + RESET_TTL_MINUTES * 60_000).toISOString()

  await db.batch([
    // 同一管理员仅保留最新令牌，避免旧链接仍可用
    db
      .prepare('UPDATE password_resets SET used_at = ? WHERE admin_id = ? AND used_at IS NULL')
      .bind(now, row.id),
    db
      .prepare(
        `INSERT INTO password_resets (id, admin_id, token_hash, expires_at, used_at, created_at)
         VALUES (?, ?, ?, ?, NULL, ?)`,
      )
      .bind(newId('rst'), row.id, await hashResetToken(token), expiresAt, now),
  ])

  return { token, email, ttlMinutes: RESET_TTL_MINUTES }
}

export type ResetTokenState = 'valid' | 'invalid' | 'expired' | 'used'

export async function inspectResetToken(
  db: D1Database,
  token: string,
): Promise<ResetTokenState> {
  if (!token) return 'invalid'
  const row = await db
    .prepare('SELECT expires_at, used_at FROM password_resets WHERE token_hash = ?')
    .bind(await hashResetToken(token))
    .first<{ expires_at: string; used_at: string | null }>()
  if (!row) return 'invalid'
  if (row.used_at) return 'used'
  if (Date.parse(row.expires_at) < Date.now()) return 'expired'
  return 'valid'
}

/**
 * 用重置令牌设置新口令。成功后令牌消费、全部会话失效、账号锁定解除。
 */
export async function resetPasswordWithToken(
  db: D1Database,
  token: string,
  newPassword: string,
): Promise<void> {
  const row = await db
    .prepare(
      'SELECT id, admin_id, expires_at, used_at FROM password_resets WHERE token_hash = ?',
    )
    .bind(await hashResetToken(token))
    .first<{ id: string; admin_id: string; expires_at: string; used_at: string | null }>()

  if (!row) {
    throw Object.assign(new Error('invalid token'), { code: 'TOKEN_INVALID' })
  }
  if (row.used_at) {
    throw Object.assign(new Error('token already used'), { code: 'TOKEN_USED' })
  }
  if (Date.parse(row.expires_at) < Date.now()) {
    throw Object.assign(new Error('token expired'), { code: 'TOKEN_EXPIRED' })
  }

  const nextHash = await hashPassword(newPassword)
  const now = nowIso()
  await db.batch([
    db
      .prepare('UPDATE admins SET password_hash = ?, updated_at = ? WHERE id = ?')
      .bind(nextHash, now, row.admin_id),
    db.prepare('UPDATE password_resets SET used_at = ? WHERE id = ?').bind(now, row.id),
    db.prepare('DELETE FROM sessions'),
    db.prepare('DELETE FROM auth_attempts WHERE success = 0'),
  ])
}

/** 读取/更新管理员恢复邮箱 */
export async function getAdminEmail(db: D1Database): Promise<string> {
  const row = await db
    .prepare('SELECT email FROM admins ORDER BY created_at ASC LIMIT 1')
    .first<{ email: string | null }>()
  return (row?.email ?? '').trim()
}

export async function setAdminEmail(db: D1Database, email: string): Promise<void> {
  const admin = await getAdmin(db)
  if (!admin) {
    throw Object.assign(new Error('admin not found'), { code: 'NOT_FOUND' })
  }
  await db
    .prepare('UPDATE admins SET email = ?, updated_at = ? WHERE id = ?')
    .bind(email.trim(), nowIso(), admin.id)
    .run()
}

export async function logout(db: D1Database, cookieHeader: string | undefined): Promise<string> {
  const parsed = parseSessionCookie(cookieHeader)
  if (!parsed) {
    return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
  }
  await db.prepare('DELETE FROM sessions WHERE id = ?').bind(parsed.sessionId).run()
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
}

export async function validateSession(
  db: D1Database,
  env: Env,
  cookieHeader: string | undefined,
): Promise<string | null> {
  const parsed = parseSessionCookie(cookieHeader)
  if (!parsed) return null
  const valid = await hmacVerify(`${parsed.sessionId}.${parsed.expMs}`, parsed.signature, env.SESSION_SECRET)
  if (!valid) return null
  if (parsed.expMs < Date.now()) {
    await db.prepare('DELETE FROM sessions WHERE id = ?').bind(parsed.sessionId).run()
    return null
  }
  const row = await db
    .prepare('SELECT id FROM sessions WHERE id = ?')
    .bind(parsed.sessionId)
    .first<{ id: string }>()
  return row?.id ?? null
}

function parseSessionCookie(
  cookieHeader: string | undefined,
): { sessionId: string; expMs: number; signature: string } | null {
  const value = readCookie(cookieHeader, COOKIE_NAME)
  if (!value) return null
  const segments = value.split('.')
  if (segments.length !== 3) return null
  const [sessionId, expRaw, signature] = segments as [string, string, string]
  const expMs = Number(expRaw)
  if (!sessionId || !signature || !Number.isFinite(expMs)) return null
  return { sessionId, expMs, signature }
}

export function unlockCookieName(slug: string): string {
  return `tp_unlock_${slug.replace(/[^a-zA-Z0-9_-]/g, '_')}`
}

export async function signUnlockToken(postId: string, secret: string, ttlMs = 7 * 24 * 60 * 60 * 1000): Promise<string> {
  const exp = Date.now() + ttlMs
  const payload = `${postId}.${exp}`
  const sig = await hmacSign(payload, secret)
  return `${payload}.${sig}`
}

export async function verifyUnlockToken(
  token: string | undefined,
  postId: string,
  secret: string,
): Promise<boolean> {
  if (!token) return false
  const parts = token.split('.')
  if (parts.length !== 3) return false
  const [id, exp, sig] = parts as [string, string, string]
  if (id !== postId) return false
  if (Number(exp) < Date.now()) return false
  return hmacVerify(`${id}.${exp}`, sig, secret)
}
