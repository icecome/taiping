export function nowIso(): string {
  return new Date().toISOString()
}

export function formatDate(iso: string | null | undefined, pattern = 'YYYY-MM-DD'): string {
  if (!iso) return ''
  const p = shanghaiParts(iso)
  if (!p) return ''
  return pattern
    .replace('YYYY', String(p.year))
    .replace('MM', pad2(p.month))
    .replace('DD', pad2(p.day))
    .replace('HH', pad2(p.hours))
    .replace('mm', pad2(p.minutes))
}

export function formatDateTime(iso: string | null | undefined): string {
  return formatDate(iso, 'YYYY-MM-DD HH:mm')
}

export function yearOf(iso: string | null | undefined): number {
  const p = shanghaiParts(iso ?? '')
  return p ? p.year : 0
}

export function monthOf(iso: string | null | undefined): string {
  return formatDate(iso, 'YYYY-MM')
}

/** 展示日历日固定按 Asia/Shanghai（UTC+8）；存储侧保持 UTC 不变 */
export const SHANGHAI_UTC_OFFSET_MIN = 8 * 60

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export interface ShanghaiParts {
  year: number
  month: number
  day: number
  hours: number
  minutes: number
}

export function shanghaiParts(input: string | number | Date): ShanghaiParts | null {
  const d = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(d.getTime())) return null
  const shifted = new Date(d.getTime() + SHANGHAI_UTC_OFFSET_MIN * 60_000)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hours: shifted.getUTCHours(),
    minutes: shifted.getUTCMinutes(),
  }
}

export function shanghaiDateKey(input: string | number | Date): string {
  const p = shanghaiParts(input)
  if (!p) return ''
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`
}

export function shanghaiTimeHm(input: string | number | Date): string {
  const p = shanghaiParts(input)
  if (!p) return ''
  return `${pad2(p.hours)}:${pad2(p.minutes)}`
}

/** 墙钟日历日 key，避免 Date.toISOString() 再偏移 */
export function calendarDateKey(year: number, month1: number, day: number): string {
  return `${year}-${pad2(month1)}-${pad2(day)}`
}

/** 周一为一周第一天：0=周一 … 6=周日（日历日与时区无关，用 UTC 午夜取星期） */
export function calendarWeekdayMondayFirst(year: number, month0: number, day: number): number {
  return (new Date(Date.UTC(year, month0, day)).getUTCDay() + 6) % 7
}
