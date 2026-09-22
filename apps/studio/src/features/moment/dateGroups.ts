import type { Moment } from '@taiping/content-model/moment'
import { shanghaiDateKey } from '@taiping/shared-utils/date'

export interface DateGroup {
  key: string
  label: string
  date: string
  items: Moment[]
}

export function getDateKey(iso: string): string {
  return shanghaiDateKey(iso)
}

export function isToday(dateStr: string): boolean {
  return dateStr === shanghaiDateKey(new Date())
}

export function isYesterday(dateStr: string): boolean {
  return dateStr === shanghaiDateKey(Date.now() - 24 * 60 * 60 * 1000)
}

export function groupMomentsByDate(moments: Moment[]): DateGroup[] {
  const map = new Map<string, DateGroup>()
  for (const m of moments) {
    const key = getDateKey(m.createdAt)
    if (!map.has(key)) {
      let label = key
      if (isToday(key)) label = `今天 · ${key}`
      else if (isYesterday(key)) label = `昨天 · ${key}`
      map.set(key, { key, label, date: key, items: [] })
    }
    map.get(key)!.items.push(m)
  }
  return Array.from(map.values()).sort((a, b) => (a.date < b.date ? 1 : -1))
}
