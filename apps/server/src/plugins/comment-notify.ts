/**
 * 内置插件：comment-notify（评论提醒）
 *
 * 演示 call 钩子：副作用挂在"评论已入库"之后，不阻塞提交响应。
 * 默认只写一条待处理任务（tasks 表），由 cron 里的任务处理器消费；
 * 配置了 webhookUrl 时改成投递出去 —— 真实实现应放进 Queue，
 * 这里保留任务表是为了让整条链路在本地 wrangler dev 里可验证。
 */
import type { PluginManifest } from "../lib/hooks";
import { enqueueTask } from "../lib/tasks";

export const commentNotifyPlugin: PluginManifest = {
  key: "comment-notify",
  name: "评论提醒",
  version: "1.0.0",
  description: "有新评论时写入待处理提醒任务，可选推送到 Webhook（如企业微信、飞书机器人）。",
  author: "太平",
  defaultEnabled: true,
  settings: [
    { key: "webhookUrl", label: "Webhook 地址", type: "url", default: "", help: "留空则只写站内任务，不对外请求。" },
    { key: "notifyOnPendingOnly", label: "仅待审核时提醒", type: "boolean", default: true },
    { key: "maxRetries", label: "失败重试次数", type: "number", default: 3, min: 0, max: 10 },
  ],
  hooks: {
    calls: {
      "comment.afterCreate": async (payload, ctx) => {
        const settings = ctx.config.plugins["comment-notify"] ?? {};
        const url = String(settings.webhookUrl ?? "").trim();
        const pendingOnly = settings.notifyOnPendingOnly !== false;

        if (pendingOnly && !payload.status.includes("pending")) return;

        await enqueueTask(ctx.db, "notify-comment", {
          commentId: payload.commentId,
          contentId: payload.contentId,
          authorName: payload.authorName,
          body: payload.body.slice(0, 200),
          webhookUrl: url,
        });
      },
    },
  },
};
