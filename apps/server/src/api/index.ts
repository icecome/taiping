/**
 * JSON API 装配。
 *
 * 用 OpenAPIHono 而不是裸 Hono：路由定义里直接带 zod schema，
 * 一次定义同时得到「入参校验 + 类型推导 + /api/doc 文档」三份产出。
 * 这是参考项目 flare-stack-blog 的 oRPC contract 思路，换成更轻的 OpenAPI 形态
 * —— 不引入代码生成步骤，`/api/doc` 永远与代码同步。
 *
 * 挂载顺序无所谓，但每个子应用的前缀必须与后台 console 的调用路径一致，
 * 改前缀要同步改 apps/console/src/api/client.ts。
 */
import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import type { AppBindings } from "../env";
import { validationFailed } from "../lib/errors";
import { createAuditRoutes } from "./audit";
import { createAuthRoutes } from "./auth";
import { createCommentsRoutes } from "./comments";
import { createContentRoutes } from "./contents";
import { createDashboardRoutes } from "./dashboard";
import { createFieldsRoutes } from "./fields";
import { createMediaRoutes } from "./media";
import { createNavRoutes } from "./nav";
import { createPluginsRoutes } from "./plugins";
import { createRolesRoutes } from "./roles";
import { createSettingsRoutes } from "./settings";
import { createTermsRoutes } from "./terms";
import { createTokensRoutes } from "./tokens";
import { createUsersRoutes } from "./users";

export function createApiApp(): OpenAPIHono<AppBindings> {
  const app = new OpenAPIHono<AppBindings>({
    defaultHook: (result, c) => {
      if (!result.success) {
        const fields: Record<string, string> = {};
        for (const issue of result.error.issues) {
          const path = issue.path.join(".") || "_";
          if (!fields[path]) fields[path] = issue.message;
        }
        throw validationFailed("请求参数校验失败", fields);
      }
    },
  });

  app.get("/health", (c) =>
    c.json({
      ok: true,
      data: {
        status: "ok",
        environment: c.env.ENVIRONMENT,
        time: new Date().toISOString(),
        requestId: c.get("requestId"),
      },
    }),
  );

  app.route("/auth", createAuthRoutes());
  app.route("/contents", createContentRoutes());
  app.route("/terms", createTermsRoutes());
  app.route("/comments", createCommentsRoutes());
  app.route("/users", createUsersRoutes());
  app.route("/roles", createRolesRoutes());
  app.route("/audit", createAuditRoutes());
  app.route("/tokens", createTokensRoutes());
  app.route("/media", createMediaRoutes());
  app.route("/nav", createNavRoutes());
  app.route("/fields", createFieldsRoutes());
  app.route("/plugins", createPluginsRoutes());
  app.route("/settings", createSettingsRoutes());
  app.route("/dashboard", createDashboardRoutes());

  app.doc("/doc", {
    openapi: "3.1.0",
    info: {
      title: "太平 CMS API",
      version: "1.0.0",
      description:
        "博客内容管理系统的 JSON API。除 /auth/login、/auth/setup 与公开读接口外均需登录；支持 Cookie 会话与 Bearer 令牌两种凭证。",
    },
    servers: [{ url: "/api" }],
    tags: [
      { name: "认证", description: "登录、会话与口令" },
      { name: "内容", description: "文章、页面、动态、项目的读写与状态流转" },
      { name: "分类与标签", description: "分类树、标签、系列" },
      { name: "评论", description: "评论审核与回复" },
      { name: "媒体", description: "R2 媒体库" },
      { name: "用户", description: "后台用户管理" },
      { name: "角色与权限", description: "RBAC 角色与权限矩阵" },
      { name: "系统设置", description: "站点配置、主题、维护任务" },
      { name: "内容模型", description: "自定义字段定义" },
      { name: "导航", description: "站点导航菜单" },
      { name: "插件", description: "插件启停与配置" },
      { name: "审计", description: "操作日志" },
      { name: "仪表盘", description: "后台首页统计" },
    ],
  });

  app.get("/reference", swaggerUI({ url: "/api/doc" }));

  return app;
}
