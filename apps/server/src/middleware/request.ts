import type { MiddlewareHandler } from "hono";
import type { AppBindings } from "../env";
import { newRequestId } from "../lib/id";

/** 请求 ID + 计时：日志、错误响应、Server-Timing 三处共用同一个 id。 */
export function requestContext(): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    const requestId = c.req.header("cf-ray") ?? newRequestId();
    const startedAt = Date.now();
    c.set("requestId", requestId);
    c.set("startedAt", startedAt);
    c.header("X-Request-Id", requestId);
    await next();
    const duration = Date.now() - startedAt;
    c.header("Server-Timing", `app;dur=${duration}`);
    if (c.res.status >= 500) {
      console.error(`[${requestId}] ${c.req.method} ${c.req.path} -> ${c.res.status} ${duration}ms`);
    }
  };
}
