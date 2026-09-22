export function plainText(htmlOrMd: string): string {
  return htmlOrMd
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_`~\[\]()!-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function excerptOf(text: string, maxLength = 160): string {
  const plain = plainText(text)
  if (plain.length <= maxLength) return plain
  return `${plain.slice(0, maxLength - 1)}…`
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 1)}…`
}

export function encodeId(prefix: string, raw: string | number): string {
  return `${prefix}_${String(raw)}`
}

export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
}
