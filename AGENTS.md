# AGENTS.md — 太平 CMS

> 给 AI 编码代理的项目说明书：构建、测试、约定、坑位。
> 优先级：用户当前指令 > 本文件 > 其他项目文档。
> 架构依据见 `docs/02-CMS架构设计方案.md`（与本文件冲突时，架构问题以其为准，命令与约定问题以本文件为准）。

## 1. 项目速览

运行在 Cloudflare Workers 上的博客 CMS：**一个 Worker 同时提供前台 SSR、后台 JSON API 与后台 SPA 静态资源**。

| 领域 | 版本 | 说明 |
| --- | --- | --- |
| 运行时 | Cloudflare Workers | `compatibility_date: 2026-09-01`，无 nodejs_compat |
| HTTP 框架 | Hono 4.13 | 中间件顺序即安全边界，改动前读 `apps/server/src/app.ts` |
| API 契约 | `@hono/zod-openapi` 1.6 | 一次定义出校验 + 类型 + `/api/doc`，**没有代码生成步骤** |
| ORM | Drizzle ORM 0.45 / drizzle-kit 0.31 | schema 在 `apps/server/src/db/schema.ts`（单文件） |
| 数据库 | D1（SQLite + FTS5） | 21 张实体表 + 1 张 FTS 虚表 |
| 后台前端 | React 19 + Vite 7 + TanStack Query 5 | Tailwind 4，无组件库 |
| 前台渲染 | `hono/jsx` 服务端渲染 | **Worker 包里不含 React** |
| Markdown | marked 18 + highlight.js 11 | 关闭原生 HTML 透传 |
| 测试 | Vitest 4（Node）+ `@cloudflare/vitest-plugin` | 两套配置，见第 3 节 |
| 包管理 | pnpm 10 workspace | 两个包：`@taiping/server`、`@taiping/console` |

四条反直觉事实，先记住能省半天：

1. **前台不跑 React**。前台是 `hono/jsx` 在服务端拼成纯 HTML，主题在 `apps/server/src/theme/`。看到 `apps/console/` 里的 React 组件不要往前台搬。
2. **`assets` 配了 `run_worker_first: true`**，所以所有请求先到 Worker，再由 `apps/server/src/site/router.ts` 的 `fallbackToAssetsOr404` 显式交还给 `ASSETS`。删掉这段兜底会导致静态资源全部 404。
3. **生成的迁移和手写迁移都必须进 drizzle journal**。FTS 表用 `drizzle-kit generate --custom` 占位，不要直接往 migrations 目录丢 SQL 文件——那会造成两套账本漂移。
4. **有 21 张表但只有 4 种内容类型**。新需求优先考虑用 `field_definitions`（自定义字段）或 `extra_json` 解决，不要加表。

## 2. 目录结构与职责

```
apps/server/src/
├── index.ts            Worker 入口（fetch + scheduled），只做装配
├── app.ts              中间件链 + 路由挂载；改动等于改安全边界
├── env.ts              Env 与上下文变量类型（唯一真值，不用 wrangler types 生成）
├── api/                JSON API，按领域一个文件，导出 createXxxRoutes()
├── site/               前台：router.ts（路由）、data.ts（装载 view model）、seo.ts（订阅源）
├── lib/                领域层：业务逻辑与基础设施，可被 api 与 site 共用
├── db/                 schema.ts（全部表）、client.ts（drizzle 实例）
├── theme/              types.ts（契约）、registry.ts（注册表）、default/、paper/
├── plugins/            内置插件，一个文件一个插件
├── middleware/         request / security / session / error
└── shared/             前后端共享的纯常量与 zod 结构（禁止依赖 Workers API）
```

| 目录 | 允许存放 | 禁止存放 |
| --- | --- | --- |
| `api/` | 路由定义、zod schema、调用 `lib/` 的编排 | 复杂业务逻辑、直接写 SQL |
| `site/` | URL 解析、view model 装载、HTML 输出 | 业务写逻辑 |
| `lib/` | 领域函数、基础设施封装 | Hono 的 `Context`（只接收解构后的参数） |
| `theme/` | 只接收 view model 的渲染代码 | 访问 `db` / `env` / 网络、异步 renderer |
| `shared/` | 常量、zod schema、类型 | 任何 Workers / Node 专有 API，import `lib` 或 `db` |
| `apps/console/` | React 组件、请求封装 | 服务端代码 |

「这段逻辑放哪」的判定：只被前台用 → `site/`；只被 API 用 → `api/`；两边都用 → `lib/`。

## 3. 常用命令

以下命令已在当前环境实测通过（Node 24 / pnpm 10.11 / Windows PowerShell）：

```bash
# 根目录
pnpm install                  # 首次安装；workerd 与 esbuild 的安装脚本已在 pnpm-workspace.yaml 批准
pnpm dev                      # 并行启动 Worker(8787) 与后台 SPA(5173)
pnpm dev:worker               # 只启 Worker
pnpm dev:console              # 只启后台 SPA
pnpm typecheck                # 服务端 tsc + 后台 tsc
pnpm test                     # 单元测试 + 集成测试（见下方说明）
pnpm test:unit                # 只跑 Node 里的纯函数测试（秒级）
pnpm test:workers             # 只跑 workerd 里的集成测试（需要迁移）

# 数据库（本地状态在 .wrangler/state）
pnpm db:generate              # 由 schema 生成迁移，会自动分配序号
pnpm db:generate --custom --name=<名字>   # 手写 DDL（FTS 这类）必须走这条
pnpm db:migrate               # 应用迁移到本地 D1
pnpm db:migrate:remote        # 应用迁移到远程 D1
node scripts/seed.mjs         # 写演示数据（走 API，需要 Worker 已启动）
node scripts/smoke.mjs        # 端到端验收 55 项（需要 Worker 已启动）
node scripts/bench.mjs        # 单请求延迟统计（需要 Worker 已启动）

# 构建与部署
pnpm build                    # 先构建后台 SPA，再 dry-run 打包 Worker
pnpm build:console            # 只构建 SPA → apps/console/dist
pnpm build:worker             # wrangler deploy --dry-run --outdir dist/worker
pnpm deploy                   # 构建 + 部署
```

页面入口（本地）：

| 地址 | 内容 |
| --- | --- |
| `http://127.0.0.1:8787/` | 前台（SSR） |
| `http://127.0.0.1:8787/admin` | 后台 SPA（需要先 `pnpm build:console`） |
| `http://localhost:5173/` | 后台 SPA 开发服务器（`/api` 已代理到 8787） |
| `http://127.0.0.1:8787/api/doc` | OpenAPI 文档 |
| `http://127.0.0.1:8787/api/reference` | Swagger UI |

两套测试配置的分工，不要混：

| 配置文件 | 跑在哪 | 覆盖 | 典型耗时 |
| --- | --- | --- | --- |
| `vitest.config.ts` | Node | `apps/server/src/**/*.test.ts` 纯函数 | 数秒 |
| `vitest.workers.config.ts` | workerd（Miniflare） | `tests/**/*.integration.test.ts` | 数十秒 |

集成测试通过 `cloudflare:test` 的 `SELF.fetch` 走完整中间件链，不是直接调 handler。迁移在 `tests/apply-migrations.ts` 里用 `applyD1Migrations` 打上，与 `wrangler d1 migrations apply` 同源。

## 4. 架构与分层铁律

依赖方向单向，禁止反向 import：

```
index.ts → app.ts → { api/, site/ } → lib/ → db/
                                        ↑
                                    theme/   （只被 site/ 引用，且只接收 view model）
shared/ 独立，谁都能引，但它不许引任何人
```

**R1 前台渲染不碰数据层。**
`theme/` 下的文件禁止 import `db/`、`env.ts` 或任何 `lib/` 里的查询函数。所有数据由 `site/data.ts` 装载成 view model 传入。
依据：换主题不应该把查询逻辑一起换掉；主题作者写的 N+1 查询会直接拖垮 TTFB。

**R2 主题 renderer 必须同步。**
不返回 Promise，不用 async 组件。`site/router.ts` 的 `toHtml` 仍然 `await`，但那是为了兼容，不是许可。
依据：渲染链里引入异步会让错误定位从「哪个组件」退化成「哪个 Promise」。

**R3 新增 API 端点用 `createRoute` + `app.openapi`。**
不要用裸 `app.get`，否则 `/api/doc` 与实际接口脱节。错误一律 `throw AppError`，不要在 handler 里 `return c.json(..., 4xx)`。
成功响应有两种等价写法，产出同一个信封 `{ ok: true, data }`：`return ok(c, data)`（`lib/response.ts`，默认 200）或 `return c.json({ ok: true as const, data }, 201)`（需要指定状态码时）。注意 `ok()` / `created()` **不要**标注 `: Response` 返回类型，那会让 `app.openapi` 的 `TypedResponse` 校验全部失败。
依据：`/api/doc` 被设计成「永远与代码同步」，裸路由会打破这个承诺；错误集中抛出让 handler 只表达成功路径。

**R4 权限判定只走 `lib/rbac.ts` 的四个函数。**
`can` / `assertCan` / `assertContentAccess` / `assertCanManageUser`。业务代码里禁止出现 `if (auth.roles.includes("admin"))` 这类角色判断。
依据：角色只是权限的集合，直接判角色会让「新增一个角色」变成全仓库搜索替换。

**R5 内容状态只能通过 `POST /api/contents/{id}/status` 流转。**
`PATCH /api/contents/{id}` 收到 `status` 字段会直接 400。
依据：状态变化牵涉发布权限、定时时间、索引刷新与缓存失效，混进普通更新会让「改错别字顺手把草稿发了」成为可能。

**R6 写操作必须落审计日志并 bump 缓存版本。**
`recordAudit(...)` + `bumpCacheVersion(c.env)`（`lib/content-service.ts` 里已封装，直接调服务层函数就自带）。
依据：没有审计的 CMS 在出问题时无法回答「谁改的」；忘记 bump 会让前台长时间显示旧内容。

**R7 手写 DDL 必须走 `drizzle-kit generate --custom`。**
不允许直接把 `NNNN_xxx.sql` 丢进 `apps/server/migrations/`。
依据：drizzle journal 与目录一旦不一致，后续 `generate` 会基于过期快照 diff 出重复建表。

**R8 前端只在 `apps/console/` 里写 React。**
前台主题是服务端 JSX，不是 React 组件。
依据：Worker 包里不含 React 是本项目包体积与冷启动的前提。

新增功能要动哪些文件，照这张表：

| 目标 | 步骤 |
| --- | --- |
| 新增插件 | 1. `lib/hooks.ts` 里已有钩子类型 → 2. `plugins/<key>.ts` 导出 `PluginManifest` → 3. `plugins/index.ts` 的数组加一项 |
| 新增主题 | 1. `theme/<id>/index.tsx` 导出 `Theme` → 2. `theme/registry.ts` 的 `THEMES` 加一行 |
| 新增 API 分组 | 1. `api/<domain>.ts` 导出 `create<Domain>Routes()` → 2. `api/index.ts` 加 `app.route()` 与 tag |
| 新增内容类型 | 1. `shared/content-types.ts` 加定义 → 2. `site/router.ts` 加路由前缀 → 3. 主题按 `supports` 分支 |
| 新增后台页面 | 1. `apps/console/src/features/<domain>/` 建目录 → 2. `apps/console/src/router.tsx` 注册路由 → 3. 侧边栏加一项 |
| 新增设置项 | `shared/settings-schema.ts` 加一行，后台表单自动出现，不需要改表单代码 |
| 新增自定义字段 | 后台「内容模型」页创建，**不需要改代码** |

## 5. 编码规范

| 实体 | 规范 | 示例 |
| --- | --- | --- |
| 文件名（服务端） | kebab-case | `content-service.ts`、`heading-anchors.ts` |
| 文件名（React 组件） | PascalCase | `PostEditor.tsx` |
| 数据库列 | snake_case | `published_at`、`body_markdown` |
| TS 字段 | camelCase | `publishedAt`、`bodyMarkdown` |
| 主键 | `前缀_16位base32` | `cnt_1a2b3c4d5e6f7g8h`（前缀表见 `lib/id.ts`） |
| 权限键 | `资源.动作[.范围]` | `content.update.own` |
| 设置键 | `命名空间.字段` | `site.siteTitle`、`theme.default.primaryColor` |
| 钩子名 | `域.时机` | `content.renderHtml`、`comment.afterCreate` |
| 审计 action | `资源.动作` | `content.publish`、`user.role.assign` |

最小代码示例（新增一个 API 端点）：

```ts
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { createDb } from "../db/client";
import type { AppBindings } from "../env";
import { assertCan } from "../lib/rbac";
import { ok } from "../lib/response";
import { envelope } from "./schemas";

export function createDemoRoutes(): OpenAPIHono<AppBindings> {
  const app = new OpenAPIHono<AppBindings>();

  app.openapi(
    createRoute({
      method: "get",
      path: "/",
      tags: ["演示"],
      summary: "示例端点",
      responses: {
        200: { description: "OK", content: { "application/json": { schema: envelope(z.object({ hello: z.string() })) } } },
      },
    }),
    async (c) => {
      assertCan(c.get("auth"), "content.read");   // 权限先断言
      const db = createDb(c.env.DB);               // 每请求一个 drizzle 实例
      void db;
      return ok(c, { hello: "world" });            // 成功走 ok()，失败走 throw
    },
  );

  return app;
}
```

## 6. 硬性规则

以下规则来自实际踩过的问题，遇到同类情况直接遵循，不需要重新讨论。

**R9 口令哈希迭代次数不要往上调而不测 CPU。**
当前 100k 次 PBKDF2-HMAC-SHA256。Worker 有 CPU 预算，调到 600k 会在付费档也可能触发限制。改之前先量 `Server-Timing`。
参考项目 flare-stack-blog 的提交记录里有同样原因的下调。

**R10 会话解析结果有 30 秒 KV 缓存，改权限后不要立刻断言生效。**
`lib/auth.ts` 把解析后的 `AuthContext` 缓存 30 秒。测试里要立即生效，先 `env.KV.delete("sess:<tokenHash>")`。
改密、停用、改角色都会调用 `revokeAllUserSessions`，那条路径是立即生效的。

**R11 集成测试里要关掉页面缓存。**
`tests/helpers.ts` 的 `resetState()` 会清空 KV 并把 `site.pageCacheEnabled` 设为 false。新增测试文件时在 `beforeEach` 里调它，否则会出现「改了设置但页面没变」的假失败。

**R12 新增迁移后必须重跑 `pnpm db:migrate`。**
`.wrangler/state` 是持久化的。只改 SQL 不重跑，本地库不会变，表现为「代码改了但查询报 no such column」。

**R13 不要在 `GET` 系列接口里写库。**
浏览量、评论数这类指标走定时落库。参考项目 LuyBlog 的 `GET /posts/:slug` 自增浏览量的写法，直接后果是接口无法被缓存、304 也计数。

**R14 `pageSize` 上限 100 由 `parsePagination` 统一强制。**
新增列表接口时用它，不要自己写 `Number(query.pageSize)`，否则会出现一次拉全表的接口。

## 7. 禁止事项

| 禁止项 | 原因 |
| --- | --- |
| 把 React 引入 `apps/server/` | Worker 包体积与冷启动的前提是不含 React |
| 在主题里直接查库 | 违反 R1，换主题会把查询逻辑一起换掉 |
| 用裸 `app.get` 定义 API | 打破 `/api/doc` 与代码同步的承诺（R3） |
| 业务代码里判角色而非判权限 | 违反 R4，新增角色要全仓库改 |
| 直接往 migrations 目录丢手写 SQL | 违反 R7，会造成 drizzle journal 与目录两套账本 |
| 在 `shared/` 里 import `db` / `lib` | `shared/` 被后台 SPA 引用，引入服务端代码会打爆前端构建 |
| 提交 `apps/console/dist/` 到 git | 构建产物；已在 `.gitignore` |
| 提交 `.wrangler/` 到 git | 本地 D1 状态，含测试数据 |
| 在正文里透传原生 HTML | 关闭 HTML 透传是「不需要消毒库」的前提，打开就等于要引入 `jsdom` |
| 用 `Math.random()` 生成 ID 或令牌 | `lib/id.ts` 用 `crypto.getRandomValues`；令牌另走 32 字节 CSPRNG |
| 把 token 存 localStorage | 任何 XSS 都能直接读走；本项目用 HttpOnly cookie |

## 8. 已知坑位备忘

以下都是在本环境实测验证过的，不是通用建议。

| 坑 | 处置 |
| --- | --- |
| `assets` 未设 `run_worker_first` 时，`/` 会直接返回 `dist/index.html`，SSR 分支对同名路径永远不生效 | 本项目已设 `true`，并在 `site/router.ts` 显式 `ASSETS.fetch` 兜底 |
| pnpm 默认不执行 `workerd` / `esbuild` 的安装脚本，`wrangler dev` 与集成测试会起不来 | 已在 `pnpm-workspace.yaml` 的 `onlyBuiltDependencies` 里批准 |
| `@cloudflare/vitest-pool-workers` 已改名为 `@cloudflare/vitest-plugin`，旧包只有到 0.23.0 且不再更新 | 用 `@cloudflare/vitest-plugin` 的 `cloudflareTest()` + `readD1Migrations()` |
| `@hono/zod-openapi` 1.x 要求 zod 4，0.18 要求 zod 3 | 本项目用 zod 4 + `@hono/zod-openapi` 1.6；不要混装 |
| `@vitejs/plugin-react` 6 需要 vite 8 与额外 peer 依赖 | 本项目用 vite 7 + `@vitejs/plugin-react` 5 |
| Windows 下 `pnpm dev` 用 `concurrently` 起两个进程，端口占用后不会自动释放 | 先 `Get-NetTCPConnection -LocalPort 8787` 找 PID 再 kill |
| `drizzle-kit generate --custom` 生成的空文件不改会留在目录里 | 必须填内容（FTS DDL 就是这样落地的），否则迁移是空操作 |
| D1 的 FTS5 需要预分词，`unicode61` 把连续汉字当一个 token | 写入与查询两侧都走 `lib/search.ts` 的 `segmentText` |
| Miniflare 的 KV 与 D1 在测试间是隔离的，但同一文件内持久 | 每个测试文件用 `resetState()` 清 KV |
| `hono/jsx` 的 `<div dangerouslySetInnerHTML>` 只用于正文与插件注入点 | 其他地方一律 JSX 插值，靠自动转义 |

## 9. 文档体系

| 文档 | 内容 | 冲突时以谁为准 |
| --- | --- | --- |
| `docs/01-参考项目架构分析.md` | 两个参考项目的架构分析与取舍依据 | 历史决策背景 |
| `docs/02-CMS架构设计方案.md` | 本项目架构蓝图（表结构、权限、API、缓存） | **架构问题以此为准** |
| `docs/03-开发与扩展指南.md` | 本地开发、扩展步骤、排错 | **操作问题以此为准** |
| `docs/04-测试报告.md` | 功能 / 性能 / 兼容性测试结果 | 结果数据以此为准 |
| `docs/adr/` | 关键决策记录（为什么这么做） | 决策理由以此为准 |
| `docs/_research/` | 两个参考项目的逐文件深挖笔记 | 仅作证据，不作规范 |
| `README.md` | 面向人的快速上手 | 与本文重复时以本文为准 |

新增/修改架构决策时，同步更新 `docs/adr/` 并在 `docs/02` 的对应章节留一句指向。

## 10. 维护规则

**什么时候回写本文件**：

| 事件 | 回写内容 |
| --- | --- |
| 修完一个线上问题 | 第 8 节加一条坑位（含现象与处置） |
| 改了分层或依赖方向 | 第 4 节的铁律与「新增功能动哪些文件」表 |
| 新增或改名了命令 | 第 3 节，并在干净 checkout 里实际跑一遍 |
| 引入了新的第三方依赖 | 第 1 节技术栈表 + 第 8 节若涉及兼容问题 |
| 发现某条规则被反复违反 | 把该规则从「规范」提到「硬性规则」，并补依据 |

**本文件与其他指令文件的关系**：

- 本文件是唯一真值。若存在 `CLAUDE.md`，应是指向本文件的说明或软链，不要双写。
- Cursor 原生读取 `AGENTS.md`；`.cursorrules` 已弃用，内容并入本文件。
- 工具托管块（如 `<!-- TOOL:START -->`）内的内容会被下次生成覆盖，改动只放块外。

**行数预算**：本文件目标在 300 行内。超过 400 行时，把细节移入 `docs/`，此处只留「一句话规则 + 链接」，规则条数不减少。
