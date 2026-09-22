import { describe, expect, it } from 'vitest'
import type { D1Database } from '@cloudflare/workers-types'
import { rowToPost, type PostRow } from './posts'

function createRowsDb(rows: unknown[]): D1Database {
  const db = {
    prepare() {
      return {
        bind() {
          return {
            async all() {
              return { results: rows }
            },
          }
        },
      }
    },
  }
  return db as unknown as D1Database
}

const rawRow: PostRow = {
  id: 'post_1',
  slug: 'hello',
  type: 'post',
  title: 'Hello',
  content_md: '# 正文内容',
  content_html: '<h1>正文内容</h1>',
  excerpt: null,
  cover: 'https://img.example.com/a.png',
  status: 'published',
  published_at: '2026-09-21T01:00:00.000Z',
  reading_time: null,
  template: null,
  sort_order: 0,
  encrypt: 0,
  encrypt_password_hash: null,
  encrypt_hint: null,
  encrypt_title: null,
  encrypt_message: null,
  created_at: '2026-09-21T01:00:00.000Z',
  updated_at: '2026-09-21T01:00:00.000Z',
}

describe('rowToPost', () => {
  it('maps snake_case columns to camelCase fields', () => {
    const post = rowToPost(rawRow)
    expect(post.publishedAt).toBe('2026-09-21T01:00:00.000Z')
    expect(post.contentMd).toBe('# 正文内容')
    expect(post.contentHtml).toBe('<h1>正文内容</h1>')
    expect(post.cover).toBe('https://img.example.com/a.png')
    expect(post.sortOrder).toBe(0)
  })

  it('converts encrypt flag to boolean', () => {
    expect(rowToPost(rawRow).encrypt).toBe(false)
    expect(rowToPost({ ...rawRow, encrypt: 1 }).encrypt).toBe(true)
  })

  it('omits null optionals instead of leaking null', () => {
    const post = rowToPost(rawRow)
    expect(post.excerpt).toBeUndefined()
    expect(post.publishedAt).toBeDefined()
    expect(rowToPost({ ...rawRow, published_at: null }).publishedAt).toBeUndefined()
  })
})

describe('listPostsByTermSlug mapping contract', () => {
  it('produces camelCase fields consumed by theme cards', async () => {
    const { listPostsByTermSlug } = await import('./terms')
    const db = createRowsDb([rawRow])
    const posts = await listPostsByTermSlug(db, 'category', 'tech')
    // 回归保护：修复前此处返回 snake_case 原始行，publishedAt/contentMd 均为 undefined
    expect(posts[0]?.publishedAt).toBe('2026-09-21T01:00:00.000Z')
    expect(posts[0]?.contentMd).toBe('# 正文内容')
  })
})
