import { describe, expect, it } from 'vitest'
import { renderMarkdownSafe, deriveExcerpt, extractHeadings } from '../src/markdown'
import { paginate, findPrevNext } from '../src/derive'
import type { Post } from '@taiping/content-model/post'

describe('markdown', () => {
  it('renders basic markdown', () => {
    const html = renderMarkdownSafe('# Hello\n\n**bold**')
    expect(html).toContain('<h1')
    expect(html).toContain('<strong>bold</strong>')
  })

  it('extracts headings with anchor ids', () => {
    const html = renderMarkdownSafe('# 标题一\n\n## Section Two\n\ntext')
    const headings = extractHeadings(html)
    expect(headings.length).toBe(2)
    expect(headings[0]?.level).toBe(1)
    expect(headings[0]?.text).toBe('标题一')
    expect(headings[0]?.id).toBeTruthy()
    expect(headings[1]?.level).toBe(2)
    expect(headings[1]?.id).toBe('section-two')
  })

  it('strips script tags', () => {
    const html = renderMarkdownSafe('<script>alert(1)</script>ok')
    expect(html).not.toContain('<script')
    expect(html).toContain('ok')
  })

  it('strips event handler attributes', () => {
    const html = renderMarkdownSafe('<img src="x" onerror="alert(1)">')
    expect(html).not.toContain('onerror')
  })

  it('never emits a javascript: href', () => {
    // markdown-it 拒绝 linkify javascript:，整段退化为纯文本，不产生 <a href>
    const html = renderMarkdownSafe('[x](javascript:alert(1))')
    expect(html).not.toContain('href="javascript:')
    expect(html).not.toContain('<a ')
  })

  it('strips javascript: hrefs written as raw html', () => {
    const html = renderMarkdownSafe('<a href="javascript:alert(1)">x</a>')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('<a')
  })

  it('drops input tags and data-* attributes', () => {
    const html = renderMarkdownSafe('<input type="text"><div data-foo="bar">x</div>')
    expect(html).not.toContain('<input')
    expect(html).not.toContain('data-foo')
  })

  it('keeps details/summary for task lists', () => {
    const html = renderMarkdownSafe('<details><summary>more</summary>body</details>')
    expect(html).toContain('<details')
    expect(html).toContain('<summary')
  })

  it('derives excerpt', () => {
    expect(deriveExcerpt('你好世界测试摘要')).toContain('你好')
  })
})

describe('paginate', () => {
  it('pages items', () => {
    const items = Array.from({ length: 25 }, (_, i) => i)
    const page1 = paginate(items, 1, 10)
    expect(page1.items).toHaveLength(10)
    expect(page1.totalPages).toBe(3)
  })
})

describe('findPrevNext', () => {
  const base = {
    contentMd: '',
    contentHtml: '',
    status: 'published' as const,
    type: 'post' as const,
    sortOrder: 0,
    encrypt: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
  const posts: Post[] = [
    { ...base, id: '1', slug: 'old', title: 'Old', publishedAt: '2026-01-01T00:00:00.000Z' },
    { ...base, id: '2', slug: 'mid', title: 'Mid', publishedAt: '2026-02-01T00:00:00.000Z' },
    { ...base, id: '3', slug: 'new', title: 'New', publishedAt: '2026-03-01T00:00:00.000Z' },
  ]

  it('returns neighbors', () => {
    const { prev, next } = findPrevNext(posts, '2')
    expect(prev?.slug).toBe('new')
    expect(next?.slug).toBe('old')
  })
})
