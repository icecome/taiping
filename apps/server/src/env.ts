/**
 * 运行时绑定声明（单一真值）
 *
 * 与 wrangler.jsonc 保持一致；不使用 `wrangler types` 生成，避免绑定增删后
 * 出现"生成文件与代码不同步"的第二真值。
 */
export interface Env {
  /** D1：关系型主库（内容、用户、配置、评论）。 */
  DB: D1Database;
  /** KV：会话缓存、页面缓存版本、限流计数等读多写少数据。 */
  KV: KVNamespace;
  /** R2：原始媒体文件。 */
  MEDIA: R2Bucket;
  /** 静态资源（后台 SPA）。 */
  ASSETS: Fetcher;
  /** development | production | test */
  ENVIRONMENT: string;
  /** 站点对外基地址，用于生成绝对 URL（RSS、sitemap、邮件链接）。 */
  PUBLIC_BASE_URL: string;
  /** 后台 SPA 在开发期的来源，用于 CORS 白名单。 */
  CONSOLE_ORIGIN?: string;
  /** 会话签名密钥；未配置时回落到由站点密钥派生的临时值并给出告警。 */
  SESSION_SECRET?: string;
  /** 首次初始化管理员时使用的口令，未配置时使用内置默认值并强制首次登录改密。 */
  SETUP_TOKEN?: string;
}

/** 应用上下文变量：中间件写入，路由读取。 */
export interface AppVariables {
  requestId: string;
  /** 当前登录用户（未登录为 null）。 */
  auth: AuthContext | null;
  /** 一次请求内可复用的设置快照。 */
  siteConfig?: import("./lib/settings").ResolvedSiteConfig;
  /** 请求开始时间，用于 Server-Timing。 */
  startedAt: number;
}

export interface AuthContext {
  user: {
    id: string;
    email: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    status: string;
    mustChangePassword: boolean;
  };
  sessionId: string | null;
  /** 用户拥有的角色 key 列表。 */
  roles: string[];
  /** 全部角色权限的并集；owner 角色存在时表示拥有全部权限。 */
  permissions: string[];
  isSuperAdmin: boolean;
}

export type AppBindings = {
  Bindings: Env;
  Variables: AppVariables;
};
