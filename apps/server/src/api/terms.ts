/**
 * 分类 / 标签 / 系列。
 *
 * 三种分类法共用一张 terms 表，差异只在两点：
 *   - category 有层级（parent_id 自引用），列表按树返回；tag / series 平铺。
 *   - 层级类型才允许设置 parentId，平铺类型设了就报错，避免出现"看不见的父亲"。
 *
 * 读路径的两条硬约束：
 *   1. 树用"一次查询 + 内存组装"产出，不做 N+1 —— 分类数量级在百，全量拉回比递归查询便宜得多；
 *   2. count 是 content_terms 的冗余计数（写入方 content-service.recalcTermCounts 维护），
 *      withCount=true 时用一条聚合查询实时重算，false 时直接用列值。
 */
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { createDb } from "../db/client";
import { contents, contentTerms, terms } from "../db/schema";
import type { AppBindings } from "../env";
import { recordAudit } from "../lib/audit";
import { bumpCacheVersion } from "../lib/cache";
import { badRequest, notFound } from "../lib/errors";
import { newId } from "../lib/id";
import { assertCan } from "../lib/rbac";
import { paginated, parsePagination, type PaginationInput } from "../lib/response";
import { resolveUniqueSlug } from "../lib/slug";
import { TERM_TYPES } from "../shared/content-types";
import { envelope, IdParam, listResponse } from "./schemas";

type TermRow = typeof terms.$inferSelect;

/** 树的最大文档化深度（比实际层级多留两层，避免真实分类被 schema 截断）。 */
const TREE_SCHEMA_DEPTH = 4;

const TermCoreFields = {
  id: z.string(),
  type: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  parentId: z.string().nullable(),
  coverMediaId: z.string().nullable(),
  count: z.number().describe("关联内容数：withCount=true 时为实时值，否则为冗余列值"),
  sortOrder: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
};

/**
 * 递归结构用有限层展开而不是 z.lazy：
 * z.lazy 在 openapi 文档生成阶段会被 eager 求值，自引用会直接把 /api/doc 打挂。
 */
function termNodeSchema(depth: number): z.ZodTypeAny {
  const children = depth <= 0 ? z.array(z.unknown()) : z.array(termNodeSchema(depth - 1));
  return z.object({ ...TermCoreFields, children });
}
const TermNodeSchema = termNodeSchema(TREE_SCHEMA_DEPTH);

type TermNode = ReturnType<typeof serializeTerm> & { children: TermNode[] };

const ListQuery = z.object({
  type: z.enum(["category", "tag", "series"]).default("category").optional(),
  q: z.string().trim().max(120).optional(),
  withCount: z.enum(["true", "false"]).default("true").optional(),
  page: z.coerce.number().int().min(1).default(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(20).optional(),
});

const CreateBody = z.object({
  type: z.enum(["category", "tag", "series"]),
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().max(120).optional(),
  description: z.string().max(600).nullable().optional(),
  parentId: z.string().nullable().optional(),
  coverMediaId: z.string().nullable().optional(),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
});

const UpdateBody = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  slug: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(600).nullable().optional(),
  parentId: z.string().nullable().optional(),
  coverMediaId: z.string().nullable().optional(),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
});

const ReorderBody = z.object({
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        sortOrder: z.number().int().min(0).max(100_000),
        parentId: z.string().nullable().optional(),
      }),
    )
    .min(1)
    .max(500),
});

const TermContentSchema = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  type: z.string(),
  status: z.string(),
  publishedAt: z.string().nullable(),
});

function paginationOf(query: { page?: unknown; pageSize?: unknown }): PaginationInput {
  const raw = (value: unknown): string | undefined =>
    value === undefined || value === null ? undefined : String(value);
  return parsePagination({ page: raw(query.page), pageSize: raw(query.pageSize) });
}

function serializeTerm(row: TermRow) {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    slug: row.slug,
    description: row.description,
    parentId: row.parentId,
    coverMediaId: row.coverMediaId,
    count: row.count,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isHierarchical(type: string): boolean {
  return TERM_TYPES.find((entry) => entry.key === type)?.hierarchical ?? false;
}

export function createTermsRoutes(): OpenAPIHono<AppBindings> {
  const app = new OpenAPIHono<AppBindings>();

  /* ---------------------------------------------------------------- 读取 */

  app.openapi(
    createRoute({
      method: "get",
      path: "/",
      tags: ["分类与标签"],
      summary: "分类法列表",
      description:
        "type=category 返回树（children 递归嵌套，一次查询后在内存里组装）；tag/series 返回平铺列表并按 count 倒序。",
      request: { query: ListQuery },
      responses: {
        200: { description: "分页列表", content: { "application/json": { schema: listResponse(TermNodeSchema) } } },
      },
    }),
    async (c) => {
      assertCan(c.get("auth"), "term.read");
      const query = c.req.valid("query");
      const db = createDb(c.env.DB);
      const { page, pageSize } = paginationOf(query);
      const type = query.type ?? "category";
      const liveCount = (query.withCount ?? "true") !== "false";

      const rows = await db
        .select()
        .from(terms)
        .where(eq(terms.type, type))
        .orderBy(asc(terms.sortOrder), asc(terms.name));

      const countMap = liveCount ? await liveCountsByTerm(db) : null;
      const countOf = (row: TermRow): number => (countMap ? (countMap.get(row.id) ?? 0) : row.count);

      if (type === "category") {
        const needle = query.q?.toLowerCase();
        const matched = needle
          ? rows.filter((row) => row.name.toLowerCase().includes(needle) || row.slug.includes(needle))
          : rows;
        if (needle) {
          // 命中的节点要连同祖先一起留下，否则树会断链、分类看起来"跑到了根上"。
          const byId = new Map(rows.map((row) => [row.id, row]));
          const kept = new Map<string, TermRow>();
          for (const row of matched) {
            let current: TermRow | undefined = row;
            while (current && !kept.has(current.id)) {
              kept.set(current.id, current);
              current = current.parentId ? byId.get(current.parentId) : undefined;
            }
          }
          const visible = rows.filter((row) => kept.has(row.id));
          const forest = buildForest(visible, countOf);
          const pageItems = forest.slice((page - 1) * pageSize, page * pageSize);
          return c.json({ ok: true as const, data: paginated(pageItems, forest.length, page, pageSize) }, 200);
        }

        const forest = buildForest(rows, countOf);
        const pageItems = forest.slice((page - 1) * pageSize, page * pageSize);
        return c.json({ ok: true as const, data: paginated(pageItems, forest.length, page, pageSize) }, 200);
      }

      const needle = query.q?.toLowerCase();
      const filtered = needle
        ? rows.filter((row) => row.name.toLowerCase().includes(needle) || row.slug.includes(needle))
        : rows;
      const sorted = [...filtered].sort((a, b) => countOf(b) - countOf(a) || a.name.localeCompare(b.name));
      const items = sorted
        .slice((page - 1) * pageSize, page * pageSize)
        .map((row) => ({ ...serializeTerm(row), count: countOf(row), children: [] as TermNode[] }));
      return c.json({ ok: true as const, data: paginated(items, sorted.length, page, pageSize) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/{id}/contents",
      tags: ["分类与标签"],
      summary: "分类下的内容",
      description: "只返回 id 与标题等预览字段。分类可用 withChildren=true 连带子分类一起查。",
      request: {
        params: IdParam,
        query: z.object({
          withChildren: z.enum(["true", "false"]).default("false").optional(),
          page: z.coerce.number().int().min(1).default(1).optional(),
          pageSize: z.coerce.number().int().min(1).max(100).default(20).optional(),
        }),
      },
      responses: {
        200: { description: "分页列表", content: { "application/json": { schema: listResponse(TermContentSchema) } } },
      },
    }),
    async (c) => {
      assertCan(c.get("auth"), "term.read");
      const { id } = c.req.valid("param");
      const query = c.req.valid("query");
      const db = createDb(c.env.DB);
      const { page, pageSize, offset } = paginationOf(query);

      const [term] = await db.select().from(terms).where(eq(terms.id, id)).limit(1);
      if (!term) throw notFound("分类不存在");

      let termIds = [term.id];
      if ((query.withChildren ?? "false") === "true" && isHierarchical(term.type)) {
        const siblings = await db
          .select({ id: terms.id, parentId: terms.parentId })
          .from(terms)
          .where(eq(terms.type, term.type));
        termIds = collectDescendants(siblings, term.id);
      }

      const where = and(
        inArray(contentTerms.termId, termIds),
        isNull(contents.deletedAt),
        ne(contents.status, "trashed"),
      );

      const rows = await db
        .select({
          id: contents.id,
          title: contents.title,
          slug: contents.slug,
          type: contents.type,
          status: contents.status,
          publishedAt: contents.publishedAt,
        })
        .from(contentTerms)
        .innerJoin(contents, eq(contents.id, contentTerms.contentId))
        .where(where)
        .orderBy(desc(contents.publishedAt), desc(contents.createdAt))
        .limit(pageSize)
        .offset(offset);

      const [totalRow] = await db
        .select({ value: sql<number>`count(*)` })
        .from(contentTerms)
        .innerJoin(contents, eq(contents.id, contentTerms.contentId))
        .where(where);

      const items = rows.map((row) => ({
        id: row.id,
        title: row.title,
        slug: row.slug,
        type: row.type,
        status: row.status,
        publishedAt: row.publishedAt?.toISOString() ?? null,
      }));

      return c.json(
        { ok: true as const, data: paginated(items, Number(totalRow?.value ?? 0), page, pageSize) },
        200,
      );
    },
  );

  /* ---------------------------------------------------------------- 写入 */

  app.openapi(
    createRoute({
      method: "post",
      path: "/",
      tags: ["分类与标签"],
      summary: "新建分类/标签/系列",
      description: "slug 缺省时由 name 生成；同 type 内重复会自动追加 -2/-3。",
      request: { body: { content: { "application/json": { schema: CreateBody } } } },
      responses: {
        201: { description: "创建成功", content: { "application/json": { schema: envelope(TermNodeSchema) } } },
      },
    }),
    async (c) => {
      const auth = assertCan(c.get("auth"), "term.manage");
      const body = c.req.valid("json");
      const db = createDb(c.env.DB);

      const parentId = body.parentId ?? null;
      if (parentId) await assertParent(db, body.type, parentId, null);

      const slug = await resolveUniqueSlug(
        body.slug || body.name,
        (candidate) => slugTakenWithinType(db, body.type, candidate),
        body.type,
      );

      const id = newId("trm");
      const now = new Date();
      await db.insert(terms).values({
        id,
        type: body.type,
        name: body.name,
        slug,
        description: body.description ?? null,
        parentId,
        coverMediaId: body.coverMediaId ?? null,
        count: 0,
        sortOrder: body.sortOrder ?? 0,
        createdAt: now,
        updatedAt: now,
      });

      await recordAudit(db, {
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        action: "term.create",
        targetType: "term",
        targetId: id,
        meta: { type: body.type, name: body.name, slug, parentId },
        ip: clientIp(c),
      });
      await bumpCacheVersion(c.env);

      const [row] = await db.select().from(terms).where(eq(terms.id, id)).limit(1);
      return c.json({ ok: true as const, data: { ...serializeTerm(row!), children: [] as TermNode[] } }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/{id}",
      tags: ["分类与标签"],
      summary: "更新分类/标签/系列",
      description: "改 slug 会重新做同 type 内唯一化解；parentId 会做同类型、同层级与成环校验。",
      request: { params: IdParam, body: { content: { "application/json": { schema: UpdateBody } } } },
      responses: {
        200: { description: "更新成功", content: { "application/json": { schema: envelope(TermNodeSchema) } } },
      },
    }),
    async (c) => {
      const auth = assertCan(c.get("auth"), "term.manage");
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const db = createDb(c.env.DB);

      const [existing] = await db.select().from(terms).where(eq(terms.id, id)).limit(1);
      if (!existing) throw notFound("分类不存在");

      const patch: Partial<typeof terms.$inferInsert> = { updatedAt: new Date() };
      if (body.name !== undefined) patch.name = body.name;
      if (body.description !== undefined) patch.description = body.description;
      if (body.coverMediaId !== undefined) patch.coverMediaId = body.coverMediaId;
      if (body.sortOrder !== undefined) patch.sortOrder = body.sortOrder;

      if (body.slug !== undefined && body.slug !== existing.slug) {
        patch.slug = await resolveUniqueSlug(
          body.slug,
          (candidate) => slugTakenWithinType(db, existing.type, candidate, id),
          existing.type,
        );
      }

      if (body.parentId !== undefined && body.parentId !== existing.parentId) {
        if (body.parentId === null) {
          patch.parentId = null;
        } else {
          await assertParent(db, existing.type, body.parentId, existing.id);
          patch.parentId = body.parentId;
        }
      }

      await db.update(terms).set(patch).where(eq(terms.id, id));
      await recordAudit(db, {
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        action: "term.update",
        targetType: "term",
        targetId: id,
        meta: { slug: patch.slug ?? existing.slug, parentId: patch.parentId ?? existing.parentId },
        ip: clientIp(c),
      });
      await bumpCacheVersion(c.env);

      const [row] = await db.select().from(terms).where(eq(terms.id, id)).limit(1);
      const childRows = await db
        .select()
        .from(terms)
        .where(eq(terms.parentId, id))
        .orderBy(asc(terms.sortOrder), asc(terms.name));
      return c.json(
        {
          ok: true as const,
          data: {
            ...serializeTerm(row!),
            children: childRows.map((child) => ({ ...serializeTerm(child), children: [] as TermNode[] })),
          },
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/{id}",
      tags: ["分类与标签"],
      summary: "删除分类/标签/系列",
      description:
        "先删 content_terms 关联再删词条，内容本身不受影响（只是少了一个分类）。子分类会被上提到被删词条的父级，避免整棵子树失踪。",
      request: { params: IdParam },
      responses: {
        200: {
          description: "删除成功",
          content: {
            "application/json": {
              schema: envelope(
                z.object({ deleted: z.literal(true), affectedContents: z.number().describe("受影响的内容数") }),
              ),
            },
          },
        },
      },
    }),
    async (c) => {
      const auth = assertCan(c.get("auth"), "term.manage");
      const { id } = c.req.valid("param");
      const db = createDb(c.env.DB);

      const [existing] = await db.select().from(terms).where(eq(terms.id, id)).limit(1);
      if (!existing) throw notFound("分类不存在");

      const [affected] = await db
        .select({ value: sql<number>`count(*)` })
        .from(contentTerms)
        .where(eq(contentTerms.termId, id));

      await db.delete(contentTerms).where(eq(contentTerms.termId, id));
      await db.update(terms).set({ parentId: existing.parentId, updatedAt: new Date() }).where(eq(terms.parentId, id));
      await db.delete(terms).where(eq(terms.id, id));

      await recordAudit(db, {
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        action: "term.delete",
        targetType: "term",
        targetId: id,
        meta: { type: existing.type, name: existing.name, affectedContents: Number(affected?.value ?? 0) },
        ip: clientIp(c),
      });
      await bumpCacheVersion(c.env);

      return c.json(
        { ok: true as const, data: { deleted: true as const, affectedContents: Number(affected?.value ?? 0) } },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/reorder",
      tags: ["分类与标签"],
      summary: "批量排序 / 移动",
      description: "一次提交若干 { id, sortOrder, parentId }，成环与跨类型父级会被整体拒绝，不做半截写入。",
      request: { body: { content: { "application/json": { schema: ReorderBody } } } },
      responses: {
        200: {
          description: "排序成功",
          content: { "application/json": { schema: envelope(z.object({ updated: z.number() })) } },
        },
      },
    }),
    async (c) => {
      const auth = assertCan(c.get("auth"), "term.manage");
      const body = c.req.valid("json");
      const db = createDb(c.env.DB);

      // 一次拉全表做校验：分类法总量在百级，内存校验比逐条递归查询便宜，且能整批原子拒绝。
      const all = await db.select({ id: terms.id, type: terms.type, parentId: terms.parentId }).from(terms);
      const known = new Map(all.map((row) => [row.id, row]));
      const proposed = new Map<string, string | null>(all.map((row) => [row.id, row.parentId]));

      for (const item of body.items) {
        const current = known.get(item.id);
        if (!current) throw notFound(`词条不存在：${item.id}`);
        if (item.parentId === undefined) continue;
        if (item.parentId !== null) {
          const parent = known.get(item.parentId);
          if (!parent) throw notFound(`父级不存在：${item.parentId}`);
          if (parent.type !== current.type) throw badRequest("父级与子级必须属于同一分类法");
          if (!isHierarchical(current.type)) throw badRequest(`${current.type} 不支持层级结构`);
          if (reaches(proposed, item.parentId, item.id)) throw badRequest("父子关系成环，已拒绝整批排序");
        }
        proposed.set(item.id, item.parentId);
      }

      const now = new Date();
      const statements = body.items.map((item) =>
        db
          .update(terms)
          .set({ sortOrder: item.sortOrder, ...(item.parentId === undefined ? {} : { parentId: item.parentId }), updatedAt: now })
          .where(eq(terms.id, item.id)),
      );
      const [head, ...tail] = statements;
      if (head) await db.batch([head, ...tail]);

      await recordAudit(db, {
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        action: "term.reorder",
        targetType: "term",
        meta: { count: body.items.length },
        ip: clientIp(c),
      });
      await bumpCacheVersion(c.env);

      return c.json({ ok: true as const, data: { updated: body.items.length } }, 200);
    },
  );

  return app;
}

/* ------------------------------------------------------------------ 内部工具 */

function clientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  return c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";
}

/** 同 type 内 slug 是否被占用；排除自身用于更新场景。 */
async function slugTakenWithinType(
  db: ReturnType<typeof createDb>,
  type: string,
  slug: string,
  excludeId?: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: terms.id })
    .from(terms)
    .where(and(eq(terms.type, type), eq(terms.slug, slug)))
    .limit(1);
  if (!row) return false;
  return excludeId ? row.id !== excludeId : true;
}

/** 一条聚合查询拿到全部分类法的实时内容数，避免对每个词条各查一次。 */
async function liveCountsByTerm(db: ReturnType<typeof createDb>): Promise<Map<string, number>> {
  const rows = await db
    .select({ termId: contentTerms.termId, value: sql<number>`count(*)` })
    .from(contentTerms)
    .innerJoin(contents, eq(contents.id, contentTerms.contentId))
    .where(and(eq(contents.status, "published"), isNull(contents.deletedAt)))
    .groupBy(contentTerms.termId);
  return new Map(rows.map((row) => [row.termId, Number(row.value)]));
}

function buildForest(rows: TermRow[], countOf: (row: TermRow) => number): TermNode[] {
  const nodes = new Map<string, TermNode>();
  for (const row of rows) nodes.set(row.id, { ...serializeTerm(row), count: countOf(row), children: [] });

  const roots: TermNode[] = [];
  for (const row of rows) {
    const node = nodes.get(row.id);
    if (!node) continue;
    const parent = row.parentId ? nodes.get(row.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

function collectDescendants(
  rows: { id: string; parentId: string | null }[],
  rootId: string,
): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.parentId) continue;
    const bucket = childrenOf.get(row.parentId);
    if (bucket) bucket.push(row.id);
    else childrenOf.set(row.parentId, [row.id]);
  }
  const out: string[] = [];
  const stack = [rootId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    out.push(current);
    for (const child of childrenOf.get(current) ?? []) stack.push(child);
  }
  return out;
}

/** 沿 proposed 的父子关系向上走，判断 from 是否落在 to 之下（成环即真）。 */
function reaches(parentOf: Map<string, string | null>, from: string, to: string): boolean {
  let current: string | null = from;
  const seen = new Set<string>();
  while (current) {
    if (current === to) return true;
    if (seen.has(current)) return true;
    seen.add(current);
    current = parentOf.get(current) ?? null;
  }
  return false;
}

/** 父级必须存在、同类型、且该类型支持层级；更新时还要防成环。 */
async function assertParent(
  db: ReturnType<typeof createDb>,
  type: string,
  parentId: string,
  selfId: string | null,
): Promise<void> {
  if (!isHierarchical(type)) throw badRequest(`${type} 不支持层级结构，不能设置父级`);
  if (selfId && parentId === selfId) throw badRequest("父级不能是自己");

  const rows = await db.select({ id: terms.id, type: terms.type, parentId: terms.parentId }).from(terms);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const parent = byId.get(parentId);
  if (!parent) throw notFound("父级不存在");
  if (parent.type !== type) throw badRequest("父级与子级必须属于同一分类法");
  if (selfId && reaches(new Map(rows.map((row) => [row.id, row.parentId])), parentId, selfId)) {
    throw badRequest("不能把父级设置为自己的后代");
  }
}

export { TermNodeSchema, createTermsRoutes as createTermRoutes };
