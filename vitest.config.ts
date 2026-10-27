import { defineConfig } from "vitest/config";

/**
 * 单元测试配置：跑在 Node 里，不加载 Workers 运行时。
 * 只覆盖纯函数（slug、markdown、权限判定、口令、分页）—— 这些是最容易回归、
 * 也最不需要模拟环境的部分。
 * 需要绑定（D1 / KV / R2）的测试请放到 vitest.workers.config.ts。
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["apps/server/src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/*.integration.test.ts"],
    testTimeout: 20_000,
  },
});
