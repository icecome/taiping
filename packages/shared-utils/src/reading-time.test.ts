import { describe, expect, it } from 'vitest'
import { countWords, readingTimeLabel } from '../src/reading-time'
import {
  slugify,
  isValidSlug,
  SLUG_MAX_LEN,
  slugWithSuffix,
  fallbackSlug,
  chineseToPinyinSlug,
} from '../src/slug'
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
  it('maps Chinese titles to pinyin from first 4 chars', () => {
    expect(chineseToPinyinSlug('测试文章标题')).toBe('ce-shi-wen-zhang')
    expect(chineseToPinyinSlug('太皮博客发布流程')).toBe('tai-pi-bo-ke')
    expect(slugify('测试')).toBe('ce-shi')
    expect(slugify('太皮博客')).toBe('tai-pi-bo-ke')
    expect(isValidSlug(slugify('测试文章'))).toBe(true)
  })

  it('keeps ascii slug for latin titles', () => {
    expect(slugify('My Post')).toBe('my-post')
    expect(slugWithSuffix('hello', 2)).toBe('hello-2')
  })

  it('prefers pinyin when title contains CJK', () => {
    expect(slugify('Hello 你好')).toBe('ni-hao')
  })

  it('falls back to readable date slug when no latin and no cjk syllable', () => {
    const s = slugify('   ')
    expect(s).toMatch(/^post-\d{8}-[a-z0-9]{4}$/)
    expect(isValidSlug(s)).toBe(true)
    expect(isValidSlug(fallbackSlug('page'))).toBe(true)
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
