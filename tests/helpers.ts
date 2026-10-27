/**
 * 集成测试公共工具。
 *
 * 走的是真实入口 SELF.fetch：请求会经过 app.ts 的完整中间件链
 * （请求上下文 → 安全头 → CORS → 同源校验 → 会话解析 → 路由 → 错误兜底），
 * 而不是直接调用某个 handler —— 这样中间件顺序错了也能被测出来。
 */
import { env, SELF } from "cloudflare:test";

export interface Client {
  cookie: string;
  request: <T = unknown>(
    method: string,
    path: string,
    options?: { body?: unknown; form?: URLSearchParams; headers?: Record<string, string>; cookie?: string },
  ) => Promise<{ status: number; body: T; headers: Headers }>;
  post: <T = unknown>(path: string, body?: unknown) => Promise<{ status: number; body: T; headers: Headers }>;
  get: <T = unknown>(path: string) => Promise<{ status: number; body: T; headers: Headers }>;
  patch: <T = unknown>(path: string, body?: unknown) => Promise<{ status: number; body: T; headers: Headers }>;
  del: <T = unknown>(path: string) => Promise<{ status: number; body: T; headers: Headers }>;
}

export const BASE = "http://localhost";

export function createClient(): Client {
  const jar = new Map<string, string>();

  async function request<T>(
    method: string,
    path: string,
    options: { body?: unknown; form?: URLSearchParams; headers?: Record<string, string>; cookie?: string } = {},
  ) {
    const headers = new Headers(options.headers ?? {});
    // 简易 cookie 罐：会话令牌与内容解锁令牌都要带上，
    // 否则「输入密码解锁后重新访问」这类跨请求流程测不出来。
    const cookieValue = options.cookie ?? [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
    if (cookieValue) headers.set("cookie", cookieValue);
    let body: string | undefined;
    if (options.form) {
      headers.set("content-type", "application/x-www-form-urlencoded");
      body = options.form.toString();
    } else if (options.body !== undefined) {
      headers.set("content-type", "application/json");
      body = JSON.stringify(options.body);
    }

    const response = await SELF.fetch(`${BASE}${path}`, {
      method,
      headers,
      body,
      redirect: "manual",
    });

    for (const raw of response.headers.getSetCookie()) {
      const pair = raw.split(";")[0] ?? "";
      const index = pair.indexOf("=");
      if (index <= 0) continue;
      const name = pair.slice(0, index);
      const value = pair.slice(index + 1);
      if (!value) jar.delete(name);
      else jar.set(name, value);
    }

    const text = await response.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    return { status: response.status, body: parsed as T, headers: response.headers };
  }

  return {
    get cookie() {
      return jar.get("taiping_session") ?? "";
    },
    set cookie(value: string) {
      if (value) jar.set("taiping_session", value);
      else jar.delete("taiping_session");
    },
    request,
    post: (path, body) => request("POST", path, { body }),
    get: (path) => request("GET", path),
    patch: (path, body) => request("PATCH", path, { body }),
    del: (path) => request("DELETE", path),
  };
}

/** 业务表清单，按「先关连后主体」的顺序删除。 */
const WIPE_ORDER = [
  "user_roles",
  "role_permissions",
  "roles",
  "sessions",
  "api_tokens",
  "audit_logs",
  "content_terms",
  "content_revisions",
  "field_values",
  "comments",
  "contents",
  "terms",
  "field_definitions",
  "media",
  "nav_items",
  "plugins",
  "tasks",
  "locks",
  "redirects",
  "settings",
  "users",
];

/**
 * 让每个测试从干净状态开始。
 *
 * 为什么不依赖 Workers 测试池的隔离存储：隔离是**按文件**生效的，
 * 同一文件内的多个 it 之间数据会累积（第二次 setup 会拿到 409）。
 * 这里显式清表，行为与隔离设置无关，测试可以随便排序。
 * 同时清空 KV（设置缓存、会话缓存、限流计数）并把页面缓存关掉，
 * 否则会出现「改了设置但页面没变」的假失败。
 */
export async function resetState(): Promise<void> {
  for (const table of WIPE_ORDER) {
    await env.DB.prepare(`delete from ${table}`).run();
  }
  await env.DB.prepare("delete from content_fts").run();

  const keys = await env.KV.list();
  for (const key of keys.keys) await env.KV.delete(key.name);

  await env.DB.prepare(
    "insert into settings (key, value_json, updated_at) values ('site.pageCacheEnabled', 'false', unixepoch() * 1000) on conflict(key) do update set value_json = 'false'",
  ).run();
  await env.KV.delete("settings:version");
}

export interface ApiEnvelope<T> {
  ok: boolean;
  data: T;
  error?: { code: string; message: string; fields?: Record<string, string> };
}

export async function setupOwner(client: Client, overrides: { email?: string; username?: string; password?: string } = {}) {
  const result = await client.post<ApiEnvelope<{ id: string; roles: string[] }>>("/api/auth/setup", {
    email: overrides.email ?? "owner@test.local",
    username: overrides.username ?? "owner",
    displayName: "测试所有者",
    password: overrides.password ?? "Taiping@2026",
  });
  return result;
}
