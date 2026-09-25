export function nowIso(): string {
  return new Date().toISOString()
}

export function formatDate(input?: string | number | Date | null, pattern = 'YYYY-MM-DD'): string {
  if (input === null || input === undefined || input === '') return ''
  const d = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(d.getTime())) return ''

  const pad = (n: number) => String(n).padStart(2, '0')
  const map: Record<string, string> = {
    YYYY: String(d.getFullYear()),
    MM: pad(d.getMonth() + 1),
    DD: pad(d.getDate()),
    HH: pad(d.getHours()),
    mm: pad(d.getMinutes()),
    ss: pad(d.getSeconds()),
  }

  return pattern.replace(/YYYY|MM|DD|HH|mm|ss/g, (token) => map[token] ?? token)
}

export function estimateReadingTime(text: string, cpm = 400): string {
  const chars = text.replace(/\s+/g, '').length
  const minutes = Math.max(1, Math.round(chars / cpm))
  return minutes <= 1 ? '1 分钟' : `${minutes} 分钟`
}
