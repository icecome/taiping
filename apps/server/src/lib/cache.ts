/**
 * 页面缓存与缓存版本号。
 *
 * 方案对照：
 * - flare-stack-blog 用「公开快照表 + Workers Cache + Cache-Tag」三件套，正确但迁移成本高；
 * - LuyBlog 完全没有页面缓存，且 GET 接口里写 view_count，导致不可缓存。
 *
 * 这里取中间路线：Cache API 存匿名 GET 的 HTML，失效靠一个全局版本号。
 * 发布内容、改设置、切主题都 bump 版本号，所有缓存键前缀随之变化 —— 一次写入即全站失效，
 * 代价是缓存键里带版本号后旧条目自然过期，不需要维护 tag 到 URL 的映射。
 */
import type { Env } from "../env";

export const CACHE_VERSION_KEY = "cache:version";

export async function getCacheVersion(env: Env): Promise<string> {
  try {
    return (await env.KV.get(CACHE_VERSION_KEY)) ?? "1";
  } catch {
    return "1";
  }
}

export async function bumpCacheVersion(env: Env): Promise<string> {
  const current = Number((await getCacheVersion(env)) ?? "1");
  const next = String(current + 1);
  await env.KV.put(CACHE_VERSION_KEY, next);
  return next;
}

function cacheStorage(): Cache | null {
  try {
    if (typeof caches === "undefined") return null;
    // @ts-expect-error Workers 上 caches.default 存在但未进入 lib.dom 类型
    return caches.default ?? null;
  } catch {
    return null;
  }
}

export interface PageCacheOptions {
  ttlSeconds: number;
  /** 默认只缓存 200 + text/html。 */
  cacheable?: (response: Response) => boolean;
}

/**
 * 包一层匿名页面缓存。命中直接返回；未命中执行 handler，成功后按 ttl 写入。
 * 带 Cookie 的请求（登录态）一律绕过，避免把个人化内容写进共享缓存。
 */
export async function withPageCache(
  request: Request,
  env: Env,
  options: PageCacheOptions,
  handler: () => Promise<Response>,
): Promise<Response> {
  const cache = cacheStorage();
  const cookie = request.headers.get("cookie");
  const hasSession = !!cookie && /taiping_session=/.test(cookie);
  if (!cache || hasSession || options.ttlSeconds <= 0 || request.method !== "GET") {
    return handler();
  }

  const version = await getCacheVersion(env);
  const url = new URL(request.url);
  const cacheKey = new Request(`${url.origin}/__cache/v${version}${url.pathname}${url.search}`, {
    method: "GET",
  });

  try {
    const hit = await cache.match(cacheKey);
    if (hit) {
      const response = new Response(hit.body, hit);
      response.headers.set("X-Page-Cache", "HIT");
      return response;
    }
  } catch {
    /* 缓存读取失败按未命中处理 */
  }

  const response = await handler();
  const cacheable = options.cacheable ? options.cacheable(response) : response.status === 200;
  if (cacheable) {
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", `public, max-age=${options.ttlSeconds}`);
    headers.set("X-Page-Cache", "MISS");
    const copy = new Response(response.clone().body, { status: response.status, headers });
    try {
      await cache.put(cacheKey, copy);
    } catch {
      /* 缓存写入失败不影响响应 */
    }
  }
  return response;
}
