import type { Moment } from '@taiping/content-model/moment'
import {
  calendarDateKey,
  calendarWeekdayMondayFirst,
  shanghaiDateKey,
} from '@taiping/shared-utils/date'
import { getDateKey } from './dateGroups'

export interface CalendarCell {
  day: number | null
  count: number
  isToday: boolean
  dateKey: string
}

export function buildCalendarCells(
  year: number,
  month: number,
  moments: Moment[],
): CalendarCell[] {
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const firstWeekday = calendarWeekdayMondayFirst(year, month, 1)

  const countMap = new Map<string, number>()
  for (const m of moments) {
    const key = getDateKey(m.createdAt)
    countMap.set(key, (countMap.get(key) ?? 0) + 1)
  }

  const todayKey = shanghaiDateKey(new Date())
  const cells: CalendarCell[] = []

  for (let i = 0; i < firstWeekday; i++) {
    cells.push({ day: null, count: 0, isToday: false, dateKey: '' })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const key = calendarDateKey(year, month + 1, d)
    cells.push({
      day: d,
      count: countMap.get(key) ?? 0,
      isToday: key === todayKey,
      dateKey: key,
    })
  }
  while (cells.length % 7 !== 0) {
    cells.push({ day: null, count: 0, isToday: false, dateKey: '' })
  }
  return cells
}

export function getHeatColorClass(count: number): string {
  if (count === 0) return 'bg-secondary text-muted-foreground'
  if (count === 1) return 'bg-primary-200 text-foreground'
  if (count === 2) return 'bg-primary-300 text-foreground'
  if (count <= 4) return 'bg-primary-400 text-primary-foreground'
  return 'bg-primary-500 text-primary-foreground'
}
