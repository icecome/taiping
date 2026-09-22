import { describe, expect, it } from 'vitest'
import { countWords, readingTimeLabel } from '../src/reading-time'
import { slugify } from '../src/slug'
import { excerptOf } from '../src/string'

describe('reading-time', () => {
  it('counts cjk characters', () => {
    expect(countWords('你好世界')).toBe(4)
  })

  it('returns chinese level labels', () => {
    expect(readingTimeLabel('短')).toBe('弹指可览')
    const long = '字'.repeat(30000)
    expect(readingTimeLabel(long)).toBe('细品慢读')
  })
})

describe('slug', () => {
  it('slugifies mixed text', () => {
    expect(slugify('Hello World 你好')).toMatch(/hello-world/)
  })
})

describe('string', () => {
  it('builds excerpt', () => {
    const text = '# Title\n\n' + 'a'.repeat(300)
    const excerpt = excerptOf(text, 50)
    expect(excerpt.length).toBeLessThanOrEqual(50)
  })
})
