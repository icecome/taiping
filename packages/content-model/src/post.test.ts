import { describe, expect, it } from 'vitest'
import { postSchema, postInputSchema, postRevisionSchema } from '../src/post'
import { commentCreateSchema } from '../src/comment'
import {
  siteSettingsSchema,
  settingFields,
  parseSiteSettings,
  defaultSettings,
  mediaStorageConfigSchema,
} from '../src/settings'
import { ok, fail } from '../src/api'

describe('postSchema', () => {
  it('accepts a valid post', () => {
    const parsed = postSchema.parse({
      id: 'p1',
      slug: 'hello-world',
      type: 'post',
      title: '你好',
      contentMd: '# hi',
      contentHtml: '',
      status: 'published',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    expect(parsed.slug).toBe('hello-world')
    expect(parsed.inProgress).toBe(false)
  })

  it('rejects invalid slug', () => {
    const result = postSchema.safeParse({
      id: 'p1',
      slug: 'Hello World',
      type: 'post',
      title: 'x',
      contentMd: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    expect(result.success).toBe(false)
  })

  it('marks inProgress when head differs from release', () => {
    const parsed = postSchema.parse({
      id: 'p1',
      slug: 'a',
      type: 'post',
      title: 't',
      headRevisionId: 'rev_2',
      releaseRevisionId: 'rev_1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    expect(parsed.inProgress).toBe(true)
  })
})

describe('postInputSchema', () => {
  it('slug is optional and defaults content lists', () => {
    const parsed = postInputSchema.parse({
      title: '标题',
    })
    expect(parsed.slug).toBeUndefined()
    expect(parsed.contentMd).toBe('')
    expect(parsed.categoryIds).toEqual([])
    expect(parsed.tagNames).toEqual([])
  })

  it('rejects unicode slug', () => {
    expect(
      postInputSchema.safeParse({ title: 't', slug: '你好' }).success,
    ).toBe(false)
    expect(
      postInputSchema.safeParse({ title: 't', slug: 'hello-world' }).success,
    ).toBe(true)
  })
})

describe('postRevisionSchema', () => {
  it('accepts snapshot payload', () => {
    const parsed = postRevisionSchema.parse({
      id: 'rev_1',
      postId: 'p1',
      contentMd: '# x',
      createdAt: new Date().toISOString(),
    })
    expect(parsed.contentHtml).toBe('')
  })
})

describe('commentCreateSchema', () => {
  it('requires nickname and content', () => {
    const result = commentCreateSchema.safeParse({
      targetType: 'guestbook',
      targetId: 'guestbook',
      nickname: '',
      content: '',
    })
    expect(result.success).toBe(false)
  })
})

describe('siteSettingsSchema', () => {
  it('provides default navigation', () => {
    const parsed = siteSettingsSchema.parse({})
    expect(parsed.navigation.some((item) => item.name === '说说')).toBe(true)
    expect(parsed.archiveGroupBy).toBe('year')
  })

  it('includes comment moderation defaults', () => {
    const parsed = siteSettingsSchema.parse({})
    expect(parsed.commentsRequireModeration).toBe(true)
    expect(parsed.commentsWhitelist).toBe(true)
    expect(parsed.commentsPostInterval).toBe(60)
    expect(settingFields.some((f) => f.name === 'commentsRequireModeration')).toBe(true)
  })

  it('clamps out-of-range numeric fields', () => {
    const parsed = siteSettingsSchema.parse({
      postsPerPage: 999,
      commentsPostInterval: -5,
    })
    expect(parsed.postsPerPage).toBe(50)
    expect(parsed.commentsPostInterval).toBe(0)

    const quality = mediaStorageConfigSchema.parse({
      id: 'x',
      name: 'n',
      quality: 5,
    })
    expect(quality.quality).toBe(10)
  })
})

describe('parseSiteSettings', () => {
  it('recovers from dirty fields without throwing', () => {
    const parsed = parseSiteSettings({
      title: '正常标题',
      postsPerPage: 1000,
      navigation: 'not-an-array',
      unknownKey: true,
    })
    expect(parsed.title).toBe('正常标题')
    expect(parsed.postsPerPage).toBe(50)
    expect(parsed.navigation).toEqual(defaultSettings.navigation)
  })

  it('falls back to defaults for non-object input', () => {
    expect(parseSiteSettings(null)).toEqual(defaultSettings)
    expect(parseSiteSettings('oops')).toEqual(defaultSettings)
  })
})

describe('api envelope', () => {
  it('builds ok response', () => {
    expect(ok({ a: 1 })).toEqual({ ok: true, data: { a: 1 } })
  })

  it('builds fail response', () => {
    expect(fail('NOT_FOUND', '不存在')).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: '不存在' },
    })
  })
})
