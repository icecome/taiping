import { describe, expect, it } from 'vitest'
import { commentCreateSchema, isSafeExternalUrl } from '../src/comment'

const base = {
  targetType: 'guestbook' as const,
  targetId: 'guestbook',
  nickname: '读者',
  content: '你好',
}

describe('isSafeExternalUrl', () => {
  it('accepts http and https', () => {
    expect(isSafeExternalUrl('https://blog.example.com')).toBe(true)
    expect(isSafeExternalUrl('http://blog.example.com')).toBe(true)
  })

  it('rejects dangerous schemes', () => {
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeExternalUrl('JavaScript:alert(1)')).toBe(false)
    expect(isSafeExternalUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
    expect(isSafeExternalUrl('vbscript:msgbox(1)')).toBe(false)
  })

  it('rejects relative and scheme-less input', () => {
    expect(isSafeExternalUrl('/posts/hello')).toBe(false)
    expect(isSafeExternalUrl('blog.example.com')).toBe(false)
    expect(isSafeExternalUrl('')).toBe(false)
  })
})

describe('commentCreateSchema website', () => {
  it('accepts a valid https url', () => {
    const parsed = commentCreateSchema.safeParse({
      ...base,
      website: 'https://blog.example.com',
    })
    expect(parsed.success).toBe(true)
  })

  it('accepts an empty website', () => {
    expect(commentCreateSchema.safeParse({ ...base, website: '' }).success).toBe(true)
    expect(commentCreateSchema.safeParse(base).success).toBe(true)
  })

  it('rejects javascript: scheme', () => {
    const parsed = commentCreateSchema.safeParse({
      ...base,
      website: 'javascript:alert(document.cookie)',
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects data: scheme', () => {
    const parsed = commentCreateSchema.safeParse({
      ...base,
      website: 'data:text/html,<script>alert(1)</script>',
    })
    expect(parsed.success).toBe(false)
  })
})
