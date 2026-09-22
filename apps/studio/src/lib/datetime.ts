export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** 将表单值转为 ISO；已是带时区的 ISO 则原样返回 */
export function toIso(value: unknown): string | undefined {
  if (!value || typeof value !== 'string') return undefined
  if (value.includes('T') && (value.endsWith('Z') || value.includes('+'))) return value
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

/** ISO → datetime-local（YYYY-MM-DDTHH:mm，本地时区） */
export function toDatetimeLocal(value: string | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}
