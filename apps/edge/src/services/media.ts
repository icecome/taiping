import type { D1Database } from '@cloudflare/workers-types'
import type { Env } from '../env'
import type { Media } from '@taiping/content-model/media'
import { newId } from '../lib/cache'
import { nowIso } from '@taiping/shared-utils'

/**
 * 媒体服务：首期以外链/URL 元数据为主。
 * 配置了 R2 绑定时走对象存储；否则仅登记 URL。
 */
export async function createMediaFromUrl(
  db: D1Database,
  input: { url: string; filename: string; mime: string; size?: number; width?: number; height?: number },
): Promise<Media> {
  const id = newId('med')
  const createdAt = nowIso()
  await db
    .prepare(
      `INSERT INTO media (id, storage_key, url, filename, mime, size, width, height, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.url,
      input.url,
      input.filename,
      input.mime,
      input.size ?? 0,
      input.width ?? null,
      input.height ?? null,
      createdAt,
    )
    .run()
  return {
    id,
    storageKey: input.url,
    url: input.url,
    filename: input.filename,
    mime: input.mime,
    size: input.size ?? 0,
    width: input.width,
    height: input.height,
    createdAt,
  }
}

export async function uploadMedia(
  db: D1Database,
  env: Env,
  file: { name: string; type: string; size: number; arrayBuffer: ArrayBuffer },
): Promise<Media> {
  if (!env.MEDIA) {
    throw Object.assign(
      new Error('R2 not configured; register external URL instead'),
      { code: 'VALIDATION_FAILED' },
    )
  }
  const id = newId('med')
  const key = `uploads/${createdAtFolder()}/${id}_${sanitizeFilename(file.name)}`
  await env.MEDIA.put(key, file.arrayBuffer, {
    httpMetadata: { contentType: file.type },
  })
  const url = `/media/${key}`
  const createdAt = nowIso()
  await db
    .prepare(
      `INSERT INTO media (id, storage_key, url, filename, mime, size, width, height, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?)`,
    )
    .bind(id, key, url, file.name, file.type, file.size, createdAt)
    .run()
  return {
    id,
    storageKey: key,
    url,
    filename: file.name,
    mime: file.type,
    size: file.size,
    createdAt,
  }
}

export async function listMedia(db: D1Database, page = 1, pageSize = 20, q?: string) {
  const where = q ? 'WHERE filename LIKE ? OR url LIKE ?' : ''
  const binds: unknown[] = q ? [`%${q}%`, `%${q}%`] : []
  const countRow = await db
    .prepare(`SELECT COUNT(*) as total FROM media ${where}`)
    .bind(...binds)
    .first<{ total: number }>()
  const rows = await db
    .prepare(`SELECT * FROM media ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .bind(...binds, pageSize, (page - 1) * pageSize)
    .all<{
      id: string
      storage_key: string
      url: string
      filename: string
      mime: string
      size: number
      width: number | null
      height: number | null
      created_at: string
    }>()
  return {
    items: rows.results.map((row) => ({
      id: row.id,
      storageKey: row.storage_key,
      url: row.url,
      filename: row.filename,
      mime: row.mime,
      size: row.size,
      width: row.width ?? undefined,
      height: row.height ?? undefined,
      createdAt: row.created_at,
    })),
    total: countRow?.total ?? 0,
    page,
    pageSize,
  }
}

export async function deleteMedia(db: D1Database, env: Env, id: string): Promise<void> {
  const row = await db
    .prepare('SELECT storage_key, url FROM media WHERE id = ?')
    .bind(id)
    .first<{ storage_key: string; url: string }>()
  if (!row) {
    throw Object.assign(new Error('media not found'), { code: 'NOT_FOUND' })
  }
  if (env.MEDIA && row.storage_key.startsWith('uploads/')) {
    await env.MEDIA.delete(row.storage_key)
  }
  await db.prepare('DELETE FROM media WHERE id = ?').bind(id).run()
}

function createdAtFolder(): string {
  return nowIso().slice(0, 10)
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.\-]+/g, '_').slice(-80) || 'file'
}
