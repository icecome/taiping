import { describe, expect, it } from 'vitest'
import type { D1Database } from '@cloudflare/workers-types'
import {
  AUTH_ATTEMPT_POLICY,
  checkLoginAllowed,
  hashClientIp,
  pruneAttempts,
  recordAttempt,
} from './authAttempts'

interface AttemptRecord {
  id: string
  ip_hash: string
  username: string
  success: number
  created_at: string
}

/** 支持 COUNT / INSERT / DELETE 的最小 auth_attempts 内存实现 */
function createAttemptsDb() {
  const rows: AttemptRecord[] = []
  let seq = 0

  const db = {
    prepare(sql: string) {
      const exec = (args: unknown[]) => ({
        async run() {
          if (sql.startsWith('INSERT INTO auth_attempts')) {
            rows.push({
              id: String(args[0]),
              ip_hash: String(args[1]),
              username: String(args[2]),
              success: Number(args[3]),
              created_at: String(args[4]),
            })
          } else if (sql.includes('DELETE FROM auth_attempts WHERE username')) {
            const target = String(args[0])
            for (let i = rows.length - 1; i >= 0; i--) {
              const row = rows[i]
              if (row && row.username === target && row.success === 0) rows.splice(i, 1)
            }
          } else if (sql.includes('DELETE FROM auth_attempts WHERE created_at')) {
            const before = String(args[0])
            for (let i = rows.length - 1; i >= 0; i--) {
              const row = rows[i]
              if (row && row.created_at < before) rows.splice(i, 1)
            }
          }
          return { meta: { changes: 1 } }
        },
        async first() {
          if (sql.includes('COUNT(*)')) {
            const col = sql.includes('ip_hash') ? 'ip_hash' : 'username'
            const value = String(args[0])
            const since = String(args[1])
            const count = rows.filter(
              (r) => r[col as 'ip_hash' | 'username'] === value && r.success === 0 && r.created_at >= since,
            ).length
            return { c: count }
          }
          return null
        },
      })
      return { ...exec([]), bind: (...a: unknown[]) => exec(a) }
    },
    _rows: rows,
    _nextId: () => `att_${++seq}`,
  }
  return db as unknown as D1Database & { _rows: AttemptRecord[]; _nextId: () => string }
}

const secret = 'test-secret'

describe('login rate limiting', () => {
  it('allows login when there are no failures', async () => {
    const db = createAttemptsDb()
    const ctx = { db, ipHash: await hashClientIp('1.2.3.4', secret), username: 'admin', secret }
    expect(await checkLoginAllowed(ctx)).toBeNull()
  })

  it('blocks by IP after reaching the failure threshold', async () => {
    const db = createAttemptsDb()
    const ipHash = await hashClientIp('1.2.3.4', secret)
    const ctx = { db, ipHash, username: 'admin', secret }
    for (let i = 0; i < AUTH_ATTEMPT_POLICY.IP_MAX_FAILURES; i++) {
      await recordAttempt(ctx, false)
    }
    expect(await checkLoginAllowed(ctx)).toBe('ip')
  })

  it('blocks by account even when IP changes (evasion)', async () => {
    const db = createAttemptsDb()
    // 每次用不同 IP（模拟轮换 IP 绕过 IP 维度限流）
    for (let i = 0; i < AUTH_ATTEMPT_POLICY.ACCOUNT_MAX_FAILURES; i++) {
      const ctx = { db, ipHash: await hashClientIp(`10.0.0.${i}`, secret), username: 'admin', secret }
      await recordAttempt(ctx, false)
    }
    const freshIpH = await hashClientIp('10.0.0.99', secret)
    expect(await checkLoginAllowed({ db, ipHash: freshIpH, username: 'admin', secret })).toBe(
      'account',
    )
  })

  it('clears account failures after a successful login', async () => {
    const db = createAttemptsDb()
    const ipHash = await hashClientIp('1.2.3.4', secret)
    const ctx = { db, ipHash, username: 'admin', secret }
    await recordAttempt(ctx, false)
    await recordAttempt(ctx, false)
    await recordAttempt(ctx, true)
    expect(await checkLoginAllowed(ctx)).toBeNull()
  })

  it('hashes the client IP rather than storing it in plaintext', async () => {
    const a = await hashClientIp('1.2.3.4', secret)
    const b = await hashClientIp('1.2.3.4', secret)
    const c = await hashClientIp('1.2.3.5', secret)
    expect(a).not.toContain('1.2.3.4')
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })

  it('prunes records older than the retention window', async () => {
    const db = createAttemptsDb()
    const removed = await pruneAttempts(db, 30)
    expect(typeof removed).toBe('number')
  })
})
