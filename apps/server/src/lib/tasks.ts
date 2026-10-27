/**
 * 定时任务（Cron Triggers）。
 *
 * 为什么需要：Workers 无常驻进程，定时发布、回收站清理、会话回收这类"迟早要做"的事
 * 必须挂在 cron 上。参考项目里 flare-stack-blog 用 Durable Object + Queue，成本更高；
 * 博客量级用 cron + D1 一条 UPDATE 就够，只在需要精确到分钟的发布上做"读时兜底"
 * ——前台查询本来就会判断 published_at <= now，所以 cron 迟到不影响正确性。
 */
import { and, eq, isNotNull, lt, lte, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import type { Env } from "../env";
import {
  apiTokens,
  comments,
  contentRevisions,
  contentTerms,
  contents,
  locks,
  sessions,
  tasks,
} from "../db/schema";
import type { ResolvedSiteConfig } from "./settings";
import { siteSetting } from "./settings";

export interface ScheduledResult {
  published: number;
  purged: number;
  tasks: number;
  changed: boolean;
}

/**
 * 把到点的定时内容转为已发布。
 * 注意 published_at 用用户设定的 scheduled_at，而不是"实际执行时刻"，
 * 这样 cron 抖动不会让文章在归档里跑到错误的位置。
 */
export async function publishDueContent(db: Db, now: Date): Promise<number> {
  const due = await db
    .select({ id: contents.id, scheduledAt: contents.scheduledAt })
    .from(contents)
    .where(and(eq(contents.status, "scheduled"), isNotNull(contents.scheduledAt), lte(contents.scheduledAt, now)));

  if (due.length === 0) return 0;

  for (const row of due) {
    await db
      .update(contents)
      .set({ status: "published", publishedAt: row.scheduledAt ?? now, updatedAt: now })
      .where(eq(contents.id, row.id));
  }
  return due.length;
}

/** 回收站超期物理删除：内容本身 + 版本 + 分类关联 + 评论。 */
export async function purgeExpiredTrash(db: Db, now: Date, retentionDays: number): Promise<number> {
  if (retentionDays <= 0) return 0;
  const threshold = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const expired = await db
    .select({ id: contents.id })
    .from(contents)
    .where(and(eq(contents.status, "trashed"), isNotNull(contents.deletedAt), lt(contents.deletedAt, threshold)));

  for (const row of expired) {
    await db.delete(contentTerms).where(eq(contentTerms.contentId, row.id));
    await db.delete(contentRevisions).where(eq(contentRevisions.contentId, row.id));
    await db.delete(comments).where(eq(comments.contentId, row.id));
    await db.delete(contents).where(eq(contents.id, row.id));
  }
  return expired.length;
}

export async function purgeExpiredSessions(db: Db, now: Date): Promise<number> {
  const result = await db.delete(sessions).where(lt(sessions.expiresAt, now));
  return Number((result as unknown as { meta?: { changes?: number } }).meta?.changes ?? 0);
}

export async function purgeExpiredTokens(db: Db, now: Date): Promise<number> {
  const result = await db
    .delete(apiTokens)
    .where(and(isNotNull(apiTokens.expiresAt), lt(apiTokens.expiresAt, now)));
  return Number((result as unknown as { meta?: { changes?: number } }).meta?.changes ?? 0);
}

/** 清理过期的分布式锁。 */
export async function purgeStaleLocks(db: Db, now: Date): Promise<void> {
  await db.delete(locks).where(lt(locks.expiresAt, now));
}

/**
 * 处理 tasks 表里的排队任务。当前内置一种任务：
 *   reindex-search —— 重建某条内容的全文索引行
 */
export async function runPendingTasks(env: Env, db: Db, limit = 20): Promise<number> {
  const pending = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.status, "pending"), lte(tasks.runAt, new Date())))
    .limit(limit);

  let done = 0;
  for (const task of pending) {
    await db.update(tasks).set({ status: "running", updatedAt: new Date() }).where(eq(tasks.id, task.id));
    try {
      if (task.kind === "reindex-search") {
        const payload = JSON.parse(task.payloadJson || "{}") as { contentId?: string };
        const { refreshSearchIndex } = await import("./search");
        if (payload.contentId) await refreshSearchIndex(env, db, payload.contentId);
      }
      await db
        .update(tasks)
        .set({ status: "done", updatedAt: new Date() })
        .where(eq(tasks.id, task.id));
      done += 1;
    } catch (error) {
      const attempts = task.attempts + 1;
      await db
        .update(tasks)
        .set({
          status: attempts >= 3 ? "failed" : "pending",
          attempts,
          lastError: String(error).slice(0, 500),
          runAt: new Date(Date.now() + attempts * 60_000),
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, task.id));
    }
  }
  return done;
}

export async function enqueueTask(
  db: Db,
  kind: string,
  payload: Record<string, unknown>,
  runAt: Date = new Date(),
): Promise<string> {
  const { newId } = await import("./id");
  const id = newId("tsk");
  await db.insert(tasks).values({
    id,
    kind,
    payloadJson: JSON.stringify(payload),
    runAt,
    status: "pending",
  });
  return id;
}

/** cron 主流程。 */
export async function runScheduledTasks(
  env: Env,
  db: Db,
  config: ResolvedSiteConfig,
  now: Date,
): Promise<ScheduledResult> {
  if (!siteSetting<boolean>(config, "tasksEnabled")) {
    return { published: 0, purged: 0, tasks: 0, changed: false };
  }

  const published = await publishDueContent(db, now);
  const retention = Number(siteSetting<number>(config, "trashRetentionDays") ?? 30);
  const purged = await purgeExpiredTrash(db, now, retention);
  await purgeExpiredSessions(db, now);
  await purgeExpiredTokens(db, now);
  await purgeStaleLocks(db, now);
  const tasksDone = await runPendingTasks(env, db);

  return {
    published,
    purged,
    tasks: tasksDone,
    changed: published > 0 || purged > 0,
  };
}

/** 供后台"立即执行维护任务"按钮调用。 */
export async function runMaintenanceNow(env: Env, db: Db, config: ResolvedSiteConfig): Promise<ScheduledResult> {
  return runScheduledTasks(env, db, config, new Date());
}
