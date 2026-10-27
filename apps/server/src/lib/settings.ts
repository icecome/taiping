/**
 * 设置读写。
 *
 * 存储形态：settings 表 key/value_json，key 用前缀分命名空间。
 *   site.<field>              站点设置
 *   theme.active              当前启用主题
 *   theme.<themeId>.<field>   主题设置
 *   plugin.<pluginKey>.<field> 插件设置
 *
 * 读取路径上会先命中 KV 缓存（60 秒），任何写入都会 bump 版本号，
 * 因此后台改完设置前台立刻生效，且不需要在每次请求里查一次 D1。
 */
import { asc, eq, like } from "drizzle-orm";
import type { Env } from "../env";
import { defaultSiteSettings, SETTING_FIELD_MAP } from "../shared/settings-schema";
import type { Db } from "../db/client";
import { settings } from "../db/schema";

export interface ResolvedSiteConfig {
  /** site.<field> 展开后的短名映射。 */
  site: Record<string, string | number | boolean | string[]>;
  activeTheme: string;
  /** theme.<activeTheme>.<field>。 */
  theme: Record<string, unknown>;
  /** plugin.<key>.<field>。 */
  plugins: Record<string, Record<string, unknown>>;
  /** 原始行，供后台整表回显。 */
  raw: Record<string, unknown>;
}

const CACHE_TTL_SECONDS = 60;
const CONFIG_KEY = "config:site";

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function coerce(fieldKey: string, value: unknown): string | number | boolean | string[] {
  const field = SETTING_FIELD_MAP[fieldKey];
  if (!field) return value as string | number | boolean | string[];
  switch (field.type) {
    case "number": {
      const n = Number(value);
      return Number.isFinite(n) ? n : (field.default as number);
    }
    case "boolean":
      return value === true || value === "true" || value === 1;
    case "string-list":
      if (Array.isArray(value)) return value.map(String);
      if (typeof value === "string" && value.trim()) return value.split("\n").map((s) => s.trim()).filter(Boolean);
      return [];
    default:
      return value == null ? (field.default as string) : String(value);
  }
}

export async function loadAllSettings(db: Db): Promise<Record<string, unknown>> {
  const rows = await db.select().from(settings).orderBy(asc(settings.key));
  const out: Record<string, unknown> = {};
  for (const row of rows) out[row.key] = parseJson(row.valueJson);
  return out;
}

export function resolveConfig(raw: Record<string, unknown>): ResolvedSiteConfig {
  const defaults = defaultSiteSettings();
  const site: Record<string, string | number | boolean | string[]> = { ...defaults };
  const theme: Record<string, unknown> = {};
  const plugins: Record<string, Record<string, unknown>> = {};
  let activeTheme = "default";

  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith("site.")) {
      const short = key.slice(5);
      if (short in defaults) site[short] = coerce(short, value);
      else site[short] = value as string | number | boolean | string[];
      continue;
    }
    if (key === "theme.active") {
      if (typeof value === "string" && value) activeTheme = value;
      continue;
    }
    if (key.startsWith("theme.")) {
      const rest = key.slice(6);
      const dot = rest.indexOf(".");
      if (dot === -1) continue;
      const themeId = rest.slice(0, dot);
      const fieldKey = rest.slice(dot + 1);
      if (themeId === activeTheme) theme[fieldKey] = value;
      continue;
    }
    if (key.startsWith("plugin.")) {
      const rest = key.slice(7);
      const dot = rest.indexOf(".");
      if (dot === -1) continue;
      const pluginKey = rest.slice(0, dot);
      const fieldKey = rest.slice(dot + 1);
      plugins[pluginKey] = { ...(plugins[pluginKey] ?? {}), [fieldKey]: value };
    }
  }

  return { site, activeTheme, theme, plugins, raw };
}

/** 对外主入口：带 KV 缓存的读取。 */
export async function getSiteConfig(env: Env, db: Db): Promise<ResolvedSiteConfig> {
  const version = (await env.KV.get("settings:version")) ?? "1";
  const cacheKey = `${CONFIG_KEY}:v${version}`;
  try {
    const cached = await env.KV.get(cacheKey, "json");
    if (cached) return cached as ResolvedSiteConfig;
  } catch {
    // KV 不可用时直接回落 D1，不影响请求正确性。
  }
  const resolved = resolveConfig(await loadAllSettings(db));
  try {
    await env.KV.put(cacheKey, JSON.stringify(resolved), { expirationTtl: CACHE_TTL_SECONDS });
  } catch {
    /* 忽略缓存写入失败 */
  }
  return resolved;
}

export function siteSetting<T = string | number | boolean | string[]>(
  config: ResolvedSiteConfig,
  key: string,
): T {
  const value = config.site[key];
  if (value === undefined) {
    return SETTING_FIELD_MAP[key]?.default as T;
  }
  return value as T;
}

export async function putSettings(
  env: Env,
  db: Db,
  entries: Record<string, unknown>,
  updatedBy: string | null,
): Promise<number> {
  const keys = Object.keys(entries);
  if (keys.length === 0) return 0;

  const statements = keys.map((key) =>
    db
      .insert(settings)
      .values({
        key,
        valueJson: JSON.stringify(entries[key] ?? null),
        updatedBy,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: settings.key,
        set: {
          valueJson: JSON.stringify(entries[key] ?? null),
          updatedBy,
          updatedAt: new Date(),
        },
      }),
  );

  if (typeof (db as unknown as { batch?: unknown }).batch === "function") {
    // D1 支持批处理：一次往返写完全部键，避免 N 次 round trip。
    await (db as unknown as { batch: (s: unknown[]) => Promise<unknown> }).batch(statements);
  } else {
    for (const statement of statements) await statement;
  }

  await bumpSettingsVersion(env);
  return keys.length;
}

export async function deleteSettings(env: Env, db: Db, keys: string[]): Promise<void> {
  for (const key of keys) {
    await db.delete(settings).where(eq(settings.key, key));
  }
  await bumpSettingsVersion(env);
}

export async function bumpSettingsVersion(env: Env): Promise<void> {
  const current = Number((await env.KV.get("settings:version")) ?? "1");
  await env.KV.put("settings:version", String(current + 1));
}

export async function listSettingsByPrefix(db: Db, prefix: string): Promise<{ key: string; value: unknown }[]> {
  const rows = await db.select().from(settings).where(like(settings.key, `${prefix}%`));
  return rows.map((row) => ({ key: row.key, value: parseJson(row.valueJson) }));
}
