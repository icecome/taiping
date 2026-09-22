import { describe, expect, it } from 'vitest'
import {
  isSafeExternalUrl,
  isSafeNavUrl,
  isSafeResourceUrl,
  safeExternalHref,
  safeNavHref,
  safeResourceSrc,
} from '../src/url'
import { momentInputSchema, momentPictureSchema } from '../src/moment'
import { postInputSchema } from '../src/post'
import { siteSettingsSchema } from '../src/settings'

describe('url guards', () => {
  it('isSafeExternalUrl accepts http(s) only', () => {
    expect(isSafeExternalUrl('https://a.example')).toBe(true)
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeExternalUrl('/posts/x')).toBe(false)
  })

  it('isSafeExternalUrl guards empty input', () => {
    expect(isSafeExternalUrl('')).toBe(false)
  })

  it('isSafeResourceUrl allows relative and http(s)', () => {
    expect(isSafeResourceUrl('/uploads/a.png')).toBe(true)
    expect(isSafeResourceUrl('https://cdn.example/a.png')).toBe(true)
    expect(isSafeResourceUrl('//evil.example/a.png')).toBe(false)
    expect(isSafeResourceUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeResourceUrl('data:text/html,x')).toBe(false)
  })

  it('isSafeNavUrl allows relative, http(s), mailto, bare email', () => {
    expect(isSafeNavUrl('/archives')).toBe(true)
    expect(isSafeNavUrl('https://github.com/x')).toBe(true)
    expect(isSafeNavUrl('mailto:a@b.com')).toBe(true)
    expect(isSafeNavUrl('a@b.com')).toBe(true)
    expect(isSafeNavUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeNavUrl('//evil.example')).toBe(false)
  })

  it('render helpers drop unsafe values', () => {
    expect(safeExternalHref('javascript:x')).toBeUndefined()
    expect(safeExternalHref('https://ok.example')).toBe('https://ok.example')
    expect(safeResourceSrc('javascript:x')).toBeUndefined()
    expect(safeResourceSrc('/img.png')).toBe('/img.png')
    expect(safeNavHref('vbscript:x')).toBeUndefined()
  })
})

describe('schema url constraints', () => {
  it('rejects unsafe moment link and picture', () => {
    expect(
      momentInputSchema.safeParse({
        contentMd: 'hi',
        linkUrl: 'javascript:alert(1)',
      }).success,
    ).toBe(false)
    expect(
      momentPictureSchema.safeParse({ url: 'javascript:alert(1)' }).success,
    ).toBe(false)
    expect(momentPictureSchema.safeParse({ url: 'https://cdn.example/a.png' }).success).toBe(true)
  })

  it('rejects unsafe post cover', () => {
    expect(
      postInputSchema.safeParse({
        slug: 'a-post',
        title: 't',
        cover: 'javascript:alert(1)',
      }).success,
    ).toBe(false)
    expect(
      postInputSchema.safeParse({
        slug: 'a-post',
        title: 't',
        cover: '/uploads/cover.png',
      }).success,
    ).toBe(true)
  })

  it('rejects unsafe navigation url', () => {
    expect(
      siteSettingsSchema.safeParse({
        navigation: [{ name: 'x', url: 'javascript:alert(1)' }],
      }).success,
    ).toBe(false)
  })
})
