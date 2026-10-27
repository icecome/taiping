/**
 * 评论管理（后台）。
 *
 * 与前台提交评论的差别：这里所有动作都带权限断言与审计，并且状态一变就重算
 * contents.comment_count（只统计 approved）—— 列表页的计数必须是"能看见的评论数"，
 * 而不是"库里有几条"，否则审核前后台数字对不上。
 *
 * 评论 body 按纯文本存储（渲染时转义），后台回复也一样，不在服务端塞 HTML。
 */
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { and, count, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { createDb, type Db } from "../db/client";
import { comments, contents } from "../db/schema";
import type { AppBindings } from "../env";
import { recordAudit } from "../lib/audit";
import { bumpCacheVersion } from "../lib/cache";
import { notFound } from "../lib/errors";
import { newId } from "../lib/id";
import { assertCan } from "../lib/rbac";
import { paginated, parsePagination, type PaginationInput } from "../lib/response";
import { COMMENT_STATUSES } from "../shared/content-types";
import { envelope, IdParam, listResponse } from "./schemas";

type CommentRow = typeof comments.$inferSelect;

const CommentStatusEnum = z.enum(["pending", "approved", "spam", "trashed"]);

const CommentSchema = z.object({
  id: z.string(),
  contentId: z.string(),
  contentTitle: z.string().nullable(),
  contentSlug: z.string().nullable(),
  parentId: z.string().nullable(),
  rootId: z.string().nullable(),
  depth: z.number(),
  authorUserId: z.string().nullable(),
  authorName: z.string(),
  authorEmail: z.string().nullable(),
  authorUrl: z.string().nullable(),
  body: z.string(),
  status: z.string(),
  isOwner: z.boolean(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const ListQuery = z.object({
  status: z.enum(["all", "pending", "approved", "spam", "trashed"]).default("all").optional(),
  contentId: z.string().optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(20).optional(),
});

const ModerateBody = z.object({ status: CommentStatusEnum });

const ReplyBody = z.object({ body: z.string().trim().min(1).max(20_000) });

const BulkBody = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  action: z.enum(["approved", "pending", "spam", "trashed", "delete"]),
});

function paginationOf(query: { page?: unknown; pageSize?: unknown }): PaginationInput {
  const raw = (value: unknown): string | undefined =>
    value === undefined || value === null ? undefined : String(value);
  return parsePagination({ page: raw(query.page), pageSize: raw(query.pageSize) });
}

function clientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  return c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";
}

function serialize(row: CommentRow, contentTitle: string | null, contentSlug: string | null) {
  return {
    id: row.id,
    contentId: row.contentId,
    contentTitle,
    contentSlug,
    parentId: row.parentId,
    rootId: row.rootId,
    depth: row.depth,
    authorUserId: row.authorUserId,
    authorName: row.authorName,
    authorEmail: row.authorEmail,
    authorUrl: row.authorUrl,
    body: row.body,
    status: row.status,
    isOwner: row.isOwner,
    ip: row.ip,
    userAgent: row.userAgent,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** 只算 approved，与前台展示口径一致。 */
async function recountCommentCount(db: Db, contentId: string): Promise<void> {
  await db.run(sql`
    update contents set comment_count = (
      select count(*) from comments
      where comments.content_id = ${contentId} and comments.status = 'approved'
    ) where id = ${contentId}
  `);
}

export function createCommentsRoutes(): OpenAPIHono<AppBindings> {
  const app = new OpenAPIHono<AppBindings>();

  /* ---------------------------------------------------------------- 读取 */

  app.openapi(
    createRoute({
      method: "get",
      path: "/",
      tags: ["评论"],
      summary: "评论列表",
      description: "按状态、所属内容与关键词筛选，倒序返回，附带所属内容标题与 slug。",
      request: { query: ListQuery },
      responses: {
        200: { description: "分页列表", content: { "application/json": { schema: listResponse(CommentSchema) } } },
      },
    }),
    async (c) => {
      assertCan(c.get("auth"), "comment.read");
      const query = c.req.valid("query");
      const db = createDb(c.env.DB);
      const { page, pageSize, offset } = paginationOf(query);

      const conditions = [];
      if (query.status && query.status !== "all") conditions.push(eq(comments.status, query.status));
      if (query.contentId) conditions.push(eq(comments.contentId, query.contentId));
      if (query.q) {
        const needle = `%${query.q}%`;
        conditions.push(
          or(like(comments.authorName, needle), like(comments.body, needle), like(comments.authorEmail, needle)),
        );
      }
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const rows = await db
        .select({ comment: comments, contentTitle: contents.title, contentSlug: contents.slug })
        .from(comments)
        .leftJoin(contents, eq(contents.id, comments.contentId))
        .where(where)
        .orderBy(desc(comments.createdAt))
        .limit(pageSize)
        .offset(offset);

      const [totalRow] = await db.select({ value: count() }).from(comments).where(where);

      const items = rows.map((row) => serialize(row.comment, row.contentTitle, row.contentSlug));
      return c.json(
        { ok: true as const, data: paginated(items, Number(totalRow?.value ?? 0), page, pageSize) },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/stats",
      tags: ["评论"],
      summary: "评论状态统计",
      description: "一次分组查询拿到各状态计数，供后台侧边栏角标使用。",
      responses: {
        200: {
          description: "状态计数",
          content: {
            "application/json": {
              schema: envelope(
                z.object({
                  pending: z.number(),
                  approved: z.number(),
                  spam: z.number(),
                  trashed: z.number(),
                  total: z.number(),
                }),
              ),
            },
          },
        },
      },
    }),
    async (c) => {
      assertCan(c.get("auth"), "comment.read");
      const db = createDb(c.env.DB);
      const rows = await db
        .select({ status: comments.status, value: sql<number>`count(*)` })
        .from(comments)
        .groupBy(comments.status);

      const tally: Record<string, number> = {};
      let total = 0;
      for (const row of rows) {
        const value = Number(row.value);
        tally[row.status] = value;
        total += value;
      }
      return c.json(
        {
          ok: true as const,
          data: {
            pending: tally.pending ?? 0,
            approved: tally.approved ?? 0,
            spam: tally.spam ?? 0,
            trashed: tally.trashed ?? 0,
            total,
          },
        },
        200,
      );
    },
  );

  /* ---------------------------------------------------------------- 审核 */

  app.openapi(
    createRoute({
      method: "post",
      path: "/{id}/moderate",
      tags: ["评论"],
      summary: "审核评论",
      description: "通过 / 待审 / 垃圾 / 回收站四态互转，改完重算该内容的 comment_count。",
      request: { params: IdParam, body: { content: { "application/json": { schema: ModerateBody } } } },
      responses: {
        200: { description: "审核成功", content: { "application/json": { schema: envelope(CommentSchema) } } },
      },
    }),
    async (c) => {
      const auth = assertCan(c.get("auth"), "comment.moderate");
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const db = createDb(c.env.DB);

      const [existing] = await db.select().from(comments).where(eq(comments.id, id)).limit(1);
      if (!existing) throw notFound("评论不存在");

      await db
        .update(comments)
        .set({ status: body.status, updatedAt: new Date() })
        .where(eq(comments.id, id));
      await recountCommentCount(db, existing.contentId);

      await recordAudit(db, {
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        action: "comment.moderate",
        targetType: "comment",
        targetId: id,
        meta: { from: existing.status, to: body.status, contentId: existing.contentId },
        ip: clientIp(c),
      });
      await bumpCacheVersion(c.env);

      const row = await loadJoinedComment(db, id);
      return c.json({ ok: true as const, data: row }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/{id}",
      tags: ["评论"],
      summary: "删除评论",
      description: "物理删除该评论及其回复，并重算所属内容的 comment_count。",
      request: { params: IdParam },
      responses: {
        200: {
          description: "删除成功",
          content: {
            "application/json": {
              schema: envelope(z.object({ deleted: z.literal(true), removed: z.number() })),
            },
          },
        },
      },
    }),
    async (c) => {
      const auth = assertCan(c.get("auth"), "comment.delete");
      const { id } = c.req.valid("param");
      const db = createDb(c.env.DB);

      const [existing] = await db.select().from(comments).where(eq(comments.id, id)).limit(1);
      if (!existing) throw notFound("评论不存在");

      const scope = or(eq(comments.id, id), eq(comments.parentId, id), eq(comments.rootId, id));
      const [affected] = await db.select({ value: count() }).from(comments).where(scope);
      await db.delete(comments).where(scope);
      await recountCommentCount(db, existing.contentId);

      await recordAudit(db, {
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        action: "comment.delete",
        targetType: "comment",
        targetId: id,
        meta: { removed: Number(affected?.value ?? 0), contentId: existing.contentId },
        ip: clientIp(c),
      });
      await bumpCacheVersion(c.env);

      return c.json(
        { ok: true as const, data: { deleted: true as const, removed: Number(affected?.value ?? 0) } },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/{id}/reply",
      tags: ["评论"],
      summary: "后台回复评论",
      description:
        "以当前管理员身份直接发一条 approved 回复：authorName 取登录用户 displayName，isOwner=true，depth=父级+1，rootId 沿用父级所在的楼层。",
      request: { params: IdParam, body: { content: { "application/json": { schema: ReplyBody } } } },
      responses: {
        201: { description: "回复成功", content: { "application/json": { schema: envelope(CommentSchema) } } },
      },
    }),
    async (c) => {
      const auth = assertCan(c.get("auth"), "comment.reply");
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const db = createDb(c.env.DB);

      const [parent] = await db.select().from(comments).where(eq(comments.id, id)).limit(1);
      if (!parent) throw notFound("评论不存在");
      const [content] = await db
        .select({ id: contents.id })
        .from(contents)
        .where(eq(contents.id, parent.contentId))
        .limit(1);
      if (!content) throw notFound("评论所属内容不存在");

      const replyId = newId("cmt");
      const now = new Date();
      await db.insert(comments).values({
        id: replyId,
        contentId: parent.contentId,
        parentId: parent.id,
        rootId: parent.rootId ?? parent.id,
        depth: parent.depth + 1,
        authorUserId: auth.user.id,
        authorName: auth.user.displayName,
        authorEmail: auth.user.email,
        authorUrl: null,
        body: body.body,
        status: "approved",
        isOwner: true,
        ip: clientIp(c),
        userAgent: c.req.header("user-agent")?.slice(0, 400) ?? null,
        createdAt: now,
        updatedAt: now,
      });
      await recountCommentCount(db, parent.contentId);

      await recordAudit(db, {
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        action: "comment.reply",
        targetType: "comment",
        targetId: replyId,
        meta: { parentId: parent.id, contentId: parent.contentId },
        ip: clientIp(c),
      });
      await bumpCacheVersion(c.env);

      const row = await loadJoinedComment(db, replyId);
      return c.json({ ok: true as const, data: row }, 201);
    },
  );

  /* ---------------------------------------------------------------- 批量 */

  app.openapi(
    createRoute({
      method: "post",
      path: "/bulk",
      tags: ["评论"],
      summary: "批量审核 / 删除",
      description:
        "逐条处理并回报成功与失败：单条失败不影响整批（例如并发删除导致的 not found）。权限按动作分流：delete 走 comment.delete，其余走 comment.moderate。",
      request: { body: { content: { "application/json": { schema: BulkBody } } } },
      responses: {
        200: {
          description: "处理结果",
          content: {
            "application/json": {
              schema: envelope(
                z.object({
                  succeeded: z.array(z.string()),
                  failed: z.array(z.object({ id: z.string(), reason: z.string() })),
                }),
              ),
            },
          },
        },
      },
    }),
    async (c) => {
      const body = c.req.valid("json");
      const db = createDb(c.env.DB);
      const auth = assertCan(c.get("auth"), body.action === "delete" ? "comment.delete" : "comment.moderate");

      const existingRows = await db
        .select({ id: comments.id, status: comments.status, contentId: comments.contentId })
        .from(comments)
        .where(inArray(comments.id, body.ids));
      const existing = new Map(existingRows.map((row) => [row.id, row]));

      const succeeded: string[] = [];
      const failed: { id: string; reason: string }[] = [];
      const touchedContents = new Set<string>();

      for (const id of body.ids) {
        const row = existing.get(id);
        if (!row) {
          failed.push({ id, reason: "评论不存在" });
          continue;
        }
        try {
          if (body.action === "delete") {
            const scope = or(eq(comments.id, id), eq(comments.parentId, id), eq(comments.rootId, id));
            await db.delete(comments).where(scope);
          } else {
            await db
              .update(comments)
              .set({ status: body.action, updatedAt: new Date() })
              .where(eq(comments.id, id));
          }
          touchedContents.add(row.contentId);
          succeeded.push(id);
        } catch (error) {
          failed.push({ id, reason: error instanceof Error ? error.message : "未知错误" });
        }
      }

      for (const contentId of touchedContents) await recountCommentCount(db, contentId);
      if (touchedContents.size > 0) await bumpCacheVersion(c.env);

      await recordAudit(db, {
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        action: `comment.bulk.${body.action}`,
        targetType: "comment",
        meta: { succeeded: succeeded.length, failed: failed.length },
        ip: clientIp(c),
      });

      return c.json({ ok: true as const, data: { succeeded, failed } }, 200);
    },
  );

  return app;
}

/* ------------------------------------------------------------------ 内部工具 */

/** 审核/回复后回读一条带内容标题的评论，保证响应形状与列表一致。 */
async function loadJoinedComment(db: Db, id: string) {
  const [row] = await db
    .select({ comment: comments, contentTitle: contents.title, contentSlug: contents.slug })
    .from(comments)
    .leftJoin(contents, eq(contents.id, comments.contentId))
    .where(eq(comments.id, id))
    .limit(1);
  if (!row) throw notFound("评论不存在");
  return serialize(row.comment, row.contentTitle, row.contentSlug);
}

export { CommentSchema, COMMENT_STATUSES, createCommentsRoutes as createCommentRoutes };
