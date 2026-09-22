import type { D1Database } from '@cloudflare/workers-types'
import type { Env } from '../env'
import { hmacSign, hmacVerify } from '../lib/crypto'
import { nowIso } from '@taiping/shared-utils'

const COOKIE_NAME = 'tp_session'
const TRUSTED_TTL_MS = 7 * 24 * 60 * 60 * 1000
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000

export { COOKIE_NAME }

export async function login(
  db: D1Database,
  env: Env,
  username: string,
  password: string,
  userAgent: string | undefined,
  trusted: boolean,
  isSecureRequest: boolean,
): Promise<{ sessionId: string; expiresAt: string; cookie: string }> {
  const [userOk, passOk] = await Promise.all([
    verifyAdminUsername(env, username),
    verifyAdminPassword(env, password),
  ])
  if (!userOk || !passOk) {
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

export async function verifyAdminUsername(env: Env, username: string): Promise<boolean> {
  return constantTimeEquals(username, env.ADMIN_USERNAME)
}

export async function verifyAdminPassword(env: Env, password: string): Promise<boolean> {
  return constantTimeEquals(password, env.ADMIN_PASSWORD)
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
