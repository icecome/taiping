import { describe, expect, it } from 'vitest'
import { hmacSign, hmacVerify } from './crypto'

describe('hmac session payload', () => {
  it('signs and verifies dotted payload', async () => {
    const sessionId = 'abc'
    const expMs = Date.now() + 1000
    const secret = 'dev-session-secret-please-change'
    const payload = `${sessionId}.${expMs}`
    const sig = await hmacSign(payload, secret)
    expect(sig).toHaveLength(64)
    await expect(hmacVerify(payload, sig, secret)).resolves.toBe(true)
  })
})
