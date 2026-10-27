import type { MiddlewareHandler } from "hono";
import type { AppBindings } from "../env";
import { forbidden } from "../lib/errors";

const CSP = [
  "default-src 'self'",
  "img-src 'self' data: https:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

/**
 * 安全响应头。
 * 说明：后台 SPA 与前台主题都内联了一小段必要的样式/脚本（首屏与复制按钮），
 * 因此 style-src / script-src 保留了 'unsafe-inline'——这是本项目明确的取舍，
 * 换成 nonce 需要把两处内联改成外链资源，收益有限。
 */
export function securityHeaders(): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    await next();
    const headers = c.res.headers;
    headers.set("Content-Security-Policy", CSP);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Frame-Options", "DENY");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    headers.set("Cross-Origin-Opener-Policy", "same-origin");
    if (new URL(c.req.url).protocol === "https:") {
      headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
  };
}

/** 开发期后台 SPA 跑在 5173，需要带凭证的 CORS。生产环境同源，不需要。 */
export function corsMiddleware(): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    const origin = c.req.header("origin");
    const allowed = c.env.CONSOLE_ORIGIN;
    if (origin && allowed && origin === allowed) {
      c.header("Access-Control-Allow-Origin", origin);
      c.header("Access-Control-Allow-Credentials", "true");
      c.header("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
      c.header("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Requested-With");
      c.header("Access-Control-Max-Age", "600");
      c.header("Vary", "Origin");
    }
    if (c.req.method === "OPTIONS") {
      return c.body(null, 204);
    }
    await next();
  };
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF：对使用 Cookie 的写操作做同源校验。
 * 携带 Bearer 令牌的请求（脚本、CI）不受影响——它们本来就不依赖 Cookie，
 * 浏览器也不会自动附带凭证，因此不存在 CSRF 面。
 */
export function originCheck(): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    if (SAFE_METHODS.has(c.req.method)) return next();
    const authHeader = c.req.header("authorization");
    if (authHeader?.toLowerCase().startsWith("bearer ")) return next();

    const origin = c.req.header("origin");
    if (!origin) return next(); // 非浏览器发起的同源请求（curl、测试）没有 Origin
    const host = c.req.header("host");
    const sameHost = host ? new URL(origin).host === host : false;
    const allowedDev = !!c.env.CONSOLE_ORIGIN && origin === c.env.CONSOLE_ORIGIN;
    if (!sameHost && !allowedDev) {
      throw forbidden("跨站请求被拒绝");
    }
    await next();
  };
}

/** 轻量限流：以 KV 计数，按 key 与时间窗。用于登录与评论提交。 */
export async function rateLimit(
  kv: KVNamespace,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; remaining: number; resetSeconds: number }> {
  const bucket = `${key}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;
  const cacheKey = `rl:${bucket}`;
  const current = Number((await kv.get(cacheKey)) ?? "0");
  if (current >= limit) {
    const elapsed = Math.floor(Date.now() / 1000) % windowSeconds;
    return { allowed: false, remaining: 0, resetSeconds: windowSeconds - elapsed };
  }
  await kv.put(cacheKey, String(current + 1), { expirationTtl: windowSeconds + 5 });
  return { allowed: true, remaining: Math.max(0, limit - current - 1), resetSeconds: windowSeconds };
}
