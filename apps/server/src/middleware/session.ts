import type { MiddlewareHandler } from "hono";
import { createDb } from "../db/client";
import type { AppBindings } from "../env";
import { resolveAuth } from "../lib/auth";

/**
 * 解析登录态。解析结果放在 c.get("auth")，未登录为 null。
 * 注意：这里只做"是谁"的判定，不抛错也不拦截；拦不拦由各路由自己决定，
 * 这样才能让同一套 API 同时服务匿名前台和已登录后台。
 */
export function sessionMiddleware(): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    const db = createDb(c.env.DB);
    const auth = await resolveAuth(c.env, db, c).catch((error) => {
      console.error("[auth] resolve failed", error);
      return null;
    });
    c.set("auth", auth);
    await next();
  };
}
