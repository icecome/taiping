import type { D1Database } from '@cloudflare/workers-types'
import { newId } from '../lib/cache'
import { hashIp } from '../lib/crypto'
import { nowIso } from '@taiping/shared-utils'

/**
 * 登录尝试的限流与审计。
 * 三重作用：IP 维度限流（挡暴力破解）、账号维度锁定（挡换 IP）、失败留痕。
 */

/** 同 IP 在窗口内允许的最大失败次数 */
const IP_MAX_FAILURES = 5
/** IP 限流窗口（分钟） */
const IP_WINDOW_MINUTES = 15

/** 同账号连续失败达到该次数即锁定 */
const ACCOUNT_MAX_FAILURES = 10
/** 账号锁定窗口（分钟）；无成功登录且超过该时长后自动解锁 */
const ACCOUNT_WINDOW_MINUTES = 60

export type LoginBlockReason = 'ip' | 'account'

export interface AuthAttemptContext {
  db: D1Database
  /** 已哈希的客户端 IP（不存明文） */
  ipHash: string
  username: string
  secret: string
}

export async function hashClientIp(ip: string, secret: string): Promise<string> {
  // 复用既有 hashIp，保持与评论 ip_hash 同一套处理
  return hashIp(ip || 'unknown', secret)
}

async function countFailures(
  db: D1Database,
  column: 'ip_hash' | 'username',
  value: string,
  minutes: number,
): Promise<number> {
  const since = new Date(Date.now() - minutes * 60_000).toISOString()
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS c FROM auth_attempts
       WHERE ${column} = ? AND success = 0 AND created_at >= ?`,
    )
    .bind(value, since)
    .first<{ c: number }>()
  return Number(row?.c ?? 0)
}

/**
 * 检查是否应拒绝本次登录尝试。
 * 返回拒绝原因，null 表示放行。
 */
export async function checkLoginAllowed(ctx: AuthAttemptContext): Promise<LoginBlockReason | null> {
  const [ipFailures, accountFailures] = await Promise.all([
    countFailures(ctx.db, 'ip_hash', ctx.ipHash, IP_WINDOW_MINUTES),
    ctx.username
      ? countFailures(ctx.db, 'username', ctx.username, ACCOUNT_WINDOW_MINUTES)
      : Promise.resolve(0),
  ])

  if (accountFailures >= ACCOUNT_MAX_FAILURES) return 'account'
  if (ipFailures >= IP_MAX_FAILURES) return 'ip'
  return null
}

export async function recordAttempt(
  ctx: AuthAttemptContext,
  success: boolean,
): Promise<void> {
  await ctx.db
    .prepare(
      `INSERT INTO auth_attempts (id, ip_hash, username, success, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(newId('att'), ctx.ipHash, ctx.username, success ? 1 : 0, nowIso())
    .run()

  // 登录成功即清除该账号的失败记录，使锁定在证明身份后立即解除
  if (success && ctx.username) {
    await ctx.db
      .prepare('DELETE FROM auth_attempts WHERE username = ? AND success = 0')
      .bind(ctx.username)
      .run()
  }
}

/** 清理过期记录，避免表无限增长（由 Cron 调用） */
export async function pruneAttempts(db: D1Database, keepDays = 30): Promise<number> {
  const before = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000).toISOString()
  const result = await db
    .prepare('DELETE FROM auth_attempts WHERE created_at < ?')
    .bind(before)
    .run()
  return result.meta.changes ?? 0
}

export const AUTH_ATTEMPT_POLICY = {
  IP_MAX_FAILURES,
  IP_WINDOW_MINUTES,
  ACCOUNT_MAX_FAILURES,
  ACCOUNT_WINDOW_MINUTES,
}
