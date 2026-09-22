import type { D1Database } from '@cloudflare/workers-types'
import type { Env } from '../env'
import type { Admin } from '@taiping/content-model/auth'
import { hashPassword, hmacSign, hmacVerify, verifyPassword } from '../lib/crypto'
import { newId } from '../lib/cache'
import { nowIso } from '@taiping/shared-utils'

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
  return { id, username: env.ADMIN_USERNAME, createdAt: now, updatedAt: now }
}

export async function login(
  db: D1Database,
  env: Env,
  username: string,
  password: string,
  userAgent: string | undefined,
  trusted: boolean,
  isSecureRequest: boolean,
): Promise<{ sessionId: string; expiresAt: string; cookie: string }> {
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
      const userOk = constantTimeEquals(username, row.username)
      const passOk = await verifyPassword(password, row.password_hash)
      ok = userOk && passOk
    }
  }
  if (!ok) {
    // 失败路径也执行一次哈希，拉平响应耗时的差异
    await verifyPassword(password, 'pbkdf2$600000$00$00')
    throw Object.assign(new Error('invalid credentials'), { code: 'AUTH_INVALID' })
  }

  const sessionId = crypto.randomUUID().replace(/-/g, '')
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
  ])
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
  if (!cookieHeader) return null
  const parts = cookieHeader.split(';').map((p) => p.trim())
  const raw = parts.find((p) => p.startsWith(`${COOKIE_NAME}=`))
  if (!raw) return null
  const value = raw.slice(COOKIE_NAME.length + 1)
  const segments = value.split('.')
  if (segments.length !== 3) return null
  const [sessionId, expRaw, signature] = segments as [string, string, string]
  const expMs = Number(expRaw)
  if (!sessionId || !signature || !Number.isFinite(expMs)) return null
  return { sessionId, expMs, signature }
}

/**
 * 恒定时间字符串比较。
 * 长度不等时不做提前返回，而是继续比较最大长度以接近恒定耗时。
 */
function constantTimeEquals(a: string, b: string): boolean {
  const max = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let i = 0; i < max; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  }
  return diff === 0
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
