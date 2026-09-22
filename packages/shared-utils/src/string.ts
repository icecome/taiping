export function plainText(htmlOrMd: string): string {
  return htmlOrMd
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_`~\[\]()!-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function truncate(text: string, maxLength: number): string {
  if (maxLength <= 0) return ''
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 1)}…`
}

export function excerptOf(text: string, maxLength = 160): string {
  return truncate(plainText(text), maxLength)
}

export function encodeId(prefix: string, raw: string | number): string {
  return `${prefix}_${String(raw)}`
}

function webCrypto(): { randomUUID(): string } {
  const g = globalThis as unknown as { crypto?: { randomUUID(): string } }
  if (!g.crypto?.randomUUID) {
    throw new Error('Web Crypto randomUUID unavailable')
  }
  return g.crypto
}

export function createId(prefix: string): string {
  return `${prefix}_${webCrypto().randomUUID().replace(/-/g, '').slice(0, 16)}`
}

/** 全熵 token（会话/重置等场景，不截断） */
export function randomToken(): string {
  return webCrypto().randomUUID().replace(/-/g, '') + webCrypto().randomUUID().replace(/-/g, '')
}
