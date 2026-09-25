# 太平 Tai-Ping

轻量级博客系统（Cloudflare Workers / D1 / Hono）。

## 结构

- `apps/web` — Worker 主应用（API + 前台 SSR）
- `console` — Vue3 后台 SPA
- `packages/content-model` — 内容模型与 URL 安全工具
- `packages/shared-utils` — 日期/阅读时长等工具
- `themes/zhuosu` — 默认前台主题
- `migrations` — D1 SQL 迁移

## 开发

```bash
npm install
npm run typecheck
npm run dev -w @taiping/web
```

初始化管理员（首次）：

```bash
curl -X POST http://127.0.0.1:8787/api/setup \
  -H 'Content-Type: application/json' \
  -d '{"name":"admin","email":"admin@example.com","password":"change-me"}'
```

本地迁移：

```bash
npm run db:migrate:local -w @taiping/web
```

## 设计文档

- `01-typecho-halo-technical-analysis.md`
- `02-lightweight-blog-architecture-design.md`
