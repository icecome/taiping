import { describe, expect, it } from 'vitest'
import {
  extractPlainText,
  extractReplyText,
  extractTokenFromAddress,
  verifyWebhookSignature,
} from './inbound'

describe('extractTokenFromAddress', () => {
  it('extracts token from a plain reply address', () => {
    expect(extractTokenFromAddress('reply+abc123def456abcd@mail.example.com')).toBe(
      'abc123def456abcd',
    )
  })

  it('extracts token when a display name is present', () => {
    expect(
      extractTokenFromAddress('"Blog" <reply+aabbccddeeff0011@mail.example.com>'),
    ).toBe('aabbccddeeff0011')
  })

  it('returns empty for unrelated addresses', () => {
    expect(extractTokenFromAddress('someone@example.com')).toBe('')
    expect(extractTokenFromAddress('')).toBe('')
    // 令牌过短应拒绝（防误匹配普通地址）
    expect(extractTokenFromAddress('reply+abc@mail.example.com')).toBe('')
  })
})

describe('extractReplyText', () => {
  it('keeps the new content and drops the English quote header', () => {
    const raw = [
      '谢谢，我明白了。',
      '',
      'On Mon, Sep 22 2026 at 10:00, Blogger <noreply@example.com> wrote:',
      '> 这是原文',
    ].join('\n')
    expect(extractReplyText(raw)).toBe('谢谢，我明白了。')
  })

  it('drops the Chinese quote header', () => {
    const raw = ['收到，感谢回复！', '', '在 2026年9月22日 写道：', '> 你好'].join('\n')
    expect(extractReplyText(raw)).toBe('收到，感谢回复！')
  })

  it('strips leading quote markers on fallback path', () => {
    const raw = ['我的回复', '> 引用的一行', '> 引用的另一行'].join('\n')
    expect(extractReplyText(raw)).toBe('我的回复')
  })

  it('preserves inline quotes that are part of the new content', () => {
    // 无显式分隔头时，若 > 行出现在正文中间，不应把前面的有效内容一起截断
    const raw = ['逐点回复如下：', '', '第一点：同意'].join('\n')
    expect(extractReplyText(raw)).toContain('第一点：同意')
  })

  it('returns empty for whitespace-only input', () => {
    expect(extractReplyText('   \n  ')).toBe('')
  })
})

describe('extractPlainText', () => {
  it('prefers the text part when available', () => {
    expect(extractPlainText('正文内容', '<p>忽略</p>')).toBe('正文内容')
  })

  it('converts html to text with line breaks', () => {
    const html = '<p>第一段</p><p>第二段</p><br>第三段'
    const out = extractPlainText('', html)
    expect(out).toContain('第一段')
    expect(out).toContain('第二段')
    expect(out).toContain('第三段')
  })

  it('decodes quoted-printable sequences', () => {
    // =E4=BD=A0=E5=A5=BD → 你好
    expect(extractPlainText('=E4=BD=A0=E5=A5=BD', '')).toBe('你好')
  })
})

describe('verifyWebhookSignature', () => {
  const secret = 'whsec_' + Buffer.from('test-secret-key-0123456789').toString('base64')

  /** 按 Svix 规则生成签名头 */
  async function sign(id: string, timestamp: string, payload: string): Promise<string> {
    const keyBytes = Buffer.from(secret.slice(6), 'base64')
    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const sig = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(`${id}.${timestamp}.${payload}`),
    )
    return `v1,${Buffer.from(sig).toString('base64')}`
  }

  it('accepts a correctly signed payload', async () => {
    const id = 'msg_1'
    const ts = String(Math.floor(Date.now() / 1000))
    const payload = '{"type":"email.received"}'
    const headers = new Headers({
      'svix-id': id,
      'svix-timestamp': ts,
      'svix-signature': await sign(id, ts, payload),
    })
    expect(await verifyWebhookSignature(secret, payload, headers)).toBe(true)
  })

  it('rejects a tampered payload', async () => {
    const id = 'msg_1'
    const ts = String(Math.floor(Date.now() / 1000))
    const headers = new Headers({
      'svix-id': id,
      'svix-timestamp': ts,
      'svix-signature': await sign(id, ts, '{"type":"email.received"}'),
    })
    expect(await verifyWebhookSignature(secret, '{"type":"tampered"}', headers)).toBe(false)
  })

  it('rejects a stale timestamp (replay outside window)', async () => {
    const id = 'msg_1'
    const ts = String(Math.floor(Date.now() / 1000) - 3600)
    const payload = '{}'
    const headers = new Headers({
      'svix-id': id,
      'svix-timestamp': ts,
      'svix-signature': await sign(id, ts, payload),
    })
    expect(await verifyWebhookSignature(secret, payload, headers)).toBe(false)
  })

  it('rejects when the secret is not configured', async () => {
    const headers = new Headers({ 'svix-id': 'a', 'svix-timestamp': '1', 'svix-signature': 'v1,x' })
    expect(await verifyWebhookSignature(undefined, '{}', headers)).toBe(false)
    expect(await verifyWebhookSignature('', '{}', headers)).toBe(false)
  })

  it('rejects when signature headers are missing', async () => {
    expect(await verifyWebhookSignature(secret, '{}', new Headers())).toBe(false)
  })
})
