import { describe, expect, it } from 'vitest'
import { login, validateSession } from './auth'
import type { Env } from '../env'
import type { D1Database } from '@cloudflare/workers-types'

function createMockDb() {
  const sessions = new Map<string, string>()
  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async run() {
              if (sql.includes('INSERT INTO sessions')) {
                sessions.set(String(args[0]), String(args[2]))
              }
              if (sql.includes('DELETE FROM sessions')) {
                sessions.delete(String(args[0]))
              }
              return { meta: { changes: 1 } }
            },
            async first() {
              if (sql.includes('SELECT id FROM sessions')) {
                const id = String(args[0])
                return sessions.has(id) ? { id } : null
              }
              return null
            },
          }
        },
      }
    },
  }
  return db as unknown as D1Database
}

const env = {
  SESSION_SECRET: 'dev-session-secret-please-change',
  ADMIN_USERNAME: 'admin',
  ADMIN_PASSWORD: 'dev-admin-pass',
} as Env

describe('session auth', () => {
  it('login issues cookie that validateSession accepts', async () => {
    const db = createMockDb()
    const result = await login(db, env, 'admin', 'dev-admin-pass', 'test-agent', true, false)
    expect(result.cookie.startsWith('tp_session=')).toBe(true)
    const cookieHeader = result.cookie.split(';')[0]
    const sessionId = await validateSession(db, env, cookieHeader)
    expect(sessionId).toBe(result.sessionId)
  })

  it('marks cookie Secure when request is https', async () => {
    const db = createMockDb()
    const result = await login(db, env, 'admin', 'dev-admin-pass', undefined, false, true)
    expect(result.cookie).toContain('; Secure')
  })

  it('omits Secure when request is plain http', async () => {
    const db = createMockDb()
    const result = await login(db, env, 'admin', 'dev-admin-pass', undefined, false, false)
    expect(result.cookie).not.toContain('; Secure')
  })

  it('rejects invalid credentials', async () => {
    const db = createMockDb()
    await expect(login(db, env, 'admin', 'wrong', undefined, false, false)).rejects.toMatchObject({
      code: 'AUTH_INVALID',
    })
  })

  it('rejects tampered cookie', async () => {
    const db = createMockDb()
    const result = await login(db, env, 'admin', 'dev-admin-pass', undefined, true, false)
    const cookieHeader = (result.cookie.split(';')[0] ?? '').replace(/.$/, 'x')
    const sessionId = await validateSession(db, env, cookieHeader)
    expect(sessionId).toBeNull()
  })
})
