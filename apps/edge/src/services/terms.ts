import type { D1Database } from '@cloudflare/workers-types'
import type { Term, TermInput } from '@taiping/content-model/term'
import type { Post } from '@taiping/content-model/post'
import { newId } from '../lib/cache'
import { enqueueMirror } from '../lib/mirror'
import { rowToPost, type PostRow } from './posts'
import { slugify } from '@taiping/shared-utils'

interface TermRow {
  id: string
  type: 'category' | 'tag'
  name: string
  slug: string
}

function rowToTerm(row: TermRow): Term {
  return { id: row.id, type: row.type, name: row.name, slug: row.slug }
}

export async function listTerms(db: D1Database, type?: 'category' | 'tag'): Promise<Term[]> {
  const rows = type
    ? await db.prepare('SELECT * FROM terms WHERE type = ? ORDER BY name').bind(type).all<TermRow>()
    : await db.prepare('SELECT * FROM terms ORDER BY type, name').all<TermRow>()
  return rows.results.map(rowToTerm)
}

/** 分类/标签列表 + 已发布文章数（单条聚合，避免 N+1） */
export async function listTermsWithCounts(
  db: D1Database,
  type: 'category' | 'tag',
): Promise<Array<Term & { count: number }>> {
  const rows = await db
    .prepare(
      `SELECT t.id, t.type, t.name, t.slug, COUNT(p.id) AS count
       FROM terms t
       LEFT JOIN post_terms pt ON pt.term_id = t.id
       LEFT JOIN posts p ON p.id = pt.post_id AND p.status = 'published'
       WHERE t.type = ?
       GROUP BY t.id
       ORDER BY t.name`,
    )
    .bind(type)
    .all<TermRow & { count: number }>()
  return rows.results.map((row) => ({ ...rowToTerm(row), count: row.count }))
}

export async function createTerm(db: D1Database, input: TermInput): Promise<Term> {
  const slug = input.slug || slugify(input.name, 'term')
  const existing = await db
    .prepare('SELECT * FROM terms WHERE type = ? AND slug = ?')
    .bind(input.type, slug)
    .first<TermRow>()
  if (existing) {
    throw Object.assign(new Error('term already exists'), { code: 'CONFLICT' })
  }
  const id = newId('term')
  await db
    .prepare('INSERT INTO terms (id, type, name, slug) VALUES (?, ?, ?, ?)')
    .bind(id, input.type, input.name, slug)
    .run()
  await enqueueMirror(db, 'term', id, 'upsert')
  return { id, type: input.type, name: input.name, slug }
}

export async function updateTerm(
  db: D1Database,
  id: string,
  input: { name?: string; slug?: string },
): Promise<Term> {
  const existing = await db.prepare('SELECT * FROM terms WHERE id = ?').bind(id).first<TermRow>()
  if (!existing) {
    throw Object.assign(new Error('term not found'), { code: 'NOT_FOUND' })
  }
  const name = input.name?.trim() || existing.name
  const nextSlug = input.slug?.trim() || existing.slug
  if (nextSlug !== existing.slug) {
    const dup = await db
      .prepare('SELECT id FROM terms WHERE type = ? AND slug = ? AND id != ? LIMIT 1')
      .bind(existing.type, nextSlug, id)
      .first()
    if (dup) {
      throw Object.assign(new Error('term already exists'), { code: 'CONFLICT' })
    }
  }
  await db
    .prepare('UPDATE terms SET name = ?, slug = ? WHERE id = ?')
    .bind(name, nextSlug, id)
    .run()
  await enqueueMirror(db, 'term', id, 'upsert')
  return { id, type: existing.type, name, slug: nextSlug }
}

export async function deleteTerm(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM terms WHERE id = ?').bind(id).run()
  await enqueueMirror(db, 'term', id, 'delete')
}

export async function listPostsByTermSlug(
  db: D1Database,
  type: 'category' | 'tag',
  slug: string,
): Promise<Post[]> {
  const rows = await db
    .prepare(
      `SELECT p.* FROM posts p
       JOIN post_terms pt ON pt.post_id = p.id
       JOIN terms t ON t.id = pt.term_id
       WHERE t.type = ? AND t.slug = ? AND p.status = 'published'
       ORDER BY COALESCE(p.published_at, p.created_at) DESC`,
    )
    .bind(type, slug)
    .all<PostRow>()
  return rows.results.map(rowToPost)
}

export async function getTermBySlug(db: D1Database, type: 'category' | 'tag', slug: string): Promise<Term | null> {
  const row = await db
    .prepare('SELECT * FROM terms WHERE type = ? AND slug = ?')
    .bind(type, slug)
    .first<TermRow>()
  return row ? rowToTerm(row) : null
}
