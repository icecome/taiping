/**
 * 审计日志。
 *
 * 这里不复用 lib/audit.ts 的 listAuditLogs：那个实现的过滤是"先分页再按 action 过滤"，
 * 命中数、total 与分页边界全是错的。筛选条件一律进 SQL，分页交给数据库，
 * 才谈得上"按时间倒序翻页"。
 *
 * metaJson 在读出时解析成对象再进响应，前端不必自己 JSON.parse；
 * 库里是脏数据时退化为 {}，不让一条坏日志把整页打挂。
 */
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { and, count, desc, eq, gte, like, lt, lte, or } from "drizzle-orm";
import { createDb } from "../db/client";
import { auditLogs } from "../db/schema";
import type { AppBindings } from "../env";
import { recordAudit } from "../lib/audit";
import { badRequest, forbidden } from "../lib/errors";
import { assertCan } from "../lib/rbac";
import { paginated, parsePagination, type PaginationInput } from "../lib/response";
import { envelope, listResponse } from "./schemas";

const AuditEntrySchema = z.object({
  id: z.string(),
  actorId: z.string().nullable(),
  actorName: z.string().nullable(),
  action: z.string(),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  meta: z.record(z.string(), z.unknown()),
  ip: z.string().nullable(),
  createdAt: z.string(),
});

const ListQuery = z.object({
  action: z.string().trim().max(80).optional(),
  actorId: z.string().trim().max(64).optional(),
  targetType: z.string().trim().max(64).optional(),
  q: z.string().trim().max(120).optional(),
  from: z.string().trim().optional().describe("ISO 时间，闭区间起点"),
  to: z.string().trim().optional().describe("ISO 时间，闭区间终点"),
  page: z.coerce.number().int().min(1).default(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(20).optional(),
});

function paginationOf(query: { page?: unknown; pageSize?: unknown }): PaginationInput {
  const raw = (value: unknown): string | undefined =>
    value === undefined || value === null ? undefined : String(value);
  return parsePagination({ page: raw(query.page), pageSize: raw(query.pageSize) });
}

function clientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  return c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";
}

function parseDate(value: string | undefined, field: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw badRequest(`${field} 不是合法的 ISO 时间`, { [field]: "格式错误" });
  return date;
}

function parseMeta(metaJson: string | null): Record<string, unknown> {
  if (!metaJson) return {};
  try {
    const parsed: unknown = JSON.parse(metaJson);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { value: parsed };
  } catch {
    return { raw: metaJson };
  }
}

export function createAuditRoutes(): OpenAPIHono<AppBindings> {
  const app = new OpenAPIHono<AppBindings>();

  /* ---------------------------------------------------------------- 读取 */

  app.openapi(
    createRoute({
      method: "get",
      path: "/",
      tags: ["审计"],
      summary: "审计日志列表",
      description: "按 action / 操作者 / 目标类型 / 关键词 / 时间区间筛选，时间倒序分页，meta 已解析为对象。",
      request: { query: ListQuery },
      responses: {
        200: { description: "分页列表", content: { "application/json": { schema: listResponse(AuditEntrySchema) } } },
      },
    }),
    async (c) => {
      assertCan(c.get("auth"), "system.audit.read");
      const query = c.req.valid("query");
      const db = createDb(c.env.DB);
      const { page, pageSize, offset } = paginationOf(query);

      const from = parseDate(query.from, "from");
      const to = parseDate(query.to, "to");

      const conditions = [];
      if (query.action) conditions.push(eq(auditLogs.action, query.action));
      if (query.actorId) conditions.push(eq(auditLogs.actorId, query.actorId));
      if (query.targetType) conditions.push(eq(auditLogs.targetType, query.targetType));
      if (query.q) {
        const needle = `%${query.q}%`;
        conditions.push(
          or(
            like(auditLogs.action, needle),
            like(auditLogs.actorName, needle),
            like(auditLogs.targetId, needle),
            like(auditLogs.metaJson, needle),
          ),
        );
      }
      if (from) conditions.push(gte(auditLogs.createdAt, from));
      if (to) conditions.push(lte(auditLogs.createdAt, to));
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const rows = await db
        .select()
        .from(auditLogs)
        .where(where)
        .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
        .limit(pageSize)
        .offset(offset);

      const [totalRow] = await db.select({ value: count() }).from(auditLogs).where(where);

      const items = rows.map((row) => ({
        id: row.id,
        actorId: row.actorId,
        actorName: row.actorName,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        meta: parseMeta(row.metaJson),
        ip: row.ip,
        createdAt: row.createdAt.toISOString(),
      }));

      return c.json(
        { ok: true as const, data: paginated(items, Number(totalRow?.value ?? 0), page, pageSize) },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/actions",
      tags: ["审计"],
      summary: "出现过的动作",
      description: "库里去重后的 action 列表，供后台筛选下拉使用。",
      responses: {
        200: {
          description: "动作列表",
          content: {
            "application/json": {
              schema: envelope(z.object({ items: z.array(z.string()) })),
            },
          },
        },
      },
    }),
    async (c) => {
      assertCan(c.get("auth"), "system.audit.read");
      const db = createDb(c.env.DB);
      const rows = await db
        .selectDistinct({ action: auditLogs.action })
        .from(auditLogs)
        .orderBy(auditLogs.action);
      return c.json({ ok: true as const, data: { items: rows.map((row) => row.action) } }, 200);
    },
  );

  /* ---------------------------------------------------------------- 清理 */

  app.openapi(
    createRoute({
      method: "delete",
      path: "/purge",
      tags: ["审计"],
      summary: "清理历史日志",
      description: "删除 before 之前（不含 before）的全部日志。需要 setting.manage 且必须是站点所有者。",
      request: { query: z.object({ before: z.string().min(1).describe("ISO 时间，早于此时间的日志会被删除") }) },
      responses: {
        200: {
          description: "清理结果",
          content: {
            "application/json": {
              schema: envelope(z.object({ deleted: z.number(), before: z.string() })),
            },
          },
        },
      },
    }),
    async (c) => {
      const auth = assertCan(c.get("auth"), "setting.manage");
      if (!auth.isSuperAdmin) throw forbidden("只有站点所有者可以清理审计日志");

      const { before } = c.req.valid("query");
      const date = parseDate(before, "before");
      if (!date) throw badRequest("before 必填", { before: "必填" });

      const db = createDb(c.env.DB);
      const [removed] = await db.select({ value: count() }).from(auditLogs).where(lt(auditLogs.createdAt, date));
      await db.delete(auditLogs).where(lt(auditLogs.createdAt, date));

      await recordAudit(db, {
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        action: "audit.purge",
        targetType: "audit",
        meta: { before: date.toISOString(), deleted: Number(removed?.value ?? 0) },
        ip: clientIp(c),
      });

      return c.json(
        { ok: true as const, data: { deleted: Number(removed?.value ?? 0), before: date.toISOString() } },
        200,
      );
    },
  );

  return app;
}

export { AuditEntrySchema };
