/**
 * `cloudflare:test` 的最小类型声明。
 *
 * 不引 @cloudflare/vitest-plugin/types：那份声明覆盖面很广，会与
 * @cloudflare/workers-types 的全局类型互相打架。这里只声明实际用到的三个导出，
 * 类型边界清晰，也让测试文件能独立通过 tsc。
 */
declare module "cloudflare:test" {
  interface ProvidedEnv {
    DB: D1Database;
    KV: KVNamespace;
    MEDIA: R2Bucket;
    ASSETS: Fetcher;
    ENVIRONMENT: string;
    PUBLIC_BASE_URL: string;
    CONSOLE_ORIGIN?: string;
    TEST_MIGRATIONS: { name: string; queries: string[] }[];
  }

  export const env: ProvidedEnv;
  export const SELF: Fetcher;

  export function applyD1Migrations(
    db: D1Database,
    migrations: { name: string; queries: string[] }[],
  ): Promise<void>;

  export function createExecutionContext(): ExecutionContext;
  export function waitOnExecutionContext(ctx: ExecutionContext): Promise<void>;
  export function createScheduledController(options?: { cron?: string; scheduledTime?: number }): ScheduledController;
}
