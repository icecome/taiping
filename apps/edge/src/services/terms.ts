import type { D1Database } from '@cloudflare/workers-types'
import type { Term, TermInput } from '@taiping/content-model/term'
import type { Post } from '@taiping/content-model/post'
import { newId } from '../lib/cache'
import { bumpCacheVersion } from '../lib/cache'
import { enqueueMirror } from '../lib/mirror'
import { rowToPost, type PostRow } from './posts'

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

export async function createTerm(db: D1Database, input: TermInput): Promise<Term> {
  const slug =
    input.slug ||
    input.name
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '') ||
    `term-${Date.now().toString(36)}`
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
  await bumpCacheVersion(db, 'config')
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
  await bumpCacheVersion(db, 'config')
  return { id, type: existing.type, name, slug: nextSlug }
}

export async function deleteTerm(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM terms WHERE id = ?').bind(id).run()
  await enqueueMirror(db, 'term', id, 'delete')
  await bumpCacheVersion(db, 'config')
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
