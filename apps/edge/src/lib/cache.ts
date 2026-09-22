import type { D1Database } from '@cloudflare/workers-types'
import { createId, nowIso } from '@taiping/shared-utils'

export interface CacheVersions {
  content: number
  index: number
  config: number
}

export async function getCacheVersions(db: D1Database): Promise<CacheVersions> {
  const row = await db
    .prepare('SELECT key, version FROM cache_versions WHERE key IN (?, ?, ?)')
    .bind('content', 'index', 'config')
    .all<{ key: string; version: number }>()
  const map = new Map(row.results.map((r) => [r.key, r.version]))
  return {
    content: map.get('content') ?? 1,
    index: map.get('index') ?? 1,
    config: map.get('config') ?? 1,
  }
}

export async function bumpCacheVersion(
  db: D1Database,
  key: keyof CacheVersions,
): Promise<number> {
  const now = nowIso()
  await db
    .prepare(
      `INSERT INTO cache_versions (key, version, updated_at) VALUES (?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET version = version + 1, updated_at = excluded.updated_at`,
    )
    .bind(key, now)
    .run()
  const row = await db
    .prepare('SELECT version FROM cache_versions WHERE key = ?')
    .bind(key)
    .first<{ version: number }>()
  return row?.version ?? 1
}

export function newId(prefix: string): string {
  return createId(prefix)
}
