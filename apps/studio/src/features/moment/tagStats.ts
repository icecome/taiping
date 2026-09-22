import type { Moment } from '@taiping/content-model/moment'

export interface TagCount {
  name: string
  count: number
}

export function aggregateTags(moments: Moment[]): TagCount[] {
  const map = new Map<string, number>()
  for (const m of moments) {
    for (const t of m.tagNames ?? []) {
      map.set(t, (map.get(t) ?? 0) + 1)
    }
  }
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
}
