/**
 * Worker 入口：fetch + scheduled 两个触发面。
 *
 * 与 LuyBlog 的差别：它的 Worker 同时托管 SPA 资产，但没有把"什么路径归 Worker、
 * 什么路径归资产"写死；这里在 app 里显式声明三条规则：
 *   1. /api/* 与前台路由由 Worker 处理；
 *   2. /admin/* 回落到后台 SPA（assets 里没有同名文件时）；
 *   3. 其余命中静态文件则直接由 assets 返回，未命中走前台主题，再不行 404。
 */
import { createApp } from "./app";
import { bumpCacheVersion } from "./lib/cache";
import { getEnabledPluginKeys, runCall } from "./lib/hooks";
import { createDb } from "./db/client";
import { getSiteConfig } from "./lib/settings";
import { runScheduledTasks } from "./lib/tasks";
import type { Env } from "./env";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const app = createApp();
    return app.fetch(request, env, ctx);
  },

  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const db = createDb(env.DB);
    const config = await getSiteConfig(env, db);
    const enabled = await getEnabledPluginKeys(env, db);
    const now = new Date(event.scheduledTime);

    ctx.waitUntil(
      (async () => {
        const result = await runScheduledTasks(env, db, config, now);
        if (result.changed) await bumpCacheVersion(env);
        await runCall("app.scheduled", { cron: event.cron, now }, { env, db, config }, enabled);
        console.log(
          `[cron:${event.cron}] published=${result.published} purged=${result.purged} tasks=${result.tasks}`,
        );
      })(),
    );
  },
};
