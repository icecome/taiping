import path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * 集成测试配置：整个 Worker 跑在 workerd（Miniflare）里，绑定是真实的。
 *
 * 做法与参考项目 flare-stack-blog 一致：把迁移文件一次性读出来作为 TEST_MIGRATIONS
 * 绑定注入，测试的 setupFiles 里再调用 applyD1Migrations 真正建表。
 * 这样测试用的表结构与 wrangler d1 migrations 完全同源，不存在"测试库和生产库不一致"。
 */
export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(rootDir, "apps/server/migrations"));

  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: path.join(rootDir, "wrangler.jsonc") },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            ENVIRONMENT: "test",
            PUBLIC_BASE_URL: "http://localhost",
          },
        },
        remoteBindings: false,
      }),
    ],
    test: {
      include: ["tests/**/*.integration.test.ts"],
      setupFiles: [path.join(rootDir, "tests/apply-migrations.ts")],
      testTimeout: 60_000,
      hookTimeout: 60_000,
      teardownTimeout: 60_000,
    },
  };
});
