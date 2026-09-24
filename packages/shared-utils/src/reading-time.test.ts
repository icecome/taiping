import { describe, expect, it } from 'vitest'
import { countWords, readingTimeLabel } from '../src/reading-time'
import { slugify, isValidSlug, SLUG_MAX_LEN, slugWithSuffix } from '../src/slug'
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
  it('slugifies to ascii only', () => {
    expect(slugify('Hello World 你好')).toBe('hello-world')
    expect(slugify('My Post')).toBe('my-post')
    expect(isValidSlug(slugify('太皮博客'))).toBe(true)
    expect(slugWithSuffix('hello', 2)).toBe('hello-2')
  })

  it('enforces max length 80', () => {
    const long = 'a'.repeat(200)
    expect(slugify(long).length).toBeLessThanOrEqual(SLUG_MAX_LEN)
    expect(isValidSlug('a'.repeat(80))).toBe(true)
    expect(isValidSlug('a'.repeat(81))).toBe(false)
    expect(isValidSlug('Hello')).toBe(false)
  })
})

describe('string', () => {
  it('builds excerpt', () => {
    const text = '# Title\n\n' + 'a'.repeat(300)
    const excerpt = excerptOf(text, 50)
    expect(excerpt.length).toBeLessThanOrEqual(50)
  })
})
