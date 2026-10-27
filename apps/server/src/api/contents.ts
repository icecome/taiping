/**
 * 内容管理接口（文章 / 页面 / 动态 / 项目共用一套）。
 *
 * 权限模型：读取要 content.read；写入按"是不是自己的内容"分流到 .own / .any。
 * 状态流转单独开接口，是因为它牵涉发布权限、定时时间和索引刷新，
 * 混在 PATCH 里会让"改个错别字顺手把草稿发了"这种事变得可能。
 */
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { and, desc, eq, sql } from "drizzle-orm";
import { createDb } from "../db/client";
import { contentRevisions, contents } from "../db/schema";
import type { AppBindings } from "../env";
import { recordAudit } from "../lib/audit";
import {
  createContent,
  listContents,
  loadContentRelations,
  purgeContent,
  restoreContent,
  slugTaken,
  syncContentFields,
  syncContentTerms,
  transitionStatus,
  updateContent,
} from "../lib/content-service";
import { badRequest, conflict, notFound } from "../lib/errors";
import { runCall, runFilter, getEnabledPluginKeys } from "../lib/hooks";
import { assertCan, assertContentAccess } from "../lib/rbac";
import { ok, paginated, parsePagination } from "../lib/response";
import { getSiteConfig, siteSetting } from "../lib/settings";
import { resolveUniqueSlug } from "../lib/slug";
import { CONTENT_TYPE_KEYS, CONTENT_TYPES } from "../shared/content-types";
import { ContentTypeEnum, envelope, IdParam, listResponse, PageMetaSchema, TimestampSchema } from "./schemas";
import { newId } from "../lib/id";

const ContentSummarySchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  slug: z.string(),
  excerpt: z.string().nullable(),
  status: z.string(),
  visibility: z.string(),
  authorId: z.string(),
  authorName: z.string().nullable(),
  coverUrl: z.string().nullable(),
  isPinned: z.boolean(),
  allowComment: z.boolean(),
  wordCount: z.number(),
  readingMinutes: z.number(),
  viewCount: z.number(),
  commentCount: z.number(),
  publishedAt: TimestampSchema,
  scheduledAt: TimestampSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: TimestampSchema,
  terms: z.array(z.object({ id: z.string(), type: z.string(), name: z.string(), slug: z.string() })),
});

const ContentDetailSchema = ContentSummarySchema.extend({
  bodyMarkdown: z.string(),
  bodyHtml: z.string(),
  template: z.string().nullable(),
  seoTitle: z.string().nullable(),
  seoDescription: z.string().nullable(),
  seoKeywords: z.string().nullable(),
  canonicalUrl: z.string().nullable(),
  ogImageUrl: z.string().nullable(),
  coverMediaId: z.string().nullable(),
  extra: z.record(z.string(), z.unknown()),
  fields: z.array(z.object({ key: z.string(), label: z.string(), value: z.string() })),
  hasPassword: z.boolean(),
  revisionCount: z.number(),
});

const ListQuery = z.object({
  type: z.string().optional().describe("内容类型，多个用逗号分隔"),
  status: z.string().default("all").optional(),
  termId: z.string().optional(),
  authorId: z.string().optional(),
  q: z.string().optional(),
  sort: z.enum(["updated", "created", "published", "title", "views"]).default("updated").optional(),
  page: z.coerce.number().int().min(1).default(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(20).optional(),
});

const ContentBody = z.object({
  type: ContentTypeEnum,
  title: z.string().min(1).max(200),
  slug: z.string().max(200).optional(),
  excerpt: z.string().max(600).nullable().optional(),
  bodyMarkdown: z.string().max(500_000),
  status: z.enum(["draft", "pending", "scheduled", "published"]).optional(),
  visibility: z.enum(["public", "private", "password"]).optional(),
  template: z.string().max(64).nullable().optional(),
  password: z.string().max(64).nullable().optional(),
  isPinned: z.boolean().optional(),
  allowComment: z.boolean().optional(),
  coverMediaId: z.string().nullable().optional(),
  seoTitle: z.string().max(200).nullable().optional(),
  seoDescription: z.string().max(400).nullable().optional(),
  seoKeywords: z.string().max(200).nullable().optional(),
  canonicalUrl: z.string().max(400).nullable().optional(),
  ogImageUrl: z.string().max(400).nullable().optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  termIds: z.array(z.string()).max(64).optional(),
  fields: z.record(z.string(), z.unknown()).optional(),
  changeNote: z.string().max(200).optional(),
});

function serializeSummary(
  row: typeof contents.$inferSelect,
  relations: Awaited<ReturnType<typeof loadContentRelations>>,
) {
  const rel = relations.get(row.id);
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    status: row.status,
    visibility: row.visibility,
    authorId: row.authorId,
    authorName: rel?.author?.displayName ?? null,
    coverUrl: rel?.coverUrl ?? null,
    isPinned: row.isPinned,
    allowComment: row.allowComment,
    wordCount: row.wordCount,
    readingMinutes: row.readingMinutes,
    viewCount: row.viewCount,
    commentCount: row.commentCount,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
    terms: rel?.terms ?? [],
  };
}

export function createContentRoutes(): OpenAPIHono<AppBindings> {
  const app = new OpenAPIHono<AppBindings>();

  /* ---------------------------------------------------------------- 读取 */

  app.openapi(
    createRoute({
      method: "get",
      path: "/",
      tags: ["内容"],
      summary: "内容列表",
      request: { query: ListQuery },
      responses: {
        200: { description: "分页列表", content: { "application/json": { schema: listResponse(ContentSummarySchema) } } },
      },
    }),
    async (c) => {
      const auth = assertCan(c.get("auth"), "content.read");
      const query = c.req.valid("query");
      const db = createDb(c.env.DB);
      const { page, pageSize } = parsePagination(query as Record<string, string | undefined>);

      // 只有 content.update.any 及以上的人才看得到别人的内容。
      const canSeeAll = auth.isSuperAdmin || auth.permissions.includes("content.update.any");
      const filters = {
        types: query.type ? query.type.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
        status: query.status ?? "all",
        termId: query.termId,
        authorId: canSeeAll ? query.authorId : auth.user.id,
        query: query.q,
        page,
        pageSize,
        sort: query.sort ?? "updated",
      };

      const { items, total } = await listContents(db, filters);
      const relations = await loadContentRelations(db, items);
      return ok(c, paginated(items.map((row) => serializeSummary(row, relations)), total, page, pageSize));
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/{id}",
      tags: ["内容"],
      summary: "内容详情（编辑态）",
      request: { params: IdParam },
      responses: {
        200: { description: "详情", content: { "application/json": { schema: envelope(ContentDetailSchema) } } },
      },
    }),
    async (c) => {
      const auth = assertCan(c.get("auth"), "content.read");
      const { id } = c.req.valid("param");
      const db = createDb(c.env.DB);

      const [row] = await db.select().from(contents).where(eq(contents.id, id)).limit(1);
      if (!row) throw notFound("内容不存在");
      const canSeeAll = auth.isSuperAdmin || auth.permissions.includes("content.update.any");
      if (!canSeeAll && row.authorId !== auth.user.id) throw notFound("内容不存在");

      const relations = await loadContentRelations(db, [row]);
      const [revisionCountRow] = await db
        .select({ value: sql<number>`count(*)` })
        .from(contentRevisions)
        .where(eq(contentRevisions.contentId, id));

      return ok(c, {
        ...serializeSummary(row, relations),
        bodyMarkdown: row.bodyMarkdown,
        bodyHtml: row.bodyHtml,
        template: row.template,
        seoTitle: row.seoTitle,
        seoDescription: row.seoDescription,
        seoKeywords: row.seoKeywords,
        canonicalUrl: row.canonicalUrl,
        ogImageUrl: row.ogImageUrl,
        coverMediaId: row.coverMediaId,
        extra: safeJson(row.extraJson),
        fields: relations.get(row.id)?.fields ?? [],
        hasPassword: !!row.password,
        revisionCount: Number(revisionCountRow?.value ?? 0),
      });
    },
  );

  /* ---------------------------------------------------------------- 写入 */

  app.openapi(
    createRoute({
      method: "post",
      path: "/",
      tags: ["内容"],
      summary: "创建内容",
      request: { body: { content: { "application/json": { schema: ContentBody } } } },
      responses: {
        201: { description: "创建成功", content: { "application/json": { schema: envelope(ContentDetailSchema) } } },
      },
    }),
    async (c) => {
      const auth = assertCan(c.get("auth"), "content.create");
      const body = c.req.valid("json");
      const db = createDb(c.env.DB);
      const config = await getSiteConfig(c.env, db);

      if (body.status === "published" || body.status === "scheduled") {
        assertContentAccess(auth, "publish", { authorId: auth.user.id });
      }
      if (body.visibility === "password" && !body.password) {
        throw badRequest("密码保护内容必须设置密码", { password: "必填" });
      }

      const slug = await resolveUniqueSlug(
        body.slug?.trim() || body.title,
        (candidate) => slugTaken(db, candidate),
        body.type,
      );

      const enabled = await getEnabledPluginKeys(c.env, db);
      const hookCtx = { env: c.env, db, config, request: c.req.raw };

      const result = await createContent(
        c.env,
        db,
        auth.user.id,
        {
          ...body,
          slug,
          scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
        },
        {
          excerptLength: Number(siteSetting<number>(config, "excerptLength") ?? 160),
          wordsPerMinute: Number(siteSetting<number>(config, "readingMinutesBase") ?? 400),
          transformBody: async (markdown) => {
            const filtered = await runFilter(
              "content.beforeSave",
              { body: markdown, content: { type: body.type, title: body.title } },
              hookCtx,
              enabled,
            );
            return filtered.body;
          },
        },
      );

      if (body.termIds) await syncContentTerms(db, result.row.id, body.termIds);
      if (body.fields) await syncContentFields(db, result.row.id, body.fields);

      const relations = await loadContentRelations(db, [result.row]);
      await recordAudit(db, {
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        action: "content.create",
        targetType: "content",
        targetId: result.row.id,
        meta: { type: result.row.type, title: result.row.title },
        ip: c.req.header("cf-connecting-ip") ?? null,
      });

      return c.json(
        {
          ok: true as const,
          data: detailPayload(result.row, relations, 0),
        },
        201,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/{id}",
      tags: ["内容"],
      summary: "更新内容",
      request: {
        params: IdParam,
        body: { content: { "application/json": { schema: ContentBody.partial() } } },
      },
      responses: {
        200: { description: "更新成功", content: { "application/json": { schema: envelope(ContentSummarySchema) } } },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const db = createDb(c.env.DB);

      const [existing] = await db.select().from(contents).where(eq(contents.id, id)).limit(1);
      if (!existing) throw notFound("内容不存在");
      // 断言函数返回收窄后的上下文，后面直接用它的 user.id，不再依赖 c.get("auth") 的非空推断。
      const auth = assertContentAccess(c.get("auth"), "update", existing);

      if (body.status && body.status !== existing.status) {
        throw badRequest("请使用状态流转接口修改发布状态", { status: "改用 POST /api/contents/{id}/status" });
      }

      const config = await getSiteConfig(c.env, db);
      const enabled = await getEnabledPluginKeys(c.env, db);
      const hookCtx = { env: c.env, db, config, request: c.req.raw };

      let slug = existing.slug;
      if (body.slug !== undefined && body.slug.trim() !== existing.slug) {
        slug = await resolveUniqueSlug(body.slug.trim(), (candidate) => slugTaken(db, candidate, id), existing.type);
      }

      // 拆出非持久化字段：changeNote 只进版本备注，termIds / fields 走关联同步，
      // scheduledAt 需要从 ISO 字符串转成 Date（服务层不接受字符串）。
      const { changeNote, termIds, fields, scheduledAt, ...rest } = body;

      const result = await updateContent(
        c.env,
        db,
        id,
        {
          ...rest,
          slug,
          ...(scheduledAt !== undefined ? { scheduledAt: scheduledAt ? new Date(scheduledAt) : null } : {}),
        },
        {
          excerptLength: Number(siteSetting<number>(config, "excerptLength") ?? 160),
          wordsPerMinute: Number(siteSetting<number>(config, "readingMinutesBase") ?? 400),
          transformBody: async (markdown) => {
            const filtered = await runFilter(
              "content.beforeSave",
              { body: markdown, content: { type: existing.type, title: body.title ?? existing.title } },
              hookCtx,
              enabled,
            );
            return filtered.body;
          },
        },
        auth.user.id,
        changeNote,
      );

      if (termIds) await syncContentTerms(db, id, termIds);
      if (fields) await syncContentFields(db, id, fields);

      const relations = await loadContentRelations(db, [result.row]);
      await recordAudit(db, {
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        action: "content.update",
        targetType: "content",
        targetId: id,
        meta: { revisionNo: result.revisionNo },
      });
      return ok(c, serializeSummary(result.row, relations));
    },
  );

  /* ---------------------------------------------------------------- 状态流转 */

  const StatusBody = z.object({
    target: z.enum(["draft", "pending", "scheduled", "published", "trashed"]),
    scheduledAt: z.string().datetime().nullable().optional(),
    note: z.string().max(200).optional(),
  });

  app.openapi(
    createRoute({
      method: "post",
      path: "/{id}/status",
      tags: ["内容"],
      summary: "状态流转",
      description: "发布 / 取消发布 / 定时 / 提交审核 / 移入回收站。发布需 content.publish.own 或 .any。",
      request: { params: IdParam, body: { content: { "application/json": { schema: StatusBody } } } },
      responses: {
        200: { description: "流转成功", content: { "application/json": { schema: envelope(ContentSummarySchema) } } },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const db = createDb(c.env.DB);

      const [existing] = await db.select().from(contents).where(eq(contents.id, id)).limit(1);
      if (!existing) throw notFound("内容不存在");

      const auth =
        body.target === "published" || body.target === "scheduled"
          ? assertContentAccess(c.get("auth"), "publish", existing)
          : body.target === "trashed"
            ? assertContentAccess(c.get("auth"), "delete", existing)
            : assertContentAccess(c.get("auth"), "update", existing);

      await transitionStatus(c.env, db, id, body.target, {
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
        editorId: auth.user.id,
      });

      const [row] = await db.select().from(contents).where(eq(contents.id, id)).limit(1);
      const relations = await loadContentRelations(db, [row!]);
      await recordAudit(db, {
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        action: `content.${body.target}`,
        targetType: "content",
        targetId: id,
        meta: { note: body.note },
      });

      if (body.target === "published") {
        const config = await getSiteConfig(c.env, db);
        const enabled = await getEnabledPluginKeys(c.env, db);
        await runCall(
          "content.afterPublish",
          {
            content: {
              id: row.id,
              type: row.type,
              slug: row.slug,
              title: row.title,
              url: `/${row.type === "page" ? "" : `${row.type}/`}${row.slug}`,
              authorId: row.authorId,
              authorName: relations.get(row.id)?.author?.displayName ?? null,
              publishedAt: row.publishedAt,
            },
          },
          { env: c.env, db, config, request: c.req.raw },
          enabled,
        );
      }

      return ok(c, serializeSummary(row, relations));
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/{id}",
      tags: ["内容"],
      summary: "移入回收站",
      request: { params: IdParam },
      responses: {
        200: { description: "已移入回收站", content: { "application/json": { schema: envelope(ContentSummarySchema) } } },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const db = createDb(c.env.DB);
      const [existing] = await db.select().from(contents).where(eq(contents.id, id)).limit(1);
      if (!existing) throw notFound("内容不存在");
      const auth = assertContentAccess(c.get("auth"), "delete", existing);

      await transitionStatus(c.env, db, id, "trashed", { editorId: auth.user.id });
      const [row] = await db.select().from(contents).where(eq(contents.id, id)).limit(1);
      const relations = await loadContentRelations(db, [row!]);
      await recordAudit(db, {
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        action: "content.trash",
        targetType: "content",
        targetId: id,
      });
      return ok(c, serializeSummary(row!, relations));
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/{id}/restore",
      tags: ["内容"],
      summary: "从回收站恢复",
      request: { params: IdParam },
      responses: {
        200: { description: "已恢复", content: { "application/json": { schema: envelope(ContentSummarySchema) } } },
      },
    }),
    async (c) => {
      const auth = assertCan(c.get("auth"), "content.restore");
      const { id } = c.req.valid("param");
      const db = createDb(c.env.DB);
      const row = await restoreContent(c.env, db, id);
      const relations = await loadContentRelations(db, [row]);
      await recordAudit(db, {
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        action: "content.restore",
        targetType: "content",
        targetId: id,
      });
      return ok(c, serializeSummary(row, relations));
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/{id}/purge",
      tags: ["内容"],
      summary: "彻底删除",
      description: "物理删除内容、版本、评论与索引，不可恢复。",
      request: { params: IdParam },
      responses: {
        200: { description: "已删除", content: { "application/json": { schema: envelope(z.object({ purged: z.literal(true) })) } } },
      },
    }),
    async (c) => {
      const auth = assertCan(c.get("auth"), "content.restore");
      const { id } = c.req.valid("param");
      const db = createDb(c.env.DB);
      await purgeContent(c.env, db, id);
      await recordAudit(db, {
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        action: "content.purge",
        targetType: "content",
        targetId: id,
      });
      return ok(c, { purged: true as const });
    },
  );

  /* ---------------------------------------------------------------- 批量 */

  const BulkBody = z.object({
    ids: z.array(z.string()).min(1).max(200),
    action: z.enum(["publish", "trash", "restore", "purge", "pending"]),
  });

  app.openapi(
    createRoute({
      method: "post",
      path: "/bulk",
      tags: ["内容"],
      summary: "批量操作",
      request: { body: { content: { "application/json": { schema: BulkBody } } } },
      responses: {
        200: {
          description: "处理结果",
          content: {
            "application/json": {
              schema: envelope(z.object({ succeeded: z.array(z.string()), failed: z.array(z.object({ id: z.string(), reason: z.string() })) })),
            },
          },
        },
      },
    }),
    async (c) => {
      const auth = c.get("auth");
      const body = c.req.valid("json");
      const db = createDb(c.env.DB);

      const succeeded: string[] = [];
      const failed: { id: string; reason: string }[] = [];

      for (const id of body.ids) {
        try {
          const [existing] = await db.select().from(contents).where(eq(contents.id, id)).limit(1);
          if (!existing) throw notFound("内容不存在");

          if (body.action === "publish" || body.action === "pending") {
            assertContentAccess(auth, "publish", existing);
            await transitionStatus(c.env, db, id, body.action === "publish" ? "published" : "pending", {
              editorId: auth!.user.id,
            });
          } else if (body.action === "trash") {
            assertContentAccess(auth, "delete", existing);
            await transitionStatus(c.env, db, id, "trashed", { editorId: auth!.user.id });
          } else if (body.action === "restore") {
            assertCan(auth, "content.restore");
            await restoreContent(c.env, db, id);
          } else {
            assertCan(auth, "content.restore");
            await purgeContent(c.env, db, id);
          }
          succeeded.push(id);
        } catch (error) {
          failed.push({ id, reason: error instanceof Error ? error.message : "未知错误" });
        }
      }

      await recordAudit(db, {
        actorId: auth!.user.id,
        actorName: auth!.user.displayName,
        action: `content.bulk.${body.action}`,
        targetType: "content",
        meta: { succeeded: succeeded.length, failed: failed.length },
      });
      return ok(c, { succeeded, failed });
    },
  );

  /* ---------------------------------------------------------------- 版本 */

  app.openapi(
    createRoute({
      method: "get",
      path: "/{id}/revisions",
      tags: ["内容"],
      summary: "版本列表",
      request: { params: IdParam },
      responses: {
        200: {
          description: "版本列表",
          content: {
            "application/json": {
              schema: envelope(
                z.object({
                  items: z.array(
                    z.object({
                      id: z.string(),
                      revisionNo: z.number(),
                      title: z.string(),
                      status: z.string(),
                      note: z.string().nullable(),
                      authorId: z.string(),
                      createdAt: z.string(),
                      bodyLength: z.number(),
                    }),
                  ),
                }),
              ),
            },
          },
        },
      },
    }),
    async (c) => {
      assertCan(c.get("auth"), "content.read");
      const { id } = c.req.valid("param");
      const db = createDb(c.env.DB);
      const rows = await db
        .select()
        .from(contentRevisions)
        .where(eq(contentRevisions.contentId, id))
        .orderBy(desc(contentRevisions.revisionNo))
        .limit(100);
      return ok(c, {
        items: rows.map((row) => ({
          id: row.id,
          revisionNo: row.revisionNo,
          title: row.title,
          status: row.status,
          note: row.note,
          authorId: row.authorId,
          createdAt: row.createdAt.toISOString(),
          bodyLength: row.bodyMarkdown.length,
        })),
      });
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/{id}/revisions/{revisionId}/restore",
      tags: ["内容"],
      summary: "回滚到指定版本",
      request: { params: IdParam.extend({ revisionId: z.string().min(1) }) },
      responses: {
        200: { description: "已回滚", content: { "application/json": { schema: envelope(ContentSummarySchema) } } },
      },
    }),
    async (c) => {
      const auth = c.get("auth");
      const { id, revisionId } = c.req.valid("param");
      const db = createDb(c.env.DB);

      const [existing] = await db.select().from(contents).where(eq(contents.id, id)).limit(1);
      if (!existing) throw notFound("内容不存在");
      assertContentAccess(auth, "update", existing);

      const [revision] = await db
        .select()
        .from(contentRevisions)
        .where(and(eq(contentRevisions.id, revisionId), eq(contentRevisions.contentId, id)))
        .limit(1);
      if (!revision) throw notFound("版本不存在");

      const config = await getSiteConfig(c.env, db);
      const result = await updateContent(
        c.env,
        db,
        id,
        { title: revision.title, bodyMarkdown: revision.bodyMarkdown, excerpt: revision.excerpt },
        {
          excerptLength: Number(siteSetting<number>(config, "excerptLength") ?? 160),
          wordsPerMinute: Number(siteSetting<number>(config, "readingMinutesBase") ?? 400),
        },
        auth!.user.id,
        `回滚到 v${revision.revisionNo}`,
      );
      if (existing.status === "published") {
        const { refreshSearchIndex: refresh } = await import("../lib/search");
        await refresh(c.env, db, id);
      }
      const relations = await loadContentRelations(db, [result.row]);
      await recordAudit(db, {
        actorId: auth!.user.id,
        actorName: auth!.user.displayName,
        action: "content.revision.restore",
        targetType: "content",
        targetId: id,
        meta: { revisionNo: revision.revisionNo },
      });
      return ok(c, serializeSummary(result.row, relations));
    },
  );

  return app;
}

function safeJson(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value || "{}");
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function detailPayload(
  row: typeof contents.$inferSelect,
  relations: Awaited<ReturnType<typeof loadContentRelations>>,
  revisionCount: number,
) {
  const rel = relations.get(row.id);
  return {
    ...serializeSummary(row, relations),
    bodyMarkdown: row.bodyMarkdown,
    bodyHtml: row.bodyHtml,
    template: row.template,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    seoKeywords: row.seoKeywords,
    canonicalUrl: row.canonicalUrl,
    ogImageUrl: row.ogImageUrl,
    coverMediaId: row.coverMediaId,
    extra: safeJson(row.extraJson),
    fields: rel?.fields ?? [],
    hasPassword: !!row.password,
    revisionCount,
  };
}

export { ContentSummarySchema, ContentDetailSchema, PageMetaSchema, CONTENT_TYPES, CONTENT_TYPE_KEYS, newId };
