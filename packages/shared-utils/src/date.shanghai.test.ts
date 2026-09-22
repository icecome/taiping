import { describe, expect, it } from 'vitest'
import {
  calendarDateKey,
  calendarWeekdayMondayFirst,
  formatDate,
  formatDateTime,
  monthOf,
  shanghaiDateKey,
  shanghaiTimeHm,
  yearOf,
} from '../src/date'

describe('shanghai calendar helpers', () => {
  it('maps UTC evening to next Shanghai calendar day', () => {
    // 2026-09-20T17:00:00Z → 上海 2026-09-21 01:00
    expect(shanghaiDateKey('2026-09-20T17:00:00.000Z')).toBe('2026-09-21')
    expect(shanghaiTimeHm('2026-09-20T17:00:00.000Z')).toBe('01:00')
  })

  it('keeps same-day key for Shanghai morning stored as UTC previous day', () => {
    // 上海 2026-09-21 09:00 = UTC 2026-09-21T01:00:00Z
    expect(shanghaiDateKey('2026-09-21T01:00:00.000Z')).toBe('2026-09-21')
  })

  it('builds calendar keys without timezone shift', () => {
    expect(calendarDateKey(2026, 9, 21)).toBe('2026-09-21')
  })

  it('treats 2026-09-21 as Monday-first index 0', () => {
    // 2026-09-21 is a Monday
    expect(calendarWeekdayMondayFirst(2026, 8, 21)).toBe(0)
  })
})

describe('formatDate uses Asia/Shanghai regardless of host timezone', () => {
  it('formats a UTC instant as Shanghai wall clock', () => {
    // UTC 01:00 → 上海 09:00，与宿主机时区无关
    expect(formatDate('2026-09-21T01:00:00.000Z')).toBe('2026-09-21')
    expect(formatDateTime('2026-09-21T01:00:00.000Z')).toBe('2026-09-21 09:00')
  })

  it('rolls the date over at Shanghai midnight, not UTC midnight', () => {
    // UTC 2026-09-20 17:00 → 上海 2026-09-21 01:00
    expect(formatDate('2026-09-20T17:00:00.000Z')).toBe('2026-09-21')
  })

  it('derives month and year keys in Shanghai time', () => {
    // UTC 2025-12-31 17:00 → 上海 2026-01-01
    expect(monthOf('2025-12-31T17:00:00.000Z')).toBe('2026-01')
    expect(yearOf('2025-12-31T17:00:00.000Z')).toBe(2026)
  })

  it('returns empty for invalid input', () => {
    expect(formatDate('')).toBe('')
    expect(formatDate(null)).toBe('')
    expect(formatDate('not-a-date')).toBe('')
    expect(yearOf('not-a-date')).toBe(0)
  })
})
