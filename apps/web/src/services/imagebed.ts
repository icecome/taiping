import { nowIso } from '@taiping/shared-utils'
import type { ImageBedConfig, ImageBedRow, ImageBedType, UploadResult } from './imagebed-types'
import { maskConfig, uploadToImageBed } from './imagebed-upload'

export async function listImageBeds(db: D1Database): Promise<Array<Omit<ImageBedRow, 'config'> & { config: ImageBedConfig }>> {
  const rows = await db
    .prepare(`SELECT * FROM image_beds ORDER BY is_default DESC, id ASC`)
    .all<ImageBedRow>()
  return (rows.results ?? []).map((r) => ({
    ...r,
    config: safeParse(r.config),
  }))
}

function safeParse(raw: string): ImageBedConfig {
  try {
    return JSON.parse(raw) as ImageBedConfig
  } catch {
    return {}
  }
}

export async function getImageBed(db: D1Database, id: number): Promise<ImageBedRow | null> {
  return db.prepare(`SELECT * FROM image_beds WHERE id = ?`).bind(id).first<ImageBedRow>()
}

export async function getDefaultImageBed(db: D1Database): Promise<ImageBedRow | null> {
  return db
    .prepare(`SELECT * FROM image_beds WHERE enabled = 1 AND is_default = 1 LIMIT 1`)
    .first<ImageBedRow>()
}

export async function createImageBed(
  db: D1Database,
  input: { name: string; type: ImageBedType; config: ImageBedConfig; isDefault?: boolean },
): Promise<number> {
  const now = nowIso()
  if (input.isDefault) {
    await db.prepare(`UPDATE image_beds SET is_default = 0`).run()
  }
  const result = await db
    .prepare(
      `INSERT INTO image_beds (name, type, is_default, enabled, config, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?, ?)`,
    )
    .bind(input.name, input.type, input.isDefault ? 1 : 0, JSON.stringify(input.config), now, now)
    .run()
  return Number(result.meta.last_row_id)
}

export async function updateImageBed(
  db: D1Database,
  id: number,
  patch: { name?: string; config?: ImageBedConfig; enabled?: boolean; isDefault?: boolean },
): Promise<void> {
  const existing = await getImageBed(db, id)
  if (!existing) throw new Error('图床不存在')
  if (patch.isDefault) {
    await db.prepare(`UPDATE image_beds SET is_default = 0`).run()
  }
  await db
    .prepare(
      `UPDATE image_beds SET name = ?, config = ?, enabled = ?, is_default = ?, updated_at = ? WHERE id = ?`,
    )
    .bind(
      patch.name ?? existing.name,
      patch.config ? JSON.stringify(patch.config) : existing.config,
      patch.enabled === undefined ? existing.enabled : patch.enabled ? 1 : 0,
      patch.isDefault === undefined ? existing.is_default : patch.isDefault ? 1 : 0,
      nowIso(),
      id,
    )
    .run()
}

export async function deleteImageBed(db: D1Database, id: number): Promise<void> {
  await db.prepare(`DELETE FROM image_beds WHERE id = ?`).bind(id).run()
}

export async function uploadImage(
  db: D1Database,
  bedId: number | undefined,
  file: File | Blob,
  originalName: string,
): Promise<UploadResult & { bedId: number }> {
  let row: ImageBedRow | null = null
  if (bedId) row = await getImageBed(db, bedId)
  else row = await getDefaultImageBed(db)
  if (!row) throw new Error('未配置可用图床')
  if (!row.enabled) throw new Error('图床已禁用')

  const config = safeParse(row.config)
  const result = await uploadToImageBed(row.type, config, file, originalName)
  await db
    .prepare(
      `INSERT INTO image_assets (bed_id, filename, url, size, mime, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(row.id, result.filename, result.url, result.size, result.mime, nowIso())
    .run()
  return { ...result, bedId: row.id }
}

export { maskConfig }
