/**
 * 应用装配。
 *
 * 中间件顺序即安全边界，改动前先读 docs/03-开发与扩展指南.md 的"中间件顺序"一节：
 *   请求上下文 → 安全头 → CORS → 同源校验 → 会话解析 → 错误兜底
 * 会话解析放在同源校验之后是有意的：CSRF 拦截不应该依赖登录态。
 */
import { Hono } from "hono";
import type { AppBindings } from "./env";
import { notFound } from "./lib/errors";
import { errorHandler, notFoundHandler } from "./middleware/error";
import { requestContext } from "./middleware/request";
import { corsMiddleware, originCheck, securityHeaders } from "./middleware/security";
import { sessionMiddleware } from "./middleware/session";
import { createApiApp } from "./api";
import { createSiteApp } from "./site/router";

export function createApp(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.use("*", requestContext());
  app.use("*", securityHeaders());
  app.use("*", corsMiddleware());
  app.use("*", originCheck());
  app.use("*", sessionMiddleware());

  app.onError(errorHandler);
  app.notFound(notFoundHandler);

  // 1) JSON API：/api/*
  app.route("/api", createApiApp());
  // /api 下未匹配到的路径必须返回 JSON 404，而不是落到前台主题的 HTML 404。
  // 注册在挂载之后、前台路由之前，保证优先级。
  app.all("/api/*", (c) => {
    throw notFound(`接口不存在：${c.req.path}`);
  });
  // 2) 媒体文件：/media/*（R2 直出）
  app.route("/media", createMediaApp());
  app.all("/media/*", (c) => c.notFound());
  // 3) 前台主题 SSR + 订阅源 + 静态兜底
  app.route("/", createSiteApp());

  return app;
}

/** 媒体直出单独拆一个 app，便于加缓存头与 Range 支持。 */
function createMediaApp(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();
  app.get("/:key{.+}", async (c) => {
    const key = c.req.param("key");
    const object = await c.env.MEDIA.get(key);
    if (!object) return c.notFound();
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    headers.set("X-Content-Type-Options", "nosniff");
    const ifNoneMatch = c.req.header("if-none-match");
    if (ifNoneMatch && ifNoneMatch === object.httpEtag) {
      return new Response(null, { status: 304, headers });
    }
    return new Response(object.body, { headers });
  });
  return app;
}
