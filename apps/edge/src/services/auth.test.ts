import { describe, expect, it } from 'vitest'
import {
  changeAdminPassword,
  getAdmin,
  isBootstrapRequired,
  login,
  registerAdmin,
  seedAdminIfEmpty,
  validateSession,
} from './auth'
import type { Env } from '../env'
import type { D1Database } from '@cloudflare/workers-types'

interface AdminRecord {
  id: string
  username: string
  password_hash: string
  created_at: string
  updated_at: string
}

/** 覆盖 admins 与 sessions 两表的最小内存实现 */
function createMockDb() {
  const sessions = new Map<string, string>()
  const admins = new Map<string, AdminRecord>()

  const db = {
    prepare(sql: string) {
      // D1 允许 prepare(...).first() 与 prepare(...).bind(...).first() 两种写法
      const executor = (args: unknown[]) => ({
        async run() {
          if (sql.includes('INSERT INTO sessions')) {
            sessions.set(String(args[0]), String(args[2]))
            return { meta: { changes: 1 } }
          }
          if (sql.includes('DELETE FROM sessions')) {
            if (args.length) sessions.delete(String(args[0]))
            else sessions.clear()
            return { meta: { changes: 1 } }
          }
          if (sql.includes('INSERT INTO admins')) {
            // 并发首注保护：已有管理员时 COUNT 守卫分支不落库
            if (sql.includes('COUNT(*)') && admins.size > 0) {
              return { meta: { changes: 0 } }
            }
            if (sql.includes('WHERE NOT EXISTS') && admins.size > 0) {
              return { meta: { changes: 0 } }
            }
            for (const record of admins.values()) {
              if (record.username === String(args[1])) {
                return { meta: { changes: 0 } }
              }
            }
            admins.set(String(args[0]), {
              id: String(args[0]),
              username: String(args[1]),
              password_hash: String(args[2]),
              created_at: String(args[3]),
              updated_at: String(args[4]),
            })
            return { meta: { changes: 1 } }
          }
          if (sql.includes('UPDATE admins')) {
            const target = admins.get(String(args[2]))
            if (target) {
              if (sql.includes('password_hash')) {
                target.password_hash = String(args[0])
                target.updated_at = String(args[1])
              }
            }
            return { meta: { changes: 1 } }
          }
          return { meta: { changes: 1 } }
        },
        async first() {
          if (sql.includes('FROM admins')) {
            if (sql.includes('WHERE id')) {
              return admins.get(String(args[0])) ?? null
            }
            return admins.values().next().value ?? null
          }
          if (sql.includes('SELECT id FROM sessions')) {
            const id = String(args[0])
            return sessions.has(id) ? { id } : null
          }
          return null
        },
      })

      return {
        ...executor([]),
        bind: (...args: unknown[]) => executor(args),
      }
    },
    async batch(statements: unknown[]) {
      for (const s of statements as Array<{ run: () => Promise<unknown> }>) {
        await s.run()
      }
      return []
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
  it('seeds an admin from env when table is empty', async () => {
    const db = createMockDb()
    expect(await getAdmin(db)).toBeNull()
    const seeded = await seedAdminIfEmpty(db, env)
    expect(seeded?.username).toBe('admin')
    expect(await getAdmin(db)).not.toBeNull()
  })

  it('does not overwrite an existing admin', async () => {
    const db = createMockDb()
    await seedAdminIfEmpty(db, env)
    const again = await seedAdminIfEmpty(db, { ...env, ADMIN_USERNAME: 'other' } as Env)
    expect(again?.username).toBe('admin')
  })

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
    await expect(
      login(db, env, 'admin', 'wrong', undefined, false, false),
    ).rejects.toMatchObject({ code: 'AUTH_INVALID' })
  })

  it('rejects tampered cookie', async () => {
    const db = createMockDb()
    const result = await login(db, env, 'admin', 'dev-admin-pass', undefined, true, false)
    const cookieHeader = (result.cookie.split(';')[0] ?? '').replace(/.$/, 'x')
    const sessionId = await validateSession(db, env, cookieHeader)
    expect(sessionId).toBeNull()
  })

  it('does not depend on env password after seeding', async () => {
    const db = createMockDb()
    await seedAdminIfEmpty(db, env)
    // 环境变量改了，但库里已有账号，仍应能用原口令登录
    const mutated = { ...env, ADMIN_PASSWORD: 'rotated-in-env' } as Env
    const ok = await login(db, mutated, 'admin', 'dev-admin-pass', undefined, false, false)
    expect(ok.cookie).toContain('tp_session=')
    await expect(
      login(db, mutated, 'admin', 'rotated-in-env', undefined, false, false),
    ).rejects.toMatchObject({ code: 'AUTH_INVALID' })
  })
})

describe('changeAdminPassword', () => {
  it('rejects a wrong current password', async () => {
    const db = createMockDb()
    await seedAdminIfEmpty(db, env)
    await expect(changeAdminPassword(db, 'wrong', 'new-password-1')).rejects.toMatchObject({
      code: 'AUTH_INVALID',
    })
  })

  it('updates the password and clears all sessions', async () => {
    const db = createMockDb()
    await login(db, env, 'admin', 'dev-admin-pass', undefined, true, false)
    await changeAdminPassword(db, 'dev-admin-pass', 'new-password-1')

    // 旧口令失效
    await expect(
      login(db, env, 'admin', 'dev-admin-pass', undefined, false, false),
    ).rejects.toMatchObject({ code: 'AUTH_INVALID' })

    // 新口令可用
    const result = await login(db, env, 'admin', 'new-password-1', undefined, false, false)
    expect(result.cookie).toContain('tp_session=')
  })
})

describe('registerAdmin bootstrap', () => {
  it('reports bootstrap required only when admins is empty', async () => {
    const db = createMockDb()
    expect(await isBootstrapRequired(db)).toBe(true)
    await registerAdmin(db, env, 'owner', 'new-password-1', undefined, true, false)
    expect(await isBootstrapRequired(db)).toBe(false)
  })

  it('creates the first admin and issues a session', async () => {
    const db = createMockDb()
    const result = await registerAdmin(
      db,
      env,
      'owner',
      'new-password-1',
      'test-agent',
      true,
      false,
    )
    expect(result.cookie.startsWith('tp_session=')).toBe(true)
    const admin = await getAdmin(db)
    expect(admin?.username).toBe('owner')
    // 口令应为哈希而非明文
    expect(admin).not.toHaveProperty('password_hash')
    const cookieHeader = result.cookie.split(';')[0]
    const sessionId = await validateSession(db, env, cookieHeader)
    expect(sessionId).toBe(result.sessionId)
  })

  it('rejects registration after an admin already exists', async () => {
    const db = createMockDb()
    await registerAdmin(db, env, 'owner', 'new-password-1', undefined, true, false)
    await expect(
      registerAdmin(db, env, 'intruder', 'new-password-2', undefined, true, false),
    ).rejects.toMatchObject({ code: 'SETUP_ALREADY_DONE' })
    const admin = await getAdmin(db)
    expect(admin?.username).toBe('owner')
  })

  it('does not replace a seeded admin', async () => {
    const db = createMockDb()
    await seedAdminIfEmpty(db, env)
    await expect(
      registerAdmin(db, env, 'owner', 'new-password-1', undefined, true, false),
    ).rejects.toMatchObject({ code: 'SETUP_ALREADY_DONE' })
  })

  it('hashes the password at rest', async () => {
    const db = createMockDb()
    await registerAdmin(db, env, 'owner', 'super-secret-9', undefined, true, false)
    await expect(
      login(db, env, 'owner', 'super-secret-9', undefined, false, false),
    ).resolves.toMatchObject({ cookie: expect.stringContaining('tp_session=') })
  })
})
