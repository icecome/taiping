import { applyD1Migrations, env } from "cloudflare:test";

/**
 * 每个测试文件开跑前把迁移打上。
 * 迁移文件由 vitest.workers.config.ts 读出来后通过 TEST_MIGRATIONS 绑定注入，
 * 与 `wrangler d1 migrations apply` 用的是同一批 SQL。
 */
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
