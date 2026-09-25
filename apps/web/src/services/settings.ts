import type { SiteSettings } from '@taiping/content-model'
import { defaultSiteSettings } from '@taiping/content-model'
import type { AppEnv } from '../env'

export async function getSiteSettings(db: D1Database): Promise<SiteSettings> {
  const row = await db
    .prepare(`SELECT value FROM settings WHERE key = ? AND scope = 'site'`)
    .bind('site')
    .first<{ value: string }>()

  if (!row?.value) return { ...defaultSiteSettings }

  try {
    return { ...defaultSiteSettings, ...(JSON.parse(row.value) as Partial<SiteSettings>) }
  } catch {
    return { ...defaultSiteSettings }
  }
}

export async function saveSiteSettings(db: D1Database, settings: SiteSettings): Promise<void> {
  await db
    .prepare(
      `INSERT INTO settings (key, scope, value) VALUES (?, 'site', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .bind('site', JSON.stringify(settings))
    .run()
}

export async function getSetting(db: D1Database, key: string, scope = 'site'): Promise<string | null> {
  const row = await db
    .prepare(`SELECT value FROM settings WHERE key = ? AND scope = ?`)
    .bind(key, scope)
    .first<{ value: string }>()
  return row?.value ?? null
}

export type { AppEnv }
