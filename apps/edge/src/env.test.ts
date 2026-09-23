import { describe, expect, it } from 'vitest'
import { assertEnv, collectEnvProblems } from './env'
import type { Env } from './env'

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    SESSION_SECRET: 'a-sufficiently-long-random-session-secret',
    ...overrides,
  } as Env
}

describe('collectEnvProblems', () => {
  it('returns no problems for session-only env (bootstrap register path)', () => {
    expect(collectEnvProblems(makeEnv())).toEqual([])
  })

  it('returns no problems when admin seed credentials are paired', () => {
    expect(
      collectEnvProblems(
        makeEnv({ ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'a-strong-admin-password' }),
      ),
    ).toEqual([])
  })

  it('reports missing required variables', () => {
    const problems = collectEnvProblems(makeEnv({ SESSION_SECRET: '' }))
    expect(problems.some((p) => p.includes('SESSION_SECRET'))).toBe(true)
  })

  it('rejects placeholder values from the example file', () => {
    const problems = collectEnvProblems(
      makeEnv({ ADMIN_PASSWORD: 'change-me', SESSION_SECRET: 'please-change-me-to-a-long-random-string' }),
    )
    expect(problems.some((p) => p.includes('placeholder'))).toBe(true)
  })

  it('rejects a short session secret', () => {
    const problems = collectEnvProblems(makeEnv({ SESSION_SECRET: 'short' }))
    expect(problems.some((p) => p.includes('at least 16'))).toBe(true)
  })

  it('requires admin seed credentials to be paired', () => {
    const problems = collectEnvProblems(makeEnv({ ADMIN_USERNAME: 'admin' }))
    expect(problems.some((p) => p.includes('must be set together'))).toBe(true)
  })
})

describe('assertEnv', () => {
  it('passes for a complete env', () => {
    expect(() => assertEnv(makeEnv())).not.toThrow()
  })

  it('throws and names the offending variable', () => {
    expect(() => assertEnv(makeEnv({ SESSION_SECRET: '' }))).toThrow(/SESSION_SECRET/)
  })
})
