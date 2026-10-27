/**
 * 导航菜单接口。
 *
 * 数据模型是"自引用树"，但存储是扁平的邻接表（parent_id + sort_order），
 * 因为菜单总量极小（几十条），读时拼树比维护物化路径更省事，也不会出现排序漂移。
 *
 * 三个 location 的语义差异只影响前台渲染位置，不影响结构；这里对 header 也照样返回
 * 扁平的 items，方便后台"拖拽排序"页面直接消费，同时额外给一份 tree 给需要嵌套的前台模板。
 */
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import { createDb } from "../db/client";
import { navItems } from "../db/schema";
import type { AppBindings } from "../env";
import { recordAudit } from "../lib/audit";
import { bumpCacheVersion } from "../lib/cache";
import { badRequest, notFound } from "../lib/errors";
import { newId } from "../lib/id";
import { assertCan } from "../lib/rbac";
import { envelope, IdParam } from "./schemas";

/* ------------------------------------------------------------------ schema */

const NavLocationEnum = z.enum(["header", "footer", "sidebar"]);
const NavTargetEnum = z.enum(["_self", "_blank"]);

const NavItemBase = z.object({
  id: z.string(),
  location: NavLocationEnum,
  label: z.string(),
  href: z.string(),
  parentId: z.string().nullable(),
  target: NavTargetEnum,
  icon: z.string().nullable(),
  sortOrder: z.number(),
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * 树形响应 schema。
 * 这里刻意不写递归 schema（z.lazy 会让 OpenAPI 文档生成踩到循环引用），而是显式展开两层：
 * 菜单深度超过两级的站点几乎不存在，schema 只用于文档与类型检查，运行时构造的树不受此限制。
 */
const NavLeafSchema = NavItemBase.extend({ children: z.array(z.unknown()) });
const NavNodeSchema = NavItemBase.extend({ children: z.array(NavLeafSchema) });

const NavListQuery = z.object({
  location: NavLocationEnum.optional(),
  enabledOnly: z.enum(["true", "false", "1", "0"]).optional().describe("只返回启用项，传 true / 1"),
});

const NavBody = z.object({
  location: NavLocationEnum,
  label: z.string().min(1).max(64),
  href: z.string().min(1).max(500),
  parentId: z.string().nullable().optional(),
  target: NavTargetEnum.optional(),
  icon: z.string().max(64).nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  enabled: z.boolean().optional(),
});

const NavReorderBody = z.object({
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        sortOrder: z.number().int().min(0).max(9999),
        parentId: z.string().nullable().optional(),
      }),
    )
    .min(1)
    .max(200),
});

/* ------------------------------------------------------------------ 工具 */

type NavRow = typeof navItems.$inferSelect;
type NavNodeShape = z.infer<typeof NavNodeSchema>;

/** 只放行站内绝对路径与四种协议；javascript: / data: 这类可执行协议在入库前就挡掉。 */
const HREF_PATTERN = /^(\/|https?:\/\/|mailto:|tel:)/i;

function assertHref(href: string): void {
  if (!HREF_PATTERN.test(href)) {
    throw badRequest("链接需以 / 或 http://、https://、mailto:、tel: 开头", { href: "格式不合法" });
  }
}

function serializeNav(row: NavRow, children: NavNodeShape[] = []) {
  return {
    id: row.id,
    location: row.location,
    label: row.label,
    href: row.href,
    parentId: row.parentId,
    target: row.target,
    icon: row.icon,
    sortOrder: row.sortOrder,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    children,
  };
}

/**
 * 拼树：父节点不在本次结果集里（或跨 location）的节点一律当根，
 * 这样 enabledOnly 过滤掉父级时子级不会凭空消失。
 */
function buildTree(rows: NavRow[]): NavNodeShape[] {
  const nodes: NavNodeShape[] = rows.map((row) => serializeNav(row));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const roots: NavNodeShape[] = [];
  for (const node of nodes) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (parent && parent.location === node.location && parent.id !== node.id) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

/** 把 parentId 链走一遍，确认不会绕回自身；用于 PATCH 与 reorder 的环路防护。 */
function wouldCycle(parentOf: Map<string, string | null>, id: string, nextParentId: string | null): boolean {
  if (!nextParentId) return false;
  if (nextParentId === id) return true;
  const seen = new Set<string>([id]);
  let cursor: string | null = nextParentId;
  while (cursor) {
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    cursor = parentOf.get(cursor) ?? null;
  }
  return false;
}

function changedRows(result: unknown): number {
  return Number((result as { meta?: { changes?: number } }).meta?.changes ?? 0);
}

/* ------------------------------------------------------------------ 路由 */

export function createNavRoutes(): OpenAPIHono<AppBindings> {
  const app = new OpenAPIHono<AppBindings>();

  /* ---------------------------------------------------------------- 列表 */

  app.openapi(
    createRoute({
      method: "get",
      path: "/",
      tags: ["导航"],
      summary: "导航列表（含树）",
      description: "items 是扁平列表（后台排序用），tree 是按 parentId 拼好的嵌套结构（前台渲染用）。",
      request: { query: NavListQuery },
      responses: {
        200: {
          description: "导航项",
          content: {
            "application/json": {
              schema: envelope(z.object({ items: z.array(NavNodeSchema), tree: z.array(NavNodeSchema) })),
            },
          },
        },
      },
    }),
    async (c) => {
      assertCan(c.get("auth"), "nav.read");
      const query = c.req.valid("query");
      const db = createDb(c.env.DB);

      const conditions: SQL[] = [];
      if (query.location) conditions.push(eq(navItems.location, query.location));
      if (query.enabledOnly === "true" || query.enabledOnly === "1") conditions.push(eq(navItems.enabled, true));

      const rows = await db
        .select()
        .from(navItems)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(asc(navItems.location), asc(navItems.sortOrder), asc(navItems.createdAt));

      return c.json(
        {
          ok: true as const,
          data: { items: rows.map((row) => serializeNav(row)), tree: buildTree(rows) },
        },
        200,
      );
    },
  );

  /* ---------------------------------------------------------------- 新建 */

  app.openapi(
    createRoute({
      method: "post",
      path: "/",
      tags: ["导航"],
      summary: "新建导航项",
      request: { body: { content: { "application/json": { schema: NavBody } } } },
      responses: {
        201: { description: "创建成功", content: { "application/json": { schema: envelope(NavNodeSchema) } } },
      },
    }),
    async (c) => {
      const auth = assertCan(c.get("auth"), "nav.manage");
      const body = c.req.valid("json");
      const db = createDb(c.env.DB);

      assertHref(body.href);

      if (body.parentId) {
        const [parent] = await db.select().from(navItems).where(eq(navItems.id, body.parentId)).limit(1);
        if (!parent) throw badRequest("父级导航项不存在", { parentId: "不存在" });
        if (parent.location !== body.location) {
          throw badRequest("父级导航项与本项的展示位置不一致", { parentId: `父级在 ${parent.location}` });
        }
      }

      const [maxRow] = await db
        .select({ value: sql<number>`coalesce(max(${navItems.sortOrder}), -1)` })
        .from(navItems)
        .where(eq(navItems.location, body.location));
      const sortOrder = body.sortOrder ?? Number(maxRow?.value ?? -1) + 1;

      const id = newId("nav");
      const now = new Date();
      await db.insert(navItems).values({
        id,
        location: body.location,
        label: body.label,
        href: body.href,
        parentId: body.parentId ?? null,
        target: body.target ?? "_self",
        icon: body.icon ?? null,
        sortOrder,
        enabled: body.enabled ?? true,
        createdAt: now,
        updatedAt: now,
      });

      const [row] = await db.select().from(navItems).where(eq(navItems.id, id)).limit(1);
      await bumpCacheVersion(c.env);
      await recordAudit(db, {
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        action: "nav.create",
        targetType: "nav",
        targetId: id,
        meta: { location: body.location, label: body.label, href: body.href },
        ip: c.req.header("cf-connecting-ip") ?? null,
      });
      return c.json({ ok: true as const, data: serializeNav(row!) }, 201);
    },
  );

  /* ---------------------------------------------------------------- 更新 */

  app.openapi(
    createRoute({
      method: "patch",
      path: "/{id}",
      tags: ["导航"],
      summary: "更新导航项",
      description: "含启用开关与 parentId 调整；parentId 传 null 表示提升为顶级项。",
      request: {
        params: IdParam,
        body: { content: { "application/json": { schema: NavBody.partial() } } },
      },
      responses: {
        200: { description: "更新成功", content: { "application/json": { schema: envelope(NavNodeSchema) } } },
      },
    }),
    async (c) => {
      const auth = assertCan(c.get("auth"), "nav.manage");
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const db = createDb(c.env.DB);

      const [existing] = await db.select().from(navItems).where(eq(navItems.id, id)).limit(1);
      if (!existing) throw notFound("导航项不存在");

      if (body.href !== undefined) assertHref(body.href);

      const allRows = await db.select().from(navItems);
      const parentOf = new Map<string, string | null>(allRows.map((row) => [row.id, row.parentId]));
      const nextLocation = body.location ?? existing.location;
      const nextParentId = body.parentId === undefined ? existing.parentId : body.parentId;

      if (nextParentId) {
        if (nextParentId === id) throw badRequest("导航项不能把自己设为父级", { parentId: "不能是自身" });
        const parent = allRows.find((row) => row.id === nextParentId);
        if (!parent) throw badRequest("父级导航项不存在", { parentId: "不存在" });
        if (parent.location !== nextLocation) {
          throw badRequest("父级导航项与本项的展示位置不一致", { parentId: `父级在 ${parent.location}` });
        }
        if (wouldCycle(parentOf, id, nextParentId)) {
          throw badRequest("该调整会让导航层级形成环", { parentId: "形成环" });
        }
      }

      const patch: Partial<typeof navItems.$inferInsert> = { updatedAt: new Date() };
      if (body.location !== undefined) patch.location = body.location;
      if (body.label !== undefined) patch.label = body.label;
      if (body.href !== undefined) patch.href = body.href;
      if (body.parentId !== undefined) patch.parentId = body.parentId;
      if (body.target !== undefined) patch.target = body.target;
      if (body.icon !== undefined) patch.icon = body.icon;
      if (body.sortOrder !== undefined) patch.sortOrder = body.sortOrder;
      if (body.enabled !== undefined) patch.enabled = body.enabled;

      await db.update(navItems).set(patch).where(eq(navItems.id, id));
      const [row] = await db.select().from(navItems).where(eq(navItems.id, id)).limit(1);
      await bumpCacheVersion(c.env);
      await recordAudit(db, {
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        action: "nav.update",
        targetType: "nav",
        targetId: id,
        meta: { fields: Object.keys(patch), enabled: row?.enabled },
        ip: c.req.header("cf-connecting-ip") ?? null,
      });
      return c.json({ ok: true as const, data: serializeNav(row!) }, 200);
    },
  );

  /* ---------------------------------------------------------------- 删除 */

  app.openapi(
    createRoute({
      method: "delete",
      path: "/{id}",
      tags: ["导航"],
      summary: "删除导航项",
      description: "删除后把子项的 parentId 置空（提升为顶级），避免留下悬挂引用。",
      request: { params: IdParam },
      responses: {
        200: {
          description: "已删除",
          content: {
            "application/json": {
              schema: envelope(z.object({ deleted: z.literal(true), detachedChildren: z.number() })),
            },
          },
        },
      },
    }),
    async (c) => {
      const auth = assertCan(c.get("auth"), "nav.manage");
      const { id } = c.req.valid("param");
      const db = createDb(c.env.DB);

      const [existing] = await db.select().from(navItems).where(eq(navItems.id, id)).limit(1);
      if (!existing) throw notFound("导航项不存在");

      const result = await db
        .update(navItems)
        .set({ parentId: null, updatedAt: new Date() })
        .where(eq(navItems.parentId, id));
      const detachedChildren = changedRows(result);

      await db.delete(navItems).where(eq(navItems.id, id));
      await bumpCacheVersion(c.env);
      await recordAudit(db, {
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        action: "nav.delete",
        targetType: "nav",
        targetId: id,
        meta: { label: existing.label, detachedChildren },
        ip: c.req.header("cf-connecting-ip") ?? null,
      });
      return c.json({ ok: true as const, data: { deleted: true as const, detachedChildren } }, 200);
    },
  );

  /* ---------------------------------------------------------------- 排序 */

  app.openapi(
    createRoute({
      method: "post",
      path: "/reorder",
      tags: ["导航"],
      summary: "批量排序 / 换父级",
      description: "一次提交整棵菜单的目标顺序；未提交的项保持原状。",
      request: { body: { content: { "application/json": { schema: NavReorderBody } } } },
      responses: {
        200: { description: "已保存", content: { "application/json": { schema: envelope(z.object({ updated: z.number() })) } } },
      },
    }),
    async (c) => {
      const auth = assertCan(c.get("auth"), "nav.manage");
      const body = c.req.valid("json");
      const db = createDb(c.env.DB);

      const rows = await db.select().from(navItems);
      const byId = new Map(rows.map((row) => [row.id, row]));

      const parentOf = new Map<string, string | null>(rows.map((row) => [row.id, row.parentId]));
      for (const item of body.items) {
        const current = byId.get(item.id);
        if (!current) throw badRequest(`导航项不存在：${item.id}`, { items: item.id });
        if (item.parentId !== undefined) {
          if (item.parentId) {
            const parent = byId.get(item.parentId);
            if (!parent) throw badRequest(`父级导航项不存在：${item.parentId}`, { items: item.parentId });
            if (parent.location !== current.location) {
              throw badRequest("父级导航项与本项的展示位置不一致", { items: item.parentId });
            }
          }
          parentOf.set(item.id, item.parentId);
        }
      }
      // 环路检查放在所有目标 parent 应用之后，这样"两两互换父子"这种批量操作也能被正确判定。
      for (const item of body.items) {
        if (item.parentId === undefined) continue;
        const target = parentOf.get(item.id) ?? null;
        if (wouldCycle(parentOf, item.id, target)) {
          throw badRequest("该排序会让导航层级形成环", { items: item.id });
        }
      }

      for (const item of body.items) {
        const patch: Partial<typeof navItems.$inferInsert> = { sortOrder: item.sortOrder, updatedAt: new Date() };
        if (item.parentId !== undefined) patch.parentId = item.parentId;
        await db.update(navItems).set(patch).where(eq(navItems.id, item.id));
      }

      await bumpCacheVersion(c.env);
      await recordAudit(db, {
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        action: "nav.reorder",
        targetType: "nav",
        meta: { count: body.items.length },
        ip: c.req.header("cf-connecting-ip") ?? null,
      });
      return c.json({ ok: true as const, data: { updated: body.items.length } }, 200);
    },
  );

  return app;
}

export { NavNodeSchema, NavBody };
