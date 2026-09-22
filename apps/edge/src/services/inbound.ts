import type { D1Database } from '@cloudflare/workers-types'
import { decodeBase64, encodeBase64 } from 'hono/utils/encode'

/**
 * Resend Inbound（访客直接回信）的验签与解析。
 * 签名机制由 Svix 提供：头含 svix-id / svix-timestamp / svix-signature，
 * 签名值为 base64(HMAC-SHA256(secret, `${id}.${timestamp}.${payload}`))。
 */

function bytesToBase64(data: Uint8Array): string {
  return encodeBase64(data as unknown as ArrayBuffer)
}

function base64ToBytes(str: string): Uint8Array {
  return decodeBase64(str)
}

function base64UrlToBase64(s: string): string {
  return s.replace(/-/g, '+').replace(/_/g, '/')
}

/** whsec_ 前缀后为 base64（标准或 url-safe）编码的密钥 */
function decodeSecret(secret: string): Uint8Array | null {
  if (!secret) return null
  let b64 = secret.startsWith('whsec_') ? secret.slice(6) : secret
  b64 = base64UrlToBase64(b64)
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  try {
    return base64ToBytes(padded)
  } catch {
    return null
  }
}

async function hmacSha256(key: Uint8Array, data: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data))
  return new Uint8Array(sig)
}

/** 恒定时间比较（hex/ascii 字符集） */
function constantTimeEqual(a: string, b: string): boolean {
  const max = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let i = 0; i < max; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  }
  return diff === 0
}

/** 校验 webhook 签名，防止伪造事件注入 */
export async function verifyWebhookSignature(
  secret: string | undefined,
  payload: string,
  headers: Headers,
): Promise<boolean> {
  if (!secret) return false
  const key = decodeSecret(secret)
  if (!key) return false

  const id = headers.get('svix-id')
  const timestamp = headers.get('svix-timestamp')
  const signatureHeader = headers.get('svix-signature')
  if (!id || !timestamp || !signatureHeader) return false

  // 双向时间窗：同时拒绝过旧与来自未来的时间戳，防窗口内重放
  const tsNum = Number.parseInt(timestamp, 10)
  if (!Number.isFinite(tsNum)) return false
  if (Math.abs(Date.now() - tsNum * 1000) > 5 * 60 * 1000) return false

  const expected = bytesToBase64(await hmacSha256(key, `${id}.${timestamp}.${payload}`))

  // 头部形如 "v1,<base64>"，多条以空格分隔（base64 内含 +/，不能用逗号切）
  for (const sig of signatureHeader.split(' ').map((s) => s.trim()).filter(Boolean)) {
    const sep = sig.indexOf(',')
    if (sep < 0) continue
    if (sig.slice(0, sep) !== 'v1') continue
    if (constantTimeEqual(expected, sig.slice(sep + 1))) return true
  }
  return false
}

/** 从收件地址解析回信令牌，兼容带显示名形式 */
export function extractTokenFromAddress(address: string): string {
  if (!address) return ''
  const m = address.match(/reply\+([a-f0-9]{16,64})@/i)
  return m?.[1] ?? ''
}

/** 从 Resend 返回的邮件内容中提取纯文本 */
export function extractPlainText(text: string, html: string): string {
  if (text) return decodeQuotedPrintable(text)
  if (!html) return ''
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p[^>]*>/gi, '\n')
    .replace(/<div[^>]*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
  return decodeQuotedPrintable(withBreaks).replace(/\n{3,}/g, '\n\n').trim()
}

function decodeQuotedPrintable(s: string): string {
  if (!/=[0-9A-Fa-f]{2}/.test(s)) return s
  try {
    return decodeURIComponent(s.replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => `%${hex}`))
  } catch {
    return s.replace(/=\r?\n/g, '')
  }
}

/**
 * 剥离引用原文，仅保留新增内容。
 * 显式分隔头为强信号，> 引用行为弱信号仅作兜底，
 * 避免逐点回复中自带 > 行抢先截断有效内容。
 */
export function extractReplyText(raw: string): string {
  if (!raw) return ''
  const text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  const splitMarkers = [
    /^On\s+.*?wrote:.*$/im,
    /^在[^\n]*写道[：:].*$/im,
    /^发件人[：:]\s*[^\n]*$/im,
    /^发送时间[：:]\s*[^\n]*$/im,
    /^-{6,}\s*原始邮件\s*-{6,}.*$/im,
    /^-{6,}\s*$/im,
  ]
  const quoteLineRe = /^>{1,}[^>]*$/im

  let bestIndex = text.length
  for (const re of splitMarkers) {
    const m = re.exec(text)
    if (m && m.index > 0 && m.index < bestIndex) bestIndex = m.index
  }
  if (bestIndex === text.length) {
    const m = quoteLineRe.exec(text)
    if (m && m.index > 0) bestIndex = m.index
  }

  const main = bestIndex < text.length ? text.slice(0, bestIndex) : text
  const lines = main.split('\n').filter((line) => line.trim() !== '')
  while (lines.length && /^-{3,}\s*$/.test(lines[lines.length - 1] ?? '')) lines.pop()

  return lines
    .map((line) => line.replace(/^>+/, ''))
    .join('\n')
    .trim()
}

/**
 * 事件幂等去重：Svix 重试携带相同 svix-id，
 * INSERT OR IGNORE 命中 0 行说明已处理过。
 */
export async function claimWebhookEvent(db: D1Database, svixId: string): Promise<boolean> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS webhook_events (
         svix_id TEXT PRIMARY KEY,
         created_at TEXT NOT NULL
       )`,
    )
    .run()
  const result = await db
    .prepare('INSERT OR IGNORE INTO webhook_events (svix_id, created_at) VALUES (?, ?)')
    .bind(svixId, new Date().toISOString())
    .run()
  if ((result.meta.changes ?? 0) === 0) return false
  await db
    .prepare('DELETE FROM webhook_events WHERE created_at < ?')
    .bind(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .run()
  return true
}
