import type { D1Database } from '@cloudflare/workers-types'
import type { SiteSettings } from '@taiping/content-model/settings'
import { siteSettingsSchema } from '@taiping/content-model/settings'
import { nowIso } from '@taiping/shared-utils'

export async function getSettings(db: D1Database): Promise<SiteSettings> {
  const rows = await db.prepare('SELECT key, value FROM settings').all<{
    key: string
    value: string
  }>()
  const merged: Record<string, unknown> = {}
  for (const row of rows.results) {
    try {
      merged[row.key] = JSON.parse(row.value)
    } catch {
      // skip invalid json rows
    }
  }
  return siteSettingsSchema.parse(merged)
}

export async function saveSettings(db: D1Database, settings: SiteSettings): Promise<void> {
  const parsed = siteSettingsSchema.parse(settings)
  const statements = Object.entries(parsed).map(([key, value]) =>
    db
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .bind(key, JSON.stringify(value)),
  )
  await db.batch(statements)
}

export function now(): string {
  return nowIso()
}
