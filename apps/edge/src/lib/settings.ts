import type { D1Database } from '@cloudflare/workers-types'
import type { SiteSettings } from '@taiping/content-model/settings'
import { parseSiteSettings, siteSettingsSchema } from '@taiping/content-model/settings'

/** isolate 内短 TTL 缓存，降低前台每请求全表扫描 */
const SETTINGS_TTL_MS = 30_000
let settingsCache: { value: SiteSettings; at: number } | null = null

export function invalidateSettingsCache(): void {
  settingsCache = null
}

function normalizeActiveMedia(settings: SiteSettings): SiteSettings {
  const activeId = settings.activeMediaConfigId
  if (!activeId) {
    return { ...settings, activeMediaConfigId: settings.mediaConfigs[0]?.id ?? '' }
  }
  if (settings.mediaConfigs.some((c) => c.id === activeId)) return settings
  return { ...settings, activeMediaConfigId: settings.mediaConfigs[0]?.id ?? '' }
}

export async function getSettings(db: D1Database): Promise<SiteSettings> {
  if (settingsCache && Date.now() - settingsCache.at < SETTINGS_TTL_MS) {
    return settingsCache.value
  }
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
  const value = normalizeActiveMedia(parseSiteSettings(merged))
  settingsCache = { value, at: Date.now() }
  return value
}

export async function saveSettings(db: D1Database, settings: SiteSettings): Promise<SiteSettings> {
  const parsed = normalizeActiveMedia(siteSettingsSchema.parse(settings))
  const statements = Object.entries(parsed).map(([key, value]) =>
    db
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .bind(key, JSON.stringify(value)),
  )
  // 清理 schema 已废弃的历史键，避免脏配置长期残留
  const validKeys = new Set(Object.keys(parsed))
  const existing = await db.prepare('SELECT key FROM settings').all<{ key: string }>()
  for (const row of existing.results) {
    if (!validKeys.has(row.key)) {
      statements.push(db.prepare('DELETE FROM settings WHERE key = ?').bind(row.key))
    }
  }
  await db.batch(statements)
  settingsCache = { value: parsed, at: Date.now() }
  return parsed
}
