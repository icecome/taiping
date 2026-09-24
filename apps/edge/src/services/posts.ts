import type { D1Database } from '@cloudflare/workers-types'
import type { Post, PostInput, PostListQuery, PostRevision } from '@taiping/content-model/post'
import type { Paginated } from '@taiping/content-model/api'
import { deriveExcerpt, deriveReadingTime, renderMarkdownSafe } from '@taiping/renderer/markdown'
import { nowIso, slugify, slugWithSuffix } from '@taiping/shared-utils'
import { newId } from '../lib/cache'
import { enqueueMirror } from '../lib/mirror'
import { hashPassword } from '../lib/crypto'

export interface PostMetaRow {
  id: string
  slug: string
  type: 'post' | 'page'
  title: string
  status: 'draft' | 'published'
  head_revision_id: string | null
  release_revision_id: string | null
  deleted_at: string | null
  published_at: string | null
  template: string | null
  sort_order: number
  encrypt: number
  encrypt_password_hash: string | null
  encrypt_hint: string | null
  encrypt_title: string | null
  encrypt_message: string | null
  created_at: string
  updated_at: string
}

export interface RevisionRow {
  id: string
  post_id: string
  content_md: string
  content_html: string
  excerpt: string | null
  cover: string | null
  reading_time: string | null
  created_at: string
}

type JoinedRow = PostMetaRow & {
  rev_id: string | null
  content_md: string | null
  content_html: string | null
  excerpt: string | null
  cover: string | null
  reading_time: string | null
}

function rowToRevision(row: RevisionRow): PostRevision {
  return {
    id: row.id,
    postId: row.post_id,
    contentMd: row.content_md,
    contentHtml: row.content_html,
    excerpt: row.excerpt ?? undefined,
    cover: row.cover ?? undefined,
    readingTime: row.reading_time ?? undefined,
    createdAt: row.created_at,
  }
}

export function rowToPost(row: JoinedRow): Post {
  const headRevisionId = row.head_revision_id ?? undefined
  const releaseRevisionId = row.release_revision_id ?? undefined
  return {
    id: row.id,
    slug: row.slug,
    type: row.type,
    title: row.title,
    status: row.status,
    headRevisionId,
    releaseRevisionId,
    inProgress: Boolean(headRevisionId && releaseRevisionId && headRevisionId !== releaseRevisionId),
    deletedAt: row.deleted_at ?? undefined,
    publishedAt: row.published_at ?? undefined,
    contentMd: row.content_md ?? '',
    contentHtml: row.content_html ?? '',
    excerpt: row.excerpt ?? undefined,
    cover: row.cover ?? undefined,
    readingTime: row.reading_time ?? undefined,
    template: row.template ?? undefined,
    sortOrder: row.sort_order,
    encrypt: row.encrypt === 1,
    encryptPasswordHash: row.encrypt_password_hash ?? undefined,
    encryptHint: row.encrypt_hint ?? undefined,
    encryptTitle: row.encrypt_title ?? undefined,
    encryptMessage: row.encrypt_message ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const META_COLS = `p.id, p.slug, p.type, p.title, p.status, p.head_revision_id, p.release_revision_id,
  p.deleted_at, p.published_at, p.template, p.sort_order, p.encrypt, p.encrypt_password_hash,
  p.encrypt_hint, p.encrypt_title, p.encrypt_message, p.created_at, p.updated_at`

function joinSql(pointer: 'head' | 'release'): string {
  const col = pointer === 'head' ? 'p.head_revision_id' : 'p.release_revision_id'
  return `SELECT ${META_COLS},
    r.id as rev_id, r.content_md, r.content_html, r.excerpt, r.cover, r.reading_time
    FROM posts p
    LEFT JOIN post_revisions r ON r.id = ${col}`
}

async function getRevision(db: D1Database, id: string): Promise<PostRevision | null> {
  const row = await db.prepare('SELECT * FROM post_revisions WHERE id = ?').bind(id).first<RevisionRow>()
  return row ? rowToRevision(row) : null
}

async function insertRevision(
  db: D1Database,
  postId: string,
  content: {
    contentMd: string
    contentHtml: string
    excerpt?: string
    cover?: string
    readingTime?: string
  },
): Promise<string> {
  const id = newId('rev')
  const now = nowIso()
  await db
    .prepare(
      `INSERT INTO post_revisions (id, post_id, content_md, content_html, excerpt, cover, reading_time, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      postId,
      content.contentMd,
      content.contentHtml,
      content.excerpt ?? null,
      content.cover ?? null,
      content.readingTime ?? null,
      now,
    )
    .run()
  return id
}

function buildContent(input: {
  contentMd: string
  excerpt?: string
  cover?: string
}): { contentMd: string; contentHtml: string; excerpt: string; cover: string | undefined; readingTime: string } {
  const contentMd = input.contentMd ?? ''
  return {
    contentMd,
    contentHtml: renderMarkdownSafe(contentMd),
    excerpt: input.excerpt?.trim() || deriveExcerpt(contentMd),
    cover: input.cover || undefined,
    readingTime: deriveReadingTime(contentMd),
  }
}

/** Typecho 风格：冲突自动 -1/-2 */
async function ensureUniqueSlug(
  db: D1Database,
  desired: string,
  excludeId?: string,
): Promise<string> {
  let candidate = desired
  for (let n = 0; n < 50; n++) {
    const row = await db.prepare('SELECT id FROM posts WHERE slug = ?').bind(candidate).first<{ id: string }>()
    if (!row || row.id === excludeId) return candidate
    candidate = slugWithSuffix(desired, n + 1)
  }
  return slugWithSuffix(desired, Date.now() % 10000)
}

function applyContentFilter(query: PostListQuery): { where: string[]; binds: unknown[] } {
  const where: string[] = []
  const binds: unknown[] = []
  if (query.deleted) {
    where.push('p.deleted_at IS NOT NULL')
  } else {
    where.push('p.deleted_at IS NULL')
  }
  if (query.status) {
    where.push('p.status = ?')
    binds.push(query.status)
  }
  if (query.type) {
    where.push('p.type = ?')
    binds.push(query.type)
  }
  if (query.q) {
    where.push('(p.title LIKE ? OR p.slug LIKE ? OR r.excerpt LIKE ? OR r.content_md LIKE ?)')
    const like = `%${query.q}%`
    binds.push(like, like, like, like)
  }
  return { where, binds }
}

export async function listPosts(
  db: D1Database,
  query: PostListQuery,
): Promise<
  Paginated<Post & { categories: Array<{ id: string; name: string; slug: string }>; tags: Array<{ id: string; name: string; slug: string }> }>
> {
  const { where, binds } = applyContentFilter(query)
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const countRow = await db
    .prepare(`SELECT COUNT(*) as total FROM posts p LEFT JOIN post_revisions r ON r.id = p.head_revision_id ${whereSql}`)
    .bind(...binds)
    .first<{ total: number }>()
  const total = countRow?.total ?? 0
  const offset = (query.page - 1) * query.pageSize
  const rows = await db
    .prepare(
      `${joinSql('head')} ${whereSql}
       ORDER BY COALESCE(p.published_at, p.created_at) DESC, p.sort_order ASC
       LIMIT ? OFFSET ?`,
    )
    .bind(...binds, query.pageSize, offset)
    .all<JoinedRow>()

  const items = await Promise.all(
    rows.results.map(async (row) => {
      const post = rowToPost(row)
      const terms = await getPostTerms(db, post.id)
      return { ...post, ...terms }
    }),
  )
  return { items, total, page: query.page, pageSize: query.pageSize }
}

export async function getPostById(db: D1Database, id: string): Promise<Post | null> {
  const row = await db.prepare(`${joinSql('head')} WHERE p.id = ?`).bind(id).first<JoinedRow>()
  return row ? rowToPost(row) : null
}

export async function getPostBySlug(
  db: D1Database,
  slug: string,
  type?: 'post' | 'page',
  opts: { publishedOnly?: boolean } = {},
): Promise<Post | null> {
  const conds = ['p.slug = ?', 'p.deleted_at IS NULL']
  const binds: unknown[] = [slug]
  if (type) {
    conds.push('p.type = ?')
    binds.push(type)
  }
  if (opts.publishedOnly) {
    conds.push("p.status = 'published'")
    conds.push('p.release_revision_id IS NOT NULL')
    conds.push('(p.published_at IS NULL OR p.published_at <= ?)')
    binds.push(nowIso())
    const row = await db
      .prepare(`${joinSql('release')} WHERE ${conds.join(' AND ')}`)
      .bind(...binds)
      .first<JoinedRow>()
    return row ? rowToPost(row) : null
  }
  const row = await db
    .prepare(`${joinSql('head')} WHERE ${conds.join(' AND ')}`)
    .bind(...binds)
    .first<JoinedRow>()
  return row ? rowToPost(row) : null
}

export async function getPublishedPosts(db: D1Database, type: 'post' | 'page' = 'post'): Promise<Post[]> {
  const rows = await db
    .prepare(
      `${joinSql('release')}
       WHERE p.status = 'published' AND p.deleted_at IS NULL AND p.release_revision_id IS NOT NULL
         AND p.type = ?
         AND (p.published_at IS NULL OR p.published_at <= ?)
       ORDER BY COALESCE(p.published_at, p.created_at) DESC`,
    )
    .bind(type, nowIso())
    .all<JoinedRow>()
  return rows.results.map(rowToPost)
}

export async function getPostTerms(db: D1Database, postId: string) {
  const rows = await db
    .prepare(
      `SELECT t.id, t.name, t.slug, t.type FROM post_terms pt
       JOIN terms t ON t.id = pt.term_id
       WHERE pt.post_id = ?
       ORDER BY t.type, t.name`,
    )
    .bind(postId)
    .all<{ id: string; name: string; slug: string; type: 'category' | 'tag' }>()
  const categories = rows.results.filter((r) => r.type === 'category').map(({ id, name, slug }) => ({ id, name, slug }))
  const tags = rows.results.filter((r) => r.type === 'tag').map(({ id, name, slug }) => ({ id, name, slug }))
  return { categories, tags }
}

async function resolveOrCreateTerms(
  db: D1Database,
  categoryIds: string[],
  tagNames: string[],
): Promise<string[]> {
  const ids: string[] = [...categoryIds]
  for (const name of tagNames) {
    const trimmed = name.trim()
    if (!trimmed) continue
    const existingByName = await db
      .prepare('SELECT id FROM terms WHERE type = ? AND name = ?')
      .bind('tag', trimmed)
      .first<{ id: string }>()
    if (existingByName) {
      ids.push(existingByName.id)
      continue
    }
    let slug = slugify(trimmed, 'tag')
    for (let n = 0; n < 20; n++) {
      const clash = await db
        .prepare('SELECT id FROM terms WHERE type = ? AND slug = ?')
        .bind('tag', slug)
        .first()
      if (!clash) break
      slug = slugWithSuffix(slugify(trimmed, 'tag'), n + 1)
    }
    const id = newId('term')
    await db
      .prepare('INSERT INTO terms (id, type, name, slug) VALUES (?, ?, ?, ?)')
      .bind(id, 'tag', trimmed, slug)
      .run()
    ids.push(id)
  }
  return ids
}

async function syncPostTerms(db: D1Database, postId: string, termIds: string[]): Promise<void> {
  await db.prepare('DELETE FROM post_terms WHERE post_id = ?').bind(postId).run()
  if (!termIds.length) return
  const unique = [...new Set(termIds)]
  const statements = unique.map((termId) =>
    db.prepare('INSERT OR IGNORE INTO post_terms (post_id, term_id) VALUES (?, ?)').bind(postId, termId),
  )
  await db.batch(statements)
}

export async function createPost(db: D1Database, input: PostInput): Promise<Post> {
  const desired = input.slug?.trim() || slugify(input.title, input.type === 'page' ? 'page' : 'post')
  const slug = await ensureUniqueSlug(db, desired)
  const id = newId('post')
  const now = nowIso()
  const content = buildContent(input)
  const passwordHash =
    input.encrypt && input.encryptPassword ? await hashPassword(input.encryptPassword) : null

  // 先插 posts 再插 revision，避免 post_revisions.post_id 外键失败
  await db
    .prepare(
      `INSERT INTO posts (
        id, slug, type, title, head_revision_id, release_revision_id, deleted_at,
        status, published_at, template, sort_order,
        encrypt, encrypt_password_hash, encrypt_hint, encrypt_title, encrypt_message,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, NULL, NULL, NULL, 'draft', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      slug,
      input.type,
      input.title,
      input.template ?? null,
      input.sortOrder,
      input.encrypt ? 1 : 0,
      passwordHash,
      input.encryptHint ?? null,
      input.encryptTitle ?? null,
      input.encryptMessage ?? null,
      now,
      now,
    )
    .run()

  const revId = await insertRevision(db, id, content)
  await db
    .prepare('UPDATE posts SET head_revision_id = ?, updated_at = ? WHERE id = ?')
    .bind(revId, now, id)
    .run()

  const termIds = await resolveOrCreateTerms(db, input.categoryIds, input.tagNames)
  await syncPostTerms(db, id, termIds)
  await enqueueMirror(db, input.type === 'page' ? 'page' : 'post', id, 'upsert')

  const created = await getPostById(db, id)
  if (!created) throw new Error('create post failed')
  return created
}

async function updateMeta(
  db: D1Database,
  id: string,
  input: PostInput,
  headRevisionId: string,
): Promise<void> {
  const now = nowIso()
  const passwordHash = await (async () => {
    const current = await db
      .prepare('SELECT encrypt, encrypt_password_hash FROM posts WHERE id = ?')
      .bind(id)
      .first<{ encrypt: number; encrypt_password_hash: string | null }>()
    if (!input.encrypt) return null
    if (input.encryptPassword) return hashPassword(input.encryptPassword)
    return current?.encrypt_password_hash ?? null
  })()

  await db
    .prepare(
      `UPDATE posts SET
        slug = ?, type = ?, title = ?, head_revision_id = ?,
        template = ?, sort_order = ?,
        encrypt = ?, encrypt_password_hash = ?, encrypt_hint = ?, encrypt_title = ?, encrypt_message = ?,
        updated_at = ?
      WHERE id = ?`,
    )
    .bind(
      input.slug!,
      input.type,
      input.title,
      headRevisionId,
      input.template ?? null,
      input.sortOrder,
      input.encrypt ? 1 : 0,
      passwordHash,
      input.encryptHint ?? null,
      input.encryptTitle ?? null,
      input.encryptMessage ?? null,
      now,
      id,
    )
    .run()
}

export async function updatePost(db: D1Database, id: string, input: PostInput): Promise<Post> {
  const current = await getPostById(db, id)
  if (!current || current.deletedAt) {
    throw Object.assign(new Error('post not found'), { code: 'NOT_FOUND' })
  }

  const desired = input.slug?.trim() || current.slug
  const slug = await ensureUniqueSlug(db, desired, id)
  const content = buildContent(input)

  // 已发布且 head 已是线上版本 → 新开 revision，避免覆盖 release
  const needsNewRev =
    !current.headRevisionId ||
    current.headRevisionId === current.releaseRevisionId ||
    content.contentMd !== current.contentMd ||
    content.contentHtml !== current.contentHtml ||
    content.excerpt !== (current.excerpt ?? '') ||
    content.cover !== current.cover

  let headRevisionId = current.headRevisionId
  if (needsNewRev || !headRevisionId) {
    headRevisionId = await insertRevision(db, id, content)
  }

  await updateMeta(db, id, { ...input, slug }, headRevisionId)
  const termIds = await resolveOrCreateTerms(db, input.categoryIds, input.tagNames)
  await syncPostTerms(db, id, termIds)
  await enqueueMirror(db, current.type === 'page' ? 'page' : 'post', id, 'upsert')

  const updated = await getPostById(db, id)
  if (!updated) throw new Error('update post failed')
  return updated
}

export async function publishPost(
  db: D1Database,
  id: string,
  publishedAt?: string,
): Promise<Post> {
  const current = await getPostById(db, id)
  if (!current || current.deletedAt) {
    throw Object.assign(new Error('post not found'), { code: 'NOT_FOUND' })
  }
  if (!current.headRevisionId) {
    throw Object.assign(new Error('missing head revision'), { code: 'VALIDATION_FAILED' })
  }
  const now = nowIso()
  const pubAt = publishedAt || current.publishedAt || now
  await db
    .prepare(
      `UPDATE posts SET
        status = 'published',
        release_revision_id = ?,
        published_at = ?,
        updated_at = ?
      WHERE id = ?`,
    )
    .bind(current.headRevisionId, pubAt, now, id)
    .run()
  await enqueueMirror(db, current.type === 'page' ? 'page' : 'post', id, 'upsert')
  const updated = await getPostById(db, id)
  if (!updated) throw new Error('publish failed')
  return updated
}

export async function unpublishPost(db: D1Database, id: string): Promise<Post> {
  const current = await getPostById(db, id)
  if (!current || current.deletedAt) {
    throw Object.assign(new Error('post not found'), { code: 'NOT_FOUND' })
  }
  await db
    .prepare(`UPDATE posts SET status = 'draft', updated_at = ? WHERE id = ?`)
    .bind(nowIso(), id)
    .run()
  await enqueueMirror(db, current.type === 'page' ? 'page' : 'post', id, 'upsert')
  const updated = await getPostById(db, id)
  if (!updated) throw new Error('unpublish failed')
  return updated
}

export async function recyclePost(db: D1Database, id: string): Promise<Post> {
  const current = await getPostById(db, id)
  if (!current) {
    throw Object.assign(new Error('post not found'), { code: 'NOT_FOUND' })
  }
  await db
    .prepare(`UPDATE posts SET deleted_at = ?, status = 'draft', updated_at = ? WHERE id = ?`)
    .bind(nowIso(), nowIso(), id)
    .run()
  await enqueueMirror(db, current.type === 'page' ? 'page' : 'post', id, 'delete')
  const updated = await getPostById(db, id)
  if (!updated) throw new Error('recycle failed')
  return updated
}

export async function restorePost(db: D1Database, id: string): Promise<Post> {
  const current = await getPostById(db, id)
  if (!current) {
    throw Object.assign(new Error('post not found'), { code: 'NOT_FOUND' })
  }
  await db
    .prepare(`UPDATE posts SET deleted_at = NULL, updated_at = ? WHERE id = ?`)
    .bind(nowIso(), id)
    .run()
  await enqueueMirror(db, current.type === 'page' ? 'page' : 'post', id, 'upsert')
  const updated = await getPostById(db, id)
  if (!updated) throw new Error('restore failed')
  return updated
}

/** 彻底删除（revisions/post_terms 级联；评论与镜像另行清理） */
export async function deletePost(db: D1Database, id: string): Promise<void> {
  const current = await getPostById(db, id)
  if (!current) {
    throw Object.assign(new Error('post not found'), { code: 'NOT_FOUND' })
  }
  await db.prepare('DELETE FROM comments WHERE target_type = ? AND target_id = ?').bind('post', id).run()
  await db.prepare('DELETE FROM posts WHERE id = ?').bind(id).run()
  await enqueueMirror(db, current.type === 'page' ? 'page' : 'post', id, 'delete')
}

export async function listRevisions(db: D1Database, postId: string): Promise<PostRevision[]> {
  const rows = await db
    .prepare('SELECT * FROM post_revisions WHERE post_id = ? ORDER BY created_at DESC')
    .bind(postId)
    .all<RevisionRow>()
  return rows.results.map(rowToRevision)
}

export async function revertToRevision(db: D1Database, postId: string, revisionId: string): Promise<Post> {
  const current = await getPostById(db, postId)
  if (!current || current.deletedAt) {
    throw Object.assign(new Error('post not found'), { code: 'NOT_FOUND' })
  }
  const rev = await getRevision(db, revisionId)
  if (!rev || rev.postId !== postId) {
    throw Object.assign(new Error('revision not found'), { code: 'NOT_FOUND' })
  }
  // 复制为新 head，保留历史
  const newHead = await insertRevision(db, postId, {
    contentMd: rev.contentMd,
    contentHtml: rev.contentHtml,
    excerpt: rev.excerpt,
    cover: rev.cover,
    readingTime: rev.readingTime,
  })
  await db
    .prepare('UPDATE posts SET head_revision_id = ?, updated_at = ? WHERE id = ?')
    .bind(newHead, nowIso(), postId)
    .run()
  await enqueueMirror(db, current.type === 'page' ? 'page' : 'post', postId, 'upsert')
  const updated = await getPostById(db, postId)
  if (!updated) throw new Error('revert failed')
  return updated
}

export async function countPosts(db: D1Database): Promise<{ posts: number; pages: number; drafts: number; trashed: number }> {
  const row = await db
    .prepare(
      `SELECT
        SUM(CASE WHEN type = 'post' AND status = 'published' AND deleted_at IS NULL THEN 1 ELSE 0 END) as posts,
        SUM(CASE WHEN type = 'page' AND status = 'published' AND deleted_at IS NULL THEN 1 ELSE 0 END) as pages,
        SUM(CASE WHEN status = 'draft' AND deleted_at IS NULL THEN 1 ELSE 0 END) as drafts,
        SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) as trashed
      FROM posts`,
    )
    .first<{ posts: number | null; pages: number | null; drafts: number | null; trashed: number | null }>()
  return {
    posts: row?.posts ?? 0,
    pages: row?.pages ?? 0,
    drafts: row?.drafts ?? 0,
    trashed: row?.trashed ?? 0,
  }
}

// 向后兼容：旧调用名
export async function setPostStatus(
  db: D1Database,
  id: string,
  status: 'draft' | 'published',
): Promise<Post> {
  return status === 'published' ? publishPost(db, id) : unpublishPost(db, id)
}
