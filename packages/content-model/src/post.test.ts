import { describe, expect, it } from 'vitest'
import { postSchema, postInputSchema } from '../src/post'
import { commentCreateSchema } from '../src/comment'
import { siteSettingsSchema, settingFields } from '../src/settings'
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
})

describe('postInputSchema', () => {
  it('defaults status to draft', () => {
    const parsed = postInputSchema.parse({
      slug: 'a-post',
      title: '标题',
    })
    expect(parsed.status).toBe('draft')
    expect(parsed.categoryIds).toEqual([])
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
