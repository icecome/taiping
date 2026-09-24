import { describe, expect, it } from 'vitest'
import type { D1Database } from '@cloudflare/workers-types'
import { rowToPost } from './posts'

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

const rawRow = {
  id: 'post_1',
  slug: 'hello',
  type: 'post' as const,
  title: 'Hello',
  status: 'published' as const,
  head_revision_id: 'rev_2',
  release_revision_id: 'rev_1',
  deleted_at: null,
  published_at: '2026-09-21T01:00:00.000Z',
  template: null,
  sort_order: 0,
  encrypt: 0,
  encrypt_password_hash: null,
  encrypt_hint: null,
  encrypt_title: null,
  encrypt_message: null,
  created_at: '2026-09-21T01:00:00.000Z',
  updated_at: '2026-09-21T01:00:00.000Z',
  rev_id: 'rev_2',
  content_md: '# 正文内容',
  content_html: '<h1>正文内容</h1>',
  excerpt: null,
  cover: 'https://img.example.com/a.png',
  reading_time: null,
}

describe('rowToPost', () => {
  it('maps joined revision fields to camelCase', () => {
    const post = rowToPost(rawRow)
    expect(post.publishedAt).toBe('2026-09-21T01:00:00.000Z')
    expect(post.contentMd).toBe('# 正文内容')
    expect(post.contentHtml).toBe('<h1>正文内容</h1>')
    expect(post.cover).toBe('https://img.example.com/a.png')
    expect(post.headRevisionId).toBe('rev_2')
    expect(post.releaseRevisionId).toBe('rev_1')
  })

  it('flags inProgress when head differs from release', () => {
    expect(rowToPost(rawRow).inProgress).toBe(true)
    expect(rowToPost({ ...rawRow, head_revision_id: 'rev_1', rev_id: 'rev_1' }).inProgress).toBe(false)
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
    expect(rowToPost({ ...rawRow, deleted_at: '2026-09-22T00:00:00.000Z' }).deletedAt).toBe(
      '2026-09-22T00:00:00.000Z',
    )
  })
})

describe('listPostsByTermSlug mapping contract', () => {
  it('produces camelCase fields consumed by theme cards', async () => {
    const { listPostsByTermSlug } = await import('./terms')
    const db = createRowsDb([rawRow])
    const posts = await listPostsByTermSlug(db, 'category', 'tech')
    expect(posts[0]?.publishedAt).toBe('2026-09-21T01:00:00.000Z')
    expect(posts[0]?.contentMd).toBe('# 正文内容')
  })
})
