import { describe, expect, it } from 'vitest'
import { toIso, toDatetimeLocal, pad2 } from '../lib/datetime'

describe('datetime', () => {
  it('keeps timezone-aware ISO', () => {
    const iso = '2026-09-21T01:00:00.000Z'
    expect(toIso(iso)).toBe(iso)
  })

  it('parses datetime-local and invalid values', () => {
    expect(toIso('not-a-date')).toBeUndefined()
    expect(toIso('')).toBeUndefined()
    expect(toDatetimeLocal('')).toBe('')
    expect(toDatetimeLocal('bad')).toBe('')
    expect(pad2(3)).toBe('03')
    expect(toDatetimeLocal('2026-09-21T01:00:00.000Z')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  })
})
