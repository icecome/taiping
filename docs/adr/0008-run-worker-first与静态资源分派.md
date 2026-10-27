# ADR 0008：`run_worker_first` 与静态资源分派

- 状态：已采纳
- 日期：2026-10-26
- 相关：[docs/01-参考项目架构分析.md](../01-参考项目架构分析.md) 的 3.2

## 背景

当一个 Worker 同时声明了 `assets` 目录绑定，平台要决定「请求先给静态资源还是先给 Worker」。默认行为是**先匹配静态资源**：命中同名文件就直接返回，Worker 根本收不到请求。

LuyBlog 正是踩在这里：`wrangler.jsonc` 声明了 `assets.directory`，没有设 `run_worker_first`，于是 `/` 命中 `dist/client/index.html`，`src/index.ts` 里那段 SSR 分支对「有同名静态文件的路径」永远不生效。代码是按「所有非 `/assets` 路径都 SSR」写的，意图与实际行为不一致，后果是首页的 SEO meta 来自构建期静态模板而不是运行时数据。

本项目在开发时复现了同样现象：配置只有 `not_found_handling: "none"` 时，`curl http://127.0.0.1:8787/` 返回的是后台 SPA 的 `index.html`。

## 决策

**设 `run_worker_first: true`，由 Worker 显式决定什么交给 `ASSETS`。**

`site/router.ts` 的 `fallbackToAssetsOr404` 是唯一的分派点，规则是：

1. `/admin` 与 `/admin/*` → 取 `/index.html` 返回（SPA 入口，前端路由接管）；
2. 其它路径 → `env.ASSETS.fetch(c.req.raw)`；命中就透传（`/assets/*` 加一年 immutable 缓存头），未命中返回主题渲染的 404。

## 理由

- 行为完全可预期：看到某个 URL 返回什么，只需读 `app.ts` 的路由挂载顺序与这一个分派函数。
- 解决了「首页到底是 SSR 还是静态文件」这种最难排查的一类问题——它不报错，只是悄悄地用了另一条路径。
- 代价是所有请求（含 `/assets/*.js`）都要过一次 Worker 调用。实测本地 `Server-Timing` 在 1–3 ms 量级，可接受。

## 后果

- 删掉 `fallbackToAssetsOr404` 会导致静态资源全部 404。这是本项目最容易踩的坑之一，已写入 AGENTS.md 第 8 节。
- `/api/*` 与 `/media/*` 下未匹配的路径要在前台路由之前显式拦截并返回 JSON 404 / 纯 404，否则会落到前台主题的 catch-all 渲染出 HTML 404（`app.ts` 里已处理）。
- 新增静态资源目录时，要确认它能被 `ASSETS.fetch` 命中，不需要额外改路由。
