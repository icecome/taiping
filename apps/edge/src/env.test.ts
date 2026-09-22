import { describe, expect, it } from 'vitest'
import { assertEnv, collectEnvProblems } from './env'
import type { Env } from './env'

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    SESSION_SECRET: 'a-sufficiently-long-random-session-secret',
    ADMIN_USERNAME: 'admin',
    ADMIN_PASSWORD: 'a-strong-admin-password',
    SITE_URL: 'https://example.com',
    SITE_TITLE: '站点',
    SITE_AUTHOR: '作者',
    SITE_DESCRIPTION: '描述',
    ...overrides,
  } as Env
}

describe('collectEnvProblems', () => {
  it('returns no problems for a complete env', () => {
    expect(collectEnvProblems(makeEnv())).toEqual([])
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
})

describe('assertEnv', () => {
  it('passes for a complete env', () => {
    expect(() => assertEnv(makeEnv())).not.toThrow()
  })

  it('throws and names the offending variable', () => {
    expect(() => assertEnv(makeEnv({ ADMIN_USERNAME: '' }))).toThrow(/ADMIN_USERNAME/)
  })
})
