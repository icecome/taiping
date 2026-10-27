/**
 * 仪表盘接口。
 *
 * 后台首页要的是"一眼看出站点状态"，所以这里刻意做成一次请求返回全部卡片数据：
 * 分接口拆开会让首屏出现五六个 loading 骨架，而管理员点开后台的第一件事就是看总量与待办。
 *
 * 两条纪律：
 * 1. 计数一律下推给 SQL（count / 条件求和），绝不把整表拉进内存再 filter ——
 *    内容表是唯一会持续增长的表，在 Worker 的内存与 CPU 预算里这点最要命。
 * 2. 趋势图用一条 GROUP BY 查询拿全部日期，缺的日期在内存里补 0（补齐是 14 次循环，不是 14 次查询）。
 */
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { and, desc, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import { createDb } from "../db/client";
import { comments, contents, media, plugins, terms, users } from "../db/schema";
import type { AppBindings } from "../env";
import { assertCan } from "../lib/rbac";
import { envelope } from "./schemas";

/* ------------------------------------------------------------------ schema */

const RecentContentSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  slug: z.string(),
  status: z.string(),
  updatedAt: z.string(),
  authorName: z.string().nullable(),
});

const RecentCommentSchema = z.object({
  id: z.string(),
  contentId: z.string(),
  contentTitle: z.string(),
  authorName: z.string(),
  body: z.string(),
  status: z.string(),
  createdAt: z.string(),
});

const TopContentSchema = z.object({
  id: z.string(),
  title: z.string(),
  viewCount: z.number(),
  commentCount: z.number(),
});

const TrendPointSchema = z.object({ date: z.string(), count: z.number() });

const DashboardSchema = z.object({
  counts: z.object({
    contents: z.number(),
    published: z.number(),
    drafts: z.number(),
    pending: z.number(),
    scheduled: z.number(),
    trashed: z.number(),
    comments: z.number(),
    pendingComments: z.number(),
    media: z.number(),
    users: z.number(),
    terms: z.number(),
    plugins: z.number(),
  }),
  recentContents: z.array(RecentContentSchema),
  recentComments: z.array(RecentCommentSchema),
  topContents: z.array(TopContentSchema),
  publishTrend: z.array(TrendPointSchema),
  system: z.object({
    environment: z.string(),
    requestId: z.string(),
    database: z.literal("D1"),
    storage: z.literal("R2"),
    version: z.literal("1.0.0"),
  }),
});

/* ------------------------------------------------------------------ 工具 */

const TREND_DAYS = 14;
const RECENT_LIMIT = 8;

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/* ------------------------------------------------------------------ 路由 */

export function createDashboardRoutes(): OpenAPIHono<AppBindings> {
  const app = new OpenAPIHono<AppBindings>();

  app.openapi(
    createRoute({
      method: "get",
      path: "/",
      tags: ["仪表盘"],
      summary: "后台首页数据",
      description: "总量统计、最近内容与评论、浏览量排行、近 14 天发布趋势一次返回。",
      responses: {
        200: { description: "仪表盘数据", content: { "application/json": { schema: envelope(DashboardSchema) } } },
      },
    }),
    async (c) => {
      assertCan(c.get("auth"), "content.read");
      const db = createDb(c.env.DB);

      // 一次扫描算出全部内容状态：条件求和比 5 条 count 查询少 4 次 D1 往返。
      const contentStatsPromise = db
        .select({
          total: sql<number>`count(*)`,
          published: sql<number>`coalesce(sum(case when ${contents.status} = 'published' then 1 else 0 end), 0)`,
          drafts: sql<number>`coalesce(sum(case when ${contents.status} = 'draft' then 1 else 0 end), 0)`,
          pending: sql<number>`coalesce(sum(case when ${contents.status} = 'pending' then 1 else 0 end), 0)`,
          scheduled: sql<number>`coalesce(sum(case when ${contents.status} = 'scheduled' then 1 else 0 end), 0)`,
          trashed: sql<number>`coalesce(sum(case when ${contents.status} = 'trashed' then 1 else 0 end), 0)`,
        })
        .from(contents);

      const commentStatsPromise = db
        .select({
          total: sql<number>`count(*)`,
          trashed: sql<number>`coalesce(sum(case when ${comments.status} = 'trashed' then 1 else 0 end), 0)`,
          pending: sql<number>`coalesce(sum(case when ${comments.status} = 'pending' then 1 else 0 end), 0)`,
        })
        .from(comments);

      const mediaCountPromise = db.select({ value: sql<number>`count(*)` }).from(media);
      const userCountPromise = db.select({ value: sql<number>`count(*)` }).from(users);
      const termCountPromise = db.select({ value: sql<number>`count(*)` }).from(terms);
      const pluginCountPromise = db.select({ value: sql<number>`count(*)` }).from(plugins);

      const recentContentsPromise = db
        .select({
          id: contents.id,
          type: contents.type,
          title: contents.title,
          slug: contents.slug,
          status: contents.status,
          updatedAt: contents.updatedAt,
          authorName: users.displayName,
        })
        .from(contents)
        .leftJoin(users, eq(contents.authorId, users.id))
        .where(isNull(contents.deletedAt))
        .orderBy(desc(contents.updatedAt))
        .limit(RECENT_LIMIT);

      const recentCommentsPromise = db
        .select({
          id: comments.id,
          contentId: comments.contentId,
          contentTitle: contents.title,
          authorName: comments.authorName,
          body: comments.body,
          status: comments.status,
          createdAt: comments.createdAt,
        })
        .from(comments)
        .leftJoin(contents, eq(comments.contentId, contents.id))
        .where(sql`${comments.status} <> 'trashed'`)
        .orderBy(desc(comments.createdAt))
        .limit(RECENT_LIMIT);

      const topContentsPromise = db
        .select({
          id: contents.id,
          title: contents.title,
          viewCount: contents.viewCount,
          commentCount: contents.commentCount,
        })
        .from(contents)
        .where(and(eq(contents.status, "published"), isNull(contents.deletedAt)))
        .orderBy(desc(contents.viewCount))
        .limit(RECENT_LIMIT);

      // 14 天窗口从"今天 00:00 UTC"往前推 13 天；strftime 的 unixepoch 也按 UTC，两者口径一致。
      const todayUtc = new Date();
      const windowStart = new Date(
        Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), todayUtc.getUTCDate()) - (TREND_DAYS - 1) * 86_400_000,
      );
      const trendPromise = db
        .select({
          date: sql<string>`strftime('%Y-%m-%d', ${contents.publishedAt} / 1000, 'unixepoch')`,
          count: sql<number>`count(*)`,
        })
        .from(contents)
        .where(and(eq(contents.status, "published"), isNotNull(contents.publishedAt), gte(contents.publishedAt, windowStart)))
        .groupBy(sql`strftime('%Y-%m-%d', ${contents.publishedAt} / 1000, 'unixepoch')`);

      const [
        [contentStats],
        [commentStats],
        [mediaRow],
        [userRow],
        [termRow],
        [pluginRow],
        recentContents,
        recentComments,
        topContents,
        trendRows,
      ] = await Promise.all([
        contentStatsPromise,
        commentStatsPromise,
        mediaCountPromise,
        userCountPromise,
        termCountPromise,
        pluginCountPromise,
        recentContentsPromise,
        recentCommentsPromise,
        topContentsPromise,
        trendPromise,
      ]);

      const trashed = num(contentStats?.trashed);
      const commentTrashed = num(commentStats?.trashed);

      const byDate = new Map(trendRows.map((row) => [row.date, num(row.count)]));
      const publishTrend: { date: string; count: number }[] = [];
      for (let index = 0; index < TREND_DAYS; index += 1) {
        const day = new Date(windowStart.getTime() + index * 86_400_000).toISOString().slice(0, 10);
        publishTrend.push({ date: day, count: byDate.get(day) ?? 0 });
      }

      return c.json(
        {
          ok: true as const,
          data: {
            counts: {
              // contents 表示"当前还在管理视野里"的内容，回收站单列，避免两个数字相加对不上。
              contents: num(contentStats?.total) - trashed,
              published: num(contentStats?.published),
              drafts: num(contentStats?.drafts),
              pending: num(contentStats?.pending),
              scheduled: num(contentStats?.scheduled),
              trashed,
              comments: num(commentStats?.total) - commentTrashed,
              pendingComments: num(commentStats?.pending),
              media: num(mediaRow?.value),
              users: num(userRow?.value),
              terms: num(termRow?.value),
              plugins: num(pluginRow?.value),
            },
            recentContents: recentContents.map((row) => ({
              id: row.id,
              type: row.type,
              title: row.title,
              slug: row.slug,
              status: row.status,
              updatedAt: row.updatedAt.toISOString(),
              authorName: row.authorName ?? null,
            })),
            recentComments: recentComments.map((row) => ({
              id: row.id,
              contentId: row.contentId,
              contentTitle: row.contentTitle ?? "（内容已删除）",
              authorName: row.authorName,
              // 评论可能很长，后台卡片只需要一眼预览；完整内容在评论管理页看。
              body: row.body.length > 120 ? `${row.body.slice(0, 120)}…` : row.body,
              status: row.status,
              createdAt: row.createdAt.toISOString(),
            })),
            topContents: topContents.map((row) => ({
              id: row.id,
              title: row.title,
              viewCount: row.viewCount,
              commentCount: row.commentCount,
            })),
            publishTrend,
            system: {
              environment: c.env.ENVIRONMENT,
              requestId: c.get("requestId") ?? "-",
              database: "D1" as const,
              storage: "R2" as const,
              version: "1.0.0" as const,
            },
          },
        },
        200,
      );
    },
  );

  return app;
}

export { DashboardSchema };
