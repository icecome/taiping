# 太平 CMS

运行在 Cloudflare Workers 上的博客内容管理系统。一个 Worker 同时提供前台渲染、后台管理界面与 JSON API，数据落在 D1，媒体落在 R2。

## 它是什么

- **前台**：服务端渲染的纯 HTML，带 RSS / Atom / JSON Feed / sitemap / robots，首屏无框架运行时。
- **后台**：React 单页应用，覆盖内容、分类标签、评论、媒体、用户、角色、内容模型、导航、系统设置与插件。
- **API**：`/api` 下的 JSON 接口，带 OpenAPI 文档；支持 Cookie 会话与 Bearer 令牌两种凭证。
- **权限**：角色 + 权限目录，权限分「本人对象」与「任意对象」两档。
- **扩展**：编译期主题与插件，钩子分 filter（改值）与 call（副作用）两类。

不做什么：多租户、运行时可上传的主题包与插件包、外部搜索引擎。理由见 [架构设计方案](./docs/02-CMS架构设计方案.md) 的「非目标」一节。

## 快速开始

需要 Node 22 以上与 pnpm 10。

```bash
pnpm install
pnpm db:migrate                 # 建本地 D1 表结构
pnpm dev                        # 同时启动 Worker(8787) 与后台 SPA(5173)
```

首次启动后初始化站点所有者：

```bash
curl -X POST http://127.0.0.1:8787/api/auth/setup \
  -H 'Content-Type: application/json' \
  -d '{"email":"owner@example.com","username":"owner","displayName":"站长","password":"Taiping@2026"}'
```

或者直接灌一份演示数据（会走完整 API，顺带验证链路）：

```bash
node scripts/seed.mjs
```

访问入口：

| 地址 | 内容 |
| --- | --- |
| <http://127.0.0.1:8787/> | 前台 |
| <http://127.0.0.1:8787/admin> | 后台（需要先 `pnpm build:console`） |
| <http://localhost:5173/> | 后台开发服务器（`/api` 已代理到 8787） |
| <http://127.0.0.1:8787/api/doc> | OpenAPI 文档 |
| <http://127.0.0.1:8787/api/reference> | Swagger UI |

演示数据脚本创建的账号：`owner@taiping.local` / `Taiping@2026`（可用 `OWNER_EMAIL`、`OWNER_PASSWORD` 环境变量覆盖）。

## 常用命令

```bash
pnpm dev              # 开发（Worker + 后台）
pnpm build            # 构建后台 SPA 并打包 Worker
pnpm typecheck        # 服务端与后台的 TypeScript 检查
pnpm test             # 单元测试 + 集成测试
pnpm test:unit        # 只跑纯函数测试（秒级）
pnpm test:workers     # 只跑 workerd 里的集成测试
pnpm db:generate      # 由 schema 生成迁移
pnpm db:migrate       # 应用迁移到本地 D1
pnpm db:migrate:remote
pnpm deploy           # 构建并部署
```

三个辅助脚本（都需要 Worker 已在运行）：

```bash
node scripts/seed.mjs                 # 灌演示数据（走公开 API，顺带验证链路）
node scripts/smoke.mjs                # 端到端验收，55 项检查（上线后也可跑）
node scripts/bench.mjs                # 单请求延迟统计
```

## 功能一览

| 模块 | 能力 |
| --- | --- |
| 内容 | 文章 / 页面 / 动态 / 项目四种类型；草稿、待审、定时、发布、回收站五态流转；版本快照与回滚；密码保护；置顶；SEO 元信息 |
| 分类标签 | 分类树、标签、系列；计数自动重算 |
| 评论 | 嵌套回复、待审队列、垃圾标记、后台回复、频率限制、敏感词进待审 |
| 媒体 | R2 上传、按内容哈希去重、外链登记、替代文本与说明 |
| 用户权限 | 用户增删改、密码重置、角色分配、6 个内置角色 + 自定义角色、权限矩阵 |
| 内容模型 | 自定义字段定义（文本 / 数字 / 开关 / 日期 / 下拉 / JSON），加字段不改表 |
| 模板 | 两套内置主题（纸墨 / 素纸），主题自带配置项与能力声明 |
| 系统设置 | 7 组站点配置，由字段定义驱动表单；主题配置；维护任务；缓存清理 |
| 插件 | 5 个内置插件；启停与配置；filter / call 两类钩子 |
| 输出 | RSS、Atom、JSON Feed、sitemap、robots、webmanifest、JSON-LD |
| 搜索 | D1 FTS5 全文检索，中文按 `Intl.Segmenter` 预分词 |
| 运维 | 审计日志、API 令牌、定时任务（定时发布、回收站清理、会话回收、搜索索引重建） |

API 端点共 70 余个，全部登记在 `/api/doc`。

## 目录结构

```
apps/
  server/        Worker：API、前台渲染、数据层、主题、插件
  console/       后台 SPA（React）
docs/            架构分析、设计方案、开发指南、测试报告、ADR
scripts/         演示数据脚本
tests/           集成测试
```

## 文档

- [参考项目架构分析](./docs/01-参考项目架构分析.md) —— 两个参考项目做了什么、哪些能借鉴、哪些在 Workers 上不成立
- [CMS 架构设计方案](./docs/02-CMS架构设计方案.md) —— 本项目的数据模型、权限体系、API 契约、缓存策略
- [开发与扩展指南](./docs/03-开发与扩展指南.md) —— 本地开发、扩展步骤、排错手册
- [测试报告](./docs/04-测试报告.md) —— 功能、性能、兼容性测试结果
- [决策记录](./docs/adr/) —— 关键决策的理由
- [AGENTS.md](./AGENTS.md) —— 给 AI 编码代理的项目说明（命令、铁律、坑位）

## 技术栈

Cloudflare Workers · Hono · Drizzle ORM · D1 · KV · R2 · `@hono/zod-openapi` · React 19 · Vite · TanStack Query · Tailwind CSS 4 · marked · highlight.js · Vitest + `@cloudflare/vitest-plugin`

## License

MIT
