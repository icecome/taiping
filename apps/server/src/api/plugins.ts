/**
 * 插件管理接口。
 *
 * 两个数据源要合并看：
 *   - 代码里的 manifest（lib/hooks.ts 的注册表，由 plugins/index.ts 注册）—— 插件"有什么"，
 *     包括版本、说明、可配置项定义，它随代码部署变化；
 *   - plugins 表 —— 插件"现在是什么状态"，包括启停与配置值，它随后台操作变化。
 * 清单接口必须两边合起来看，否则会出现"部署了新插件但后台看不到"或"停用的插件消失了"。
 *
 * 配置值写两份：plugins.settings_json（后台编辑态）与 settings 表的 plugin.<key>.<field>
 * （前台读取态，走 getSiteConfig 的 KV 缓存）。两份都写是为了让后台读自己的 JSON、
 * 前台只认 settings 表这一条唯一读取路径，不需要插件自己去拼 JSON。
 */
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import { createDb } from "../db/client";
import { plugins } from "../db/schema";
import type { AppBindings } from "../env";
import { recordAudit } from "../lib/audit";
import { bumpCacheVersion } from "../lib/cache";
import { badRequest, notFound } from "../lib/errors";
import { bumpEnabledPlugins, getPluginManifest, listPluginManifests, type PluginManifest, type PluginSettingField } from "../lib/hooks";
import { assertCan } from "../lib/rbac";
import { putSettings } from "../lib/settings";
import { registerBuiltinPlugins } from "../plugins";
import { envelope } from "./schemas";

/* ------------------------------------------------------------------ schema */

const PluginSettingFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.string(),
  default: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
  help: z.string().optional(),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  sensitive: z.boolean().optional(),
});

const PluginEntrySchema = z.object({
  key: z.string(),
  name: z.string(),
  version: z.string(),
  description: z.string(),
  author: z.string(),
  enabled: z.boolean(),
  /** plugins 表里是否有对应行；false 表示只存在于代码清单里，从未被启用/配置过。 */
  installed: z.boolean(),
  /** 代码里是否有对应 manifest；false 表示只有历史数据，插件已被移除。 */
  hasManifest: z.boolean(),
  settings: z.record(z.string(), z.unknown()),
  settingsSchema: z.array(PluginSettingFieldSchema),
});

const KeyParam = z.object({
  key: z.string().min(1).openapi({ param: { name: "key", in: "path" }, example: "toc" }),
});

const PluginPatchBody = z.object({
  enabled: z.boolean().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

/* ------------------------------------------------------------------ 工具 */

type PluginRow = typeof plugins.$inferSelect;

function parseJsonObject(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function defaultSettings(manifest: PluginManifest | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of manifest?.settings ?? []) {
    out[field.key] = Array.isArray(field.default) ? [...field.default] : field.default;
  }
  return out;
}

/** 与 lib/settings.ts 的 coerce 保持同一套语义，保证库里的值与前台读到的一致。 */
function coercePluginSetting(field: PluginSettingField, raw: unknown): unknown {
  switch (field.type) {
    case "number": {
      const value = Number(raw);
      if (!Number.isFinite(value)) throw badRequest(`${field.label} 必须是数字`, { [field.key]: "必须是数字" });
      if (field.min !== undefined && value < field.min) throw badRequest(`${field.label} 不能小于 ${field.min}`, { [field.key]: `最小 ${field.min}` });
      if (field.max !== undefined && value > field.max) throw badRequest(`${field.label} 不能大于 ${field.max}`, { [field.key]: `最大 ${field.max}` });
      return value;
    }
    case "boolean":
      return raw === true || raw === "true" || raw === 1 || raw === "1";
    case "string-list":
      if (Array.isArray(raw)) return raw.map(String);
      if (typeof raw === "string") return raw.split("\n").map((line) => line.trim()).filter(Boolean);
      return [];
    case "select": {
      const value = raw == null || raw === "" ? String(field.default) : String(raw);
      if (field.options && !field.options.some((option) => option.value === value)) {
        throw badRequest(`${field.label} 取值不合法`, { [field.key]: `可选：${field.options.map((o) => o.value).join("、")}` });
      }
      return value;
    }
    default:
      return raw == null ? "" : String(raw);
  }
}

function buildEntry(key: string, manifest: PluginManifest | undefined, row: PluginRow | undefined) {
  const stored = row ? parseJsonObject(row.settingsJson) : {};
  return {
    key,
    name: manifest?.name ?? row?.name ?? key,
    version: manifest?.version ?? row?.version ?? "0.0.0",
    description: manifest?.description ?? row?.description ?? "",
    author: manifest?.author ?? row?.author ?? "",
    enabled: row?.enabled ?? manifest?.defaultEnabled ?? false,
    installed: Boolean(row),
    hasManifest: Boolean(manifest),
    settings: { ...defaultSettings(manifest), ...stored },
    settingsSchema: manifest?.settings ?? [],
  };
}

/** 配置值 → settings 表的 plugin.<key>.<field> 条目。 */
function settingEntries(manifest: PluginManifest, settings: Record<string, unknown>): Record<string, unknown> {
  const entries: Record<string, unknown> = {};
  for (const field of manifest.settings ?? []) {
    const value = settings[field.key];
    entries[`plugin.${manifest.key}.${field.key}`] =
      value === undefined ? (Array.isArray(field.default) ? [...field.default] : field.default) : value;
  }
  return entries;
}

/* ------------------------------------------------------------------ 路由 */

export function createPluginRoutes(): OpenAPIHono<AppBindings> {
  const app = new OpenAPIHono<AppBindings>();

  /* ---------------------------------------------------------------- 列表 */

  app.openapi(
    createRoute({
      method: "get",
      path: "/",
      tags: ["插件"],
      summary: "插件清单",
      description: "合并代码清单与数据库状态：代码里新增的插件即使从未启用也会出现（installed = false）。",
      responses: {
        200: {
          description: "插件列表",
          content: { "application/json": { schema: envelope(z.object({ items: z.array(PluginEntrySchema) })) } },
        },
      },
    }),
    async (c) => {
      assertCan(c.get("auth"), "plugin.read");
      const db = createDb(c.env.DB);
      // 幂等注册内置插件：单独挂载 API（例如只跑接口测试）时注册表可能是空的。
      registerBuiltinPlugins();

      const manifests = listPluginManifests();
      const rows = await db.select().from(plugins);
      const rowByKey = new Map(rows.map((row) => [row.key, row]));
      const keys = [...new Set([...manifests.map((manifest) => manifest.key), ...rows.map((row) => row.key)])].sort();

      const items = keys.map((key) => buildEntry(key, getPluginManifest(key), rowByKey.get(key)));
      return c.json({ ok: true as const, data: { items } }, 200);
    },
  );

  /* ---------------------------------------------------------------- 更新 */

  app.openapi(
    createRoute({
      method: "patch",
      path: "/{key}",
      tags: ["插件"],
      summary: "启用 / 停用 / 配置插件",
      description: "只能操作代码里已注册的插件；写入后同时刷新插件启用缓存与页面缓存。",
      request: {
        params: KeyParam,
        body: { content: { "application/json": { schema: PluginPatchBody } } },
      },
      responses: {
        200: { description: "更新成功", content: { "application/json": { schema: envelope(PluginEntrySchema) } } },
      },
    }),
    async (c) => {
      const auth = assertCan(c.get("auth"), "plugin.manage");
      const { key } = c.req.valid("param");
      const body = c.req.valid("json");
      const db = createDb(c.env.DB);
      registerBuiltinPlugins();

      const manifest = getPluginManifest(key);
      if (!manifest) throw notFound(`插件不存在或未注册：${key}`);

      const [row] = await db.select().from(plugins).where(eq(plugins.key, key)).limit(1);
      const current = { ...defaultSettings(manifest), ...(row ? parseJsonObject(row.settingsJson) : {}) };

      let nextSettings = current;
      if (body.settings) {
        const declared = new Set((manifest.settings ?? []).map((field) => field.key));
        const patch: Record<string, unknown> = {};
        for (const [fieldKey, raw] of Object.entries(body.settings)) {
          if (!declared.has(fieldKey)) {
            throw badRequest(`插件 ${key} 不支持配置项 ${fieldKey}`, { [fieldKey]: "未在插件设置里声明" });
          }
          const field = (manifest.settings ?? []).find((item) => item.key === fieldKey)!;
          patch[fieldKey] = coercePluginSetting(field, raw);
        }
        nextSettings = { ...current, ...patch };
      }

      const nextEnabled = body.enabled ?? row?.enabled ?? manifest.defaultEnabled ?? false;
      const settingsJson = JSON.stringify(nextSettings);
      const now = new Date();

      await db
        .insert(plugins)
        .values({
          key,
          name: manifest.name,
          version: manifest.version,
          description: manifest.description,
          author: manifest.author,
          enabled: nextEnabled,
          settingsJson,
          installedAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: plugins.key,
          set: {
            name: manifest.name,
            version: manifest.version,
            description: manifest.description,
            author: manifest.author,
            enabled: nextEnabled,
            settingsJson,
            updatedAt: now,
          },
        });

      await putSettings(c.env, db, settingEntries(manifest, nextSettings), auth.user.id);
      await bumpEnabledPlugins(c.env);
      await bumpCacheVersion(c.env);

      await recordAudit(db, {
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        action: "plugin.update",
        targetType: "plugin",
        targetId: key,
        meta: { enabled: nextEnabled, settings: Object.keys(body.settings ?? {}) },
        ip: c.req.header("cf-connecting-ip") ?? null,
      });

      const [fresh] = await db.select().from(plugins).where(eq(plugins.key, key)).limit(1);
      return c.json({ ok: true as const, data: buildEntry(key, manifest, fresh) }, 200);
    },
  );

  /* ---------------------------------------------------------------- 重置 */

  app.openapi(
    createRoute({
      method: "post",
      path: "/{key}/reset",
      tags: ["插件"],
      summary: "恢复插件默认配置",
      description: "把配置值重置为 manifest 里声明的默认值，不动启用状态。",
      request: { params: KeyParam },
      responses: {
        200: { description: "已重置", content: { "application/json": { schema: envelope(PluginEntrySchema) } } },
      },
    }),
    async (c) => {
      const auth = assertCan(c.get("auth"), "plugin.manage");
      const { key } = c.req.valid("param");
      const db = createDb(c.env.DB);
      registerBuiltinPlugins();

      const manifest = getPluginManifest(key);
      if (!manifest) throw notFound(`插件不存在或未注册：${key}`);

      const [row] = await db.select().from(plugins).where(eq(plugins.key, key)).limit(1);
      const defaults = defaultSettings(manifest);
      const settingsJson = JSON.stringify(defaults);
      const enabled = row?.enabled ?? manifest.defaultEnabled ?? false;
      const now = new Date();

      await db
        .insert(plugins)
        .values({
          key,
          name: manifest.name,
          version: manifest.version,
          description: manifest.description,
          author: manifest.author,
          enabled,
          settingsJson,
          installedAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: plugins.key,
          set: { settingsJson, updatedAt: now },
        });

      await putSettings(c.env, db, settingEntries(manifest, defaults), auth.user.id);
      await bumpEnabledPlugins(c.env);
      await bumpCacheVersion(c.env);

      await recordAudit(db, {
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        action: "plugin.reset",
        targetType: "plugin",
        targetId: key,
        ip: c.req.header("cf-connecting-ip") ?? null,
      });

      const [fresh] = await db.select().from(plugins).where(eq(plugins.key, key)).limit(1);
      return c.json({ ok: true as const, data: buildEntry(key, manifest, fresh) }, 200);
    },
  );

  return app;
}

export { PluginEntrySchema };

/** 兼容别名：api/index.ts 挂载时用复数命名。 */
export const createPluginsRoutes = createPluginRoutes;
