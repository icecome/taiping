/**
 * 内容模型接口（自定义字段定义）
 *
 * 这里只管"字段长什么样"，不管"某篇内容填了什么"——后者由 contents 接口在保存时
 * 通过 syncContentFields 落到 field_values 表。分开的理由：改字段定义是低频的结构操作，
 * 需要唯一性与类型校验；写字段值是高频的内容操作，两者权限（field.manage / content.update）也不同。
 *
 * 三列 JSON 的读法：options_json / applies_to_json / default_value_json 在入库时序列化，
 * 出参统一解析成结构化值，避免让后台自己 JSON.parse 出 undefined。
 */
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { asc, count, eq } from "drizzle-orm";
import { createDb } from "../db/client";
import { fieldDefinitions, fieldValues } from "../db/schema";
import type { AppBindings } from "../env";
import { recordAudit } from "../lib/audit";
import { bumpCacheVersion } from "../lib/cache";
import { badRequest, conflict, notFound } from "../lib/errors";
import { newId } from "../lib/id";
import { assertCan } from "../lib/rbac";
import { CONTENT_TYPE_KEYS, FIELD_TYPES } from "../shared/content-types";
import { envelope, IdParam } from "./schemas";

/* ------------------------------------------------------------------ schema */

const FIELD_TYPE_KEYS: string[] = FIELD_TYPES.map((type) => type.key);

const FieldOptionSchema = z.object({ value: z.string().min(1).max(120), label: z.string().min(1).max(120) });

const FieldSchema = z.object({
  id: z.string(),
  key: z.string(),
  label: z.string(),
  description: z.string().nullable(),
  fieldType: z.string(),
  options: z.array(FieldOptionSchema),
  defaultValue: z.unknown(),
  appliesTo: z.array(z.string()),
  isRequired: z.boolean(),
  sortOrder: z.number(),
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const FieldListQuery = z.object({
  type: z.string().max(32).optional().describe("内容类型，仅返回适用于该类型的字段"),
  enabledOnly: z.enum(["true", "false", "1", "0"]).optional(),
});

const FieldBody = z.object({
  key: z
    .string()
    .regex(/^[a-z][a-z0-9_]{1,31}$/, "key 需为小写字母开头、只含小写字母/数字/下划线，长度 2-32")
    .describe("字段标识，创建后不可修改"),
  label: z.string().min(1).max(64),
  description: z.string().max(300).nullable().optional(),
  fieldType: z.string().min(1).max(32).describe(`取值：${FIELD_TYPE_KEYS.join(" / ")}`),
  options: z.array(FieldOptionSchema).max(100).optional().describe("select 类型的候选值"),
  defaultValue: z.unknown().optional(),
  appliesTo: z.array(z.string().max(32)).max(20).optional().describe('["*"] 表示适用于全部内容类型'),
  isRequired: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  enabled: z.boolean().optional(),
});

const FieldReorderBody = z.object({
  items: z.array(z.object({ id: z.string().min(1), sortOrder: z.number().int().min(0).max(9999) })).min(1).max(200),
});

/* ------------------------------------------------------------------ 工具 */

type FieldRow = typeof fieldDefinitions.$inferSelect;

function parseJsonColumn<T>(raw: string | null, fallback: T): T {
  if (raw === null || raw === "") return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

function serializeField(row: FieldRow) {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    description: row.description,
    fieldType: row.fieldType,
    options: parseJsonColumn<{ value: string; label: string }[]>(row.optionsJson, []),
    defaultValue: parseJsonColumn<unknown>(row.defaultValueJson, null),
    appliesTo: parseJsonColumn<string[]>(row.appliesToJson, ["*"]),
    isRequired: row.isRequired,
    sortOrder: row.sortOrder,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function assertFieldType(fieldType: string): void {
  if (!FIELD_TYPE_KEYS.includes(fieldType)) {
    throw badRequest(`不支持字段类型：${fieldType}`, { fieldType: `可用类型：${FIELD_TYPE_KEYS.join("、")}` });
  }
}

function normalizeAppliesTo(input: string[] | undefined): string[] {
  if (!input || input.length === 0) return ["*"];
  const cleaned = input.map((item) => item.trim()).filter(Boolean);
  for (const item of cleaned) {
    if (item !== "*" && !CONTENT_TYPE_KEYS.includes(item)) {
      throw badRequest(`appliesTo 含未知内容类型：${item}`, { appliesTo: `可用类型：* 、${CONTENT_TYPE_KEYS.join("、")}` });
    }
  }
  return cleaned.length > 0 ? cleaned : ["*"];
}

function normalizeOptions(
  fieldType: string,
  options: { value: string; label: string }[] | undefined,
): { value: string; label: string }[] {
  const list = options ?? [];
  if (fieldType === "select" && list.length === 0) {
    throw badRequest("下拉选择类型的字段必须提供至少一个候选值", { options: "不能为空" });
  }
  const seen = new Set<string>();
  for (const option of list) {
    if (seen.has(option.value)) throw badRequest(`候选值重复：${option.value}`, { options: "候选值需唯一" });
    seen.add(option.value);
  }
  return list;
}

/** 默认值按字段类型归一，避免把 "3" 写进数字字段后前台要额外兜底。 */
function normalizeDefault(
  fieldType: string,
  raw: unknown,
  options: { value: string; label: string }[],
): unknown {
  if (raw === undefined || raw === null || raw === "") return null;
  switch (fieldType) {
    case "number": {
      const value = Number(raw);
      if (!Number.isFinite(value)) throw badRequest("数字字段的默认值必须是数字", { defaultValue: "必须是数字" });
      return value;
    }
    case "boolean":
      return raw === true || raw === "true" || raw === 1 || raw === "1";
    case "select": {
      const value = String(raw);
      if (!options.some((option) => option.value === value)) {
        throw badRequest("默认值不在候选值范围内", { defaultValue: "不在候选项内" });
      }
      return value;
    }
    default:
      return typeof raw === "string" ? raw : JSON.stringify(raw);
  }
}

/* ------------------------------------------------------------------ 路由 */

export function createFieldRoutes(): OpenAPIHono<AppBindings> {
  const app = new OpenAPIHono<AppBindings>();

  /* ---------------------------------------------------------------- 列表 */

  app.openapi(
    createRoute({
      method: "get",
      path: "/",
      tags: ["内容模型"],
      summary: "字段定义列表",
      description: "按 sortOrder、key 排序；type 传入时只返回适用于该内容类型的字段（含 appliesTo = ['*'] 的通用字段）。",
      request: { query: FieldListQuery },
      responses: {
        200: {
          description: "字段定义",
          content: { "application/json": { schema: envelope(z.object({ items: z.array(FieldSchema) })) } },
        },
      },
    }),
    async (c) => {
      assertCan(c.get("auth"), "field.read");
      const query = c.req.valid("query");
      const db = createDb(c.env.DB);

      const rows = await db.select().from(fieldDefinitions).orderBy(asc(fieldDefinitions.sortOrder), asc(fieldDefinitions.key));
      const enabledOnly = query.enabledOnly === "true" || query.enabledOnly === "1";

      // appliesTo 存在 JSON 列里，无法在 SQL 里高效匹配（也没必要：字段定义通常只有几十条）。
      const items = rows
        .filter((row) => (enabledOnly ? row.enabled : true))
        .filter((row) => {
          if (!query.type) return true;
          const appliesTo = parseJsonColumn<string[]>(row.appliesToJson, ["*"]);
          return appliesTo.includes("*") || appliesTo.includes(query.type);
        })
        .map(serializeField);

      return c.json({ ok: true as const, data: { items } }, 200);
    },
  );

  /* ---------------------------------------------------------------- 新建 */

  app.openapi(
    createRoute({
      method: "post",
      path: "/",
      tags: ["内容模型"],
      summary: "新建字段定义",
      request: { body: { content: { "application/json": { schema: FieldBody } } } },
      responses: {
        201: { description: "创建成功", content: { "application/json": { schema: envelope(FieldSchema) } } },
      },
    }),
    async (c) => {
      const auth = assertCan(c.get("auth"), "field.manage");
      const body = c.req.valid("json");
      const db = createDb(c.env.DB);

      assertFieldType(body.fieldType);

      const [dupe] = await db.select({ id: fieldDefinitions.id }).from(fieldDefinitions).where(eq(fieldDefinitions.key, body.key)).limit(1);
      if (dupe) throw conflict(`字段 key 已被占用：${body.key}`, { key: "重复" });

      const options = normalizeOptions(body.fieldType, body.options);
      const appliesTo = normalizeAppliesTo(body.appliesTo);
      const defaultValue = normalizeDefault(body.fieldType, body.defaultValue, options);

      const id = newId("fld");
      const now = new Date();
      await db.insert(fieldDefinitions).values({
        id,
        key: body.key,
        label: body.label,
        description: body.description ?? null,
        fieldType: body.fieldType,
        optionsJson: JSON.stringify(options),
        defaultValueJson: JSON.stringify(defaultValue),
        appliesToJson: JSON.stringify(appliesTo),
        isRequired: body.isRequired ?? false,
        sortOrder: body.sortOrder ?? 0,
        enabled: body.enabled ?? true,
        createdAt: now,
        updatedAt: now,
      });

      const [row] = await db.select().from(fieldDefinitions).where(eq(fieldDefinitions.id, id)).limit(1);
      // R6：字段定义会改变前台字段回显（标签、顺序、启用状态），写后立即失效页面缓存。
      await bumpCacheVersion(c.env);
      await recordAudit(db, {
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        action: "field.create",
        targetType: "field",
        targetId: id,
        meta: { key: body.key, fieldType: body.fieldType, appliesTo },
        ip: c.req.header("cf-connecting-ip") ?? null,
      });
      return c.json({ ok: true as const, data: serializeField(row!) }, 201);
    },
  );

  /* ---------------------------------------------------------------- 更新 */

  app.openapi(
    createRoute({
      method: "patch",
      path: "/{id}",
      tags: ["内容模型"],
      summary: "更新字段定义",
      description: "key 创建后不可修改；改 fieldType 不会迁移历史值，需要调用方自行评估。",
      request: {
        params: IdParam,
        body: { content: { "application/json": { schema: FieldBody.partial() } } },
      },
      responses: {
        200: { description: "更新成功", content: { "application/json": { schema: envelope(FieldSchema) } } },
      },
    }),
    async (c) => {
      const auth = assertCan(c.get("auth"), "field.manage");
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const db = createDb(c.env.DB);

      const [existing] = await db.select().from(fieldDefinitions).where(eq(fieldDefinitions.id, id)).limit(1);
      if (!existing) throw notFound("字段定义不存在");

      // key 是索引路径（field_values.field_key），改它等于悄悄丢掉所有历史值，因此显式拒绝。
      if (body.key !== undefined && body.key !== existing.key) {
        throw badRequest("字段 key 创建后不可修改", { key: "不可修改" });
      }

      const fieldType = body.fieldType ?? existing.fieldType;
      if (body.fieldType !== undefined) assertFieldType(body.fieldType);

      const options =
        body.options !== undefined ? normalizeOptions(fieldType, body.options) : parseJsonColumn<{ value: string; label: string }[]>(existing.optionsJson, []);
      if (fieldType === "select" && options.length === 0) {
        throw badRequest("下拉选择类型的字段必须提供至少一个候选值", { options: "不能为空" });
      }

      const patch: Partial<typeof fieldDefinitions.$inferInsert> = { updatedAt: new Date() };
      if (body.label !== undefined) patch.label = body.label;
      if (body.description !== undefined) patch.description = body.description;
      if (body.fieldType !== undefined) patch.fieldType = body.fieldType;
      if (body.options !== undefined) patch.optionsJson = JSON.stringify(options);
      if (body.appliesTo !== undefined) patch.appliesToJson = JSON.stringify(normalizeAppliesTo(body.appliesTo));
      if (body.isRequired !== undefined) patch.isRequired = body.isRequired;
      if (body.sortOrder !== undefined) patch.sortOrder = body.sortOrder;
      if (body.enabled !== undefined) patch.enabled = body.enabled;
      if (body.defaultValue !== undefined) {
        patch.defaultValueJson = JSON.stringify(normalizeDefault(fieldType, body.defaultValue, options));
      }

      await db.update(fieldDefinitions).set(patch).where(eq(fieldDefinitions.id, id));
      const [row] = await db.select().from(fieldDefinitions).where(eq(fieldDefinitions.id, id)).limit(1);
      await bumpCacheVersion(c.env);
      await recordAudit(db, {
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        action: "field.update",
        targetType: "field",
        targetId: id,
        meta: { key: existing.key, fields: Object.keys(patch) },
        ip: c.req.header("cf-connecting-ip") ?? null,
      });
      return c.json({ ok: true as const, data: serializeField(row!) }, 200);
    },
  );

  /* ---------------------------------------------------------------- 删除 */

  app.openapi(
    createRoute({
      method: "delete",
      path: "/{id}",
      tags: ["内容模型"],
      summary: "删除字段定义（连带清理字段值）",
      description: "先统计再删除 field_values 中该 key 的全部值，响应里的 removedValues 是清理条数。",
      request: { params: IdParam },
      responses: {
        200: {
          description: "已删除",
          content: {
            "application/json": {
              schema: envelope(z.object({ deleted: z.literal(true), removedValues: z.number() })),
            },
          },
        },
      },
    }),
    async (c) => {
      const auth = assertCan(c.get("auth"), "field.manage");
      const { id } = c.req.valid("param");
      const db = createDb(c.env.DB);

      const [existing] = await db.select().from(fieldDefinitions).where(eq(fieldDefinitions.id, id)).limit(1);
      if (!existing) throw notFound("字段定义不存在");

      const [valueRow] = await db
        .select({ value: count() })
        .from(fieldValues)
        .where(eq(fieldValues.fieldKey, existing.key));
      const removedValues = Number(valueRow?.value ?? 0);

      await db.delete(fieldValues).where(eq(fieldValues.fieldKey, existing.key));
      await db.delete(fieldDefinitions).where(eq(fieldDefinitions.id, id));
      await bumpCacheVersion(c.env);
      await recordAudit(db, {
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        action: "field.delete",
        targetType: "field",
        targetId: id,
        meta: { key: existing.key, removedValues },
        ip: c.req.header("cf-connecting-ip") ?? null,
      });
      return c.json({ ok: true as const, data: { deleted: true as const, removedValues } }, 200);
    },
  );

  /* ---------------------------------------------------------------- 排序 */

  app.openapi(
    createRoute({
      method: "post",
      path: "/reorder",
      tags: ["内容模型"],
      summary: "批量调整字段顺序",
      description: "顺序即内容编辑表单里的字段排列顺序。",
      request: { body: { content: { "application/json": { schema: FieldReorderBody } } } },
      responses: {
        200: { description: "已保存", content: { "application/json": { schema: envelope(z.object({ updated: z.number() })) } } },
      },
    }),
    async (c) => {
      const auth = assertCan(c.get("auth"), "field.manage");
      const body = c.req.valid("json");
      const db = createDb(c.env.DB);

      const rows = await db.select({ id: fieldDefinitions.id }).from(fieldDefinitions);
      const ids = new Set(rows.map((row) => row.id));
      for (const item of body.items) {
        if (!ids.has(item.id)) throw badRequest(`字段定义不存在：${item.id}`, { items: item.id });
      }

      for (const item of body.items) {
        await db
          .update(fieldDefinitions)
          .set({ sortOrder: item.sortOrder, updatedAt: new Date() })
          .where(eq(fieldDefinitions.id, item.id));
      }

      await bumpCacheVersion(c.env);
      await recordAudit(db, {
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        action: "field.reorder",
        targetType: "field",
        meta: { count: body.items.length },
        ip: c.req.header("cf-connecting-ip") ?? null,
      });
      return c.json({ ok: true as const, data: { updated: body.items.length } }, 200);
    },
  );

  return app;
}

export { FieldSchema, FIELD_TYPE_KEYS };

/**
 * 兼容别名：api/index.ts 里挂载时用的是复数命名（字段定义是一组资源的集合）。
 * 两个名字都导出，避免装配点与领域文件命名口径不一致时再改一边。
 */
export const createFieldsRoutes = createFieldRoutes;
