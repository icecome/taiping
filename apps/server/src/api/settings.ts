/**
 * 系统设置接口（站点 / 主题 / 维护）
 *
 * 后台「系统设置」页只需要一次请求就能把整页渲染出来，所以 GET / 一次性返回
 * 当前值 + 站点表单骨架 + 主题配置，避免前端发三四次请求再自己拼装。
 *
 * 表单骨架直接由 shared/settings-schema.ts 生成：加一个设置项 = 那份数组加一行，
 * 这里不需要改代码，后台也不需要认识那个键。
 *
 * 写入统一走 putSettings（settings 表 key/value_json），每次写入都 bump 设置版本号与页面缓存版本：
 * 前者让 getSiteConfig 的 KV 缓存立即失效，后者让已渲染的页面立即重排。
 */
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { createDb } from "../db/client";
import type { AppBindings } from "../env";
import { recordAudit } from "../lib/audit";
import { bumpCacheVersion } from "../lib/cache";
import { badRequest, forbidden } from "../lib/errors";
import { assertCan } from "../lib/rbac";
import { getSiteConfig, loadAllSettings, putSettings, resolveConfig } from "../lib/settings";
import { runMaintenanceNow } from "../lib/tasks";
import {
  SETTING_FIELDS,
  SETTING_FIELD_MAP,
  SETTING_GROUPS,
  type SettingField,
} from "../shared/settings-schema";
import { listThemeManifests, resolveTheme, themeSettingDefaults } from "../theme/registry";
import { envelope } from "./schemas";

/* ------------------------------------------------------------------ schema */

const SettingOptionSchema = z.object({ value: z.string(), label: z.string() });

const SettingFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.string(),
  group: z.string(),
  default: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
  help: z.string().optional(),
  options: z.array(SettingOptionSchema).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  sensitive: z.boolean().optional(),
});

/** 主题（与插件）的设置字段不含 group —— 它们只有一层，不需要分组。 */
const ThemeSettingFieldSchema = SettingFieldSchema.omit({ group: true });

const SettingGroupSchema = z.object({
  group: z.string(),
  label: z.string(),
  description: z.string(),
  fields: z.array(SettingFieldSchema),
});

const ThemeManifestSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  author: z.string(),
  description: z.string(),
  supports: z.object({
    darkMode: z.boolean(),
    toc: z.boolean(),
    sidebar: z.boolean(),
    comments: z.boolean(),
    moments: z.boolean(),
    projects: z.boolean(),
  }),
  settings: z.array(ThemeSettingFieldSchema),
  styles: z.string(),
  scripts: z.string().optional(),
});

const SettingsOverviewSchema = z.object({
  site: z.record(z.string(), z.unknown()),
  siteSchema: z.array(SettingGroupSchema),
  theme: z.object({
    active: z.string(),
    values: z.record(z.string(), z.unknown()),
    schema: z.array(ThemeSettingFieldSchema),
    themes: z.array(ThemeManifestSchema),
  }),
});

const SitePatchBody = z.object({
  values: z.record(z.string(), z.unknown()).describe("键为站点设置短名（如 siteTitle），值为待归一化的原始输入"),
});

const ThemePatchBody = z.object({
  active: z.string().min(1).optional(),
  values: z.record(z.string(), z.unknown()).optional(),
});

/* ------------------------------------------------------------------ 工具 */

/** 站点字段与主题字段的公共投影：两者形状一致，只有站点字段多一个 group。 */
type CoercibleField = {
  key: string;
  label: string;
  type: SettingField["type"];
  default: SettingField["default"];
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
};

/**
 * 按字段定义做类型归一：表单送来的都是字符串（或 JSON），入库前统一成真实类型。
 * 数字超范围、select 取值不在候选内都直接拒绝 —— 这类错误在后台表单里能立刻显示出来，
 * 比写进库后让前台渲染出 NaN 更容易排查。
 */
function coerceSettingValue(field: CoercibleField, raw: unknown): string | number | boolean | string[] {
  switch (field.type) {
    case "number": {
      const value = Number(raw);
      if (!Number.isFinite(value)) throw badRequest(`${field.label} 必须是数字`, { [field.key]: "必须是数字" });
      if (field.min !== undefined && value < field.min) {
        throw badRequest(`${field.label} 不能小于 ${field.min}`, { [field.key]: `最小 ${field.min}` });
      }
      if (field.max !== undefined && value > field.max) {
        throw badRequest(`${field.label} 不能大于 ${field.max}`, { [field.key]: `最大 ${field.max}` });
      }
      return value;
    }
    case "boolean":
      return raw === true || raw === "true" || raw === 1 || raw === "1" || raw === "on";
    case "string-list": {
      if (Array.isArray(raw)) return raw.map((item) => String(item).trim()).filter(Boolean);
      if (typeof raw === "string") return raw.split("\n").map((line) => line.trim()).filter(Boolean);
      if (raw === null || raw === undefined) return [];
      throw badRequest(`${field.label} 需要数组或按行分隔的文本`, { [field.key]: "格式不正确" });
    }
    case "select": {
      const value = raw === null || raw === undefined || raw === "" ? String(field.default) : String(raw);
      if (field.options && !field.options.some((option) => option.value === value)) {
        throw badRequest(`${field.label} 取值不合法`, {
          [field.key]: `可选：${field.options.map((option) => option.value).join("、")}`,
        });
      }
      return value;
    }
    default:
      return raw === null || raw === undefined ? "" : String(raw);
  }
}

/* ------------------------------------------------------------------ 路由 */

export function createSettingRoutes(): OpenAPIHono<AppBindings> {
  const app = new OpenAPIHono<AppBindings>();

  /* ---------------------------------------------------------------- 总览 */

  app.openapi(
    createRoute({
      method: "get",
      path: "/",
      tags: ["系统设置"],
      summary: "后台设置页全部数据",
      description: "site 是当前值（已补默认值），siteSchema 是表单骨架，theme 含当前主题的配置与全部可用主题。",
      responses: {
        200: { description: "设置总览", content: { "application/json": { schema: envelope(SettingsOverviewSchema) } } },
      },
    }),
    async (c) => {
      assertCan(c.get("auth"), "setting.read");
      const db = createDb(c.env.DB);
      const config = await getSiteConfig(c.env, db);
      const theme = resolveTheme(config.activeTheme);

      // 分组顺序紧跟 SETTING_GROUPS，字段顺序紧跟 SETTING_FIELDS —— 表单排列即代码排列。
      const siteSchema = SETTING_GROUPS.map((group) => ({
        group: group.key,
        label: group.label,
        description: group.description,
        fields: SETTING_FIELDS.filter((field) => field.group === group.key),
      }));

      return c.json(
        {
          ok: true as const,
          data: {
            site: config.site,
            siteSchema,
            theme: {
              active: config.activeTheme,
              // 未落库的主题字段用定义里的默认值补齐，后台表单与前台渲染看到的是同一份值。
              values: { ...themeSettingDefaults(theme), ...config.theme },
              schema: theme.manifest.settings,
              themes: listThemeManifests(),
            },
          },
        },
        200,
      );
    },
  );

  /* ---------------------------------------------------------------- 站点设置 */

  app.openapi(
    createRoute({
      method: "patch",
      path: "/site",
      tags: ["系统设置"],
      summary: "更新站点设置",
      description: "只接受 SETTING_FIELDS 里声明的键；sensitive 字段（如登录限制、开放注册）仅站点所有者可改。",
      request: { body: { content: { "application/json": { schema: SitePatchBody } } } },
      responses: {
        200: {
          description: "更新成功",
          content: {
            "application/json": {
              schema: envelope(z.object({ updated: z.number(), site: z.record(z.string(), z.unknown()) })),
            },
          },
        },
      },
    }),
    async (c) => {
      const auth = assertCan(c.get("auth"), "setting.manage");
      const body = c.req.valid("json");
      const db = createDb(c.env.DB);

      const keys = Object.keys(body.values);
      if (keys.length === 0) throw badRequest("没有需要更新的设置项", { values: "不能为空" });

      const entries: Record<string, unknown> = {};
      for (const key of keys) {
        const field = SETTING_FIELD_MAP[key];
        if (!field) throw badRequest(`未知设置项：${key}`, { [key]: "不在站点设置定义里" });
        if (field.sensitive && !auth.isSuperAdmin) throw forbidden(`「${field.label}」仅站点所有者可修改`);
        entries[`site.${key}`] = coerceSettingValue(field, body.values[key]);
      }

      await putSettings(c.env, db, entries, auth.user.id);
      await bumpCacheVersion(c.env);
      await recordAudit(db, {
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        action: "setting.site.update",
        targetType: "setting",
        meta: { keys, count: keys.length },
        ip: c.req.header("cf-connecting-ip") ?? null,
      });

      // 写后重读：返回库里的真值（含默认值），调用方不需要自己再 GET 一次。
      const fresh = resolveConfig(await loadAllSettings(db));
      return c.json({ ok: true as const, data: { updated: keys.length, site: fresh.site } }, 200);
    },
  );

  /* ---------------------------------------------------------------- 主题设置 */

  app.openapi(
    createRoute({
      method: "patch",
      path: "/theme",
      tags: ["系统设置"],
      summary: "切换主题 / 保存主题配置",
      description:
        "active 必须是已注册主题 id；values 按（新的）active 主题的设置定义校验后写入 theme.<主题 id>.<字段>。",
      request: { body: { content: { "application/json": { schema: ThemePatchBody } } } },
      responses: {
        200: {
          description: "更新成功",
          content: {
            "application/json": {
              schema: envelope(z.object({ active: z.string(), values: z.record(z.string(), z.unknown()) })),
            },
          },
        },
      },
    }),
    async (c) => {
      // 切主题与存主题配置统一按 theme.manage 判定：两者都能改变前台呈现，
      // 拆成两套权限只会多出一条"只改 values 绕过 theme.manage"的路径，没有收益。
      const auth = assertCan(c.get("auth"), "theme.manage");
      const body = c.req.valid("json");
      const db = createDb(c.env.DB);
      const config = await getSiteConfig(c.env, db);

      if (body.active !== undefined && !listThemeManifests().some((manifest) => manifest.id === body.active)) {
        throw badRequest(`主题未注册：${body.active}`, {
          active: `可用主题：${listThemeManifests().map((manifest) => manifest.id).join("、")}`,
        });
      }

      const targetId = body.active ?? config.activeTheme;
      const theme = resolveTheme(targetId);
      const entries: Record<string, unknown> = {};
      if (body.active !== undefined) entries["theme.active"] = body.active;

      for (const [key, raw] of Object.entries(body.values ?? {})) {
        const field = theme.manifest.settings.find((item) => item.key === key);
        if (!field) throw badRequest(`主题 ${targetId} 没有设置项 ${key}`, { [key]: "未在主题设置里声明" });
        entries[`theme.${targetId}.${key}`] = coerceSettingValue(field, raw);
      }

      if (Object.keys(entries).length === 0) {
        throw badRequest("没有需要更新的主题设置", { values: "active 与 values 至少要提供一个" });
      }

      await putSettings(c.env, db, entries, auth.user.id);
      await bumpCacheVersion(c.env);
      await recordAudit(db, {
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        action: "theme.update",
        targetType: "theme",
        targetId,
        meta: { active: targetId, switchActive: body.active !== undefined, fields: Object.keys(body.values ?? {}) },
        ip: c.req.header("cf-connecting-ip") ?? null,
      });

      const fresh = resolveConfig(await loadAllSettings(db));
      const freshTheme = resolveTheme(fresh.activeTheme);
      return c.json(
        {
          ok: true as const,
          data: { active: fresh.activeTheme, values: { ...themeSettingDefaults(freshTheme), ...fresh.theme } },
        },
        200,
      );
    },
  );

  /* ---------------------------------------------------------------- 主题清单 */

  app.openapi(
    createRoute({
      method: "get",
      path: "/themes",
      tags: ["系统设置"],
      summary: "可用主题清单",
      responses: {
        200: {
          description: "主题清单",
          content: { "application/json": { schema: envelope(z.object({ items: z.array(ThemeManifestSchema) })) } },
        },
      },
    }),
    async (c) => {
      assertCan(c.get("auth"), "theme.read");
      return c.json({ ok: true as const, data: { items: listThemeManifests() } }, 200);
    },
  );

  /* ---------------------------------------------------------------- 维护 */

  app.openapi(
    createRoute({
      method: "post",
      path: "/maintenance/run",
      tags: ["系统设置"],
      summary: "立即执行维护任务",
      description:
        "与 cron 走同一条流程：到点发布、清理超期回收站、清理过期会话与令牌、跑排队任务。tasksEnabled 关闭时全部跳过。",
      responses: {
        200: {
          description: "执行结果",
          content: {
            "application/json": {
              schema: envelope(z.object({ published: z.number(), purged: z.number(), tasks: z.number() })),
            },
          },
        },
      },
    }),
    async (c) => {
      const auth = assertCan(c.get("auth"), "system.task.run");
      const db = createDb(c.env.DB);
      const config = await getSiteConfig(c.env, db);

      const result = await runMaintenanceNow(c.env, db, config);
      await bumpCacheVersion(c.env);
      await recordAudit(db, {
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        action: "system.maintenance.run",
        targetType: "system",
        meta: { published: result.published, purged: result.purged, tasks: result.tasks },
        ip: c.req.header("cf-connecting-ip") ?? null,
      });

      return c.json(
        { ok: true as const, data: { published: result.published, purged: result.purged, tasks: result.tasks } },
        200,
      );
    },
  );

  /* ---------------------------------------------------------------- 缓存 */

  app.openapi(
    createRoute({
      method: "delete",
      path: "/cache",
      tags: ["系统设置"],
      summary: "清空页面缓存",
      description: "页面缓存键里带全局版本号，版本号一变旧条目就再也命中不了，等价于全站清缓存。",
      responses: {
        200: {
          description: "已清空",
          content: {
            "application/json": {
              schema: envelope(z.object({ cleared: z.literal(true), version: z.string() })),
            },
          },
        },
      },
    }),
    async (c) => {
      const auth = assertCan(c.get("auth"), "system.task.run");
      const db = createDb(c.env.DB);

      const version = await bumpCacheVersion(c.env);
      await recordAudit(db, {
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        action: "system.cache.clear",
        targetType: "system",
        meta: { version },
        ip: c.req.header("cf-connecting-ip") ?? null,
      });

      return c.json({ ok: true as const, data: { cleared: true as const, version } }, 200);
    },
  );

  return app;
}

export { SettingsOverviewSchema, ThemeManifestSchema };

/** 兼容别名：api/index.ts 挂载时用复数命名。 */
export const createSettingsRoutes = createSettingRoutes;
