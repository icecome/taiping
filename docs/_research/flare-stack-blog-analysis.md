# flare-stack-blog 架构分析笔记

| 项 | 值 |
| :--- | :--- |
| 分析对象 | `docs/flare-stack-blog`（仓库根目录，只读分析，未修改任何文件） |
| 项目 | flare-stack-blog v3.6.1（`package.json` `name` / `version`） |
| 许可 | GPL-3.0-only（`package.json` `license`，`LICENSE`） |
| 上游 | `github.com/du2333/flare-stack-blog`（`.release-it.ts` `GITHUB_REPO`、`src/features/version/service/version.service.ts`） |
| 技术栈 | TanStack Start + React 19 + D1 + Drizzle + better-auth + oRPC + Tiptap + Shiki |
| 运行目标 | Cloudflare Workers（唯一目标，ADR 0001） |
| 迁移数量 | `migrations/` 下 23 个 SQL（0000–0022） |
| i18n 词条 | `messages/zh.json`、`messages/en.json` 各 1120 条 |
| ADR | `docs/adr/` 共 30 篇（0001–0029，含 2 篇编号 0002） |

本笔记的每条结论都带仓库内文件路径。文中的路径均相对仓库根目录。源码片段只摘 3–10 行关键行，不整段复制。

---

## 0. 全局分层

```text
浏览器
 │
 ├─ HTML/JS（React 19 + TanStack Router/Start SSR 水合）
 │    src/routes/**、src/features/*/components/**
 │
 ├─ /api/**  ──oRPC OpenAPIHandler──► src/lib/orpc/router.ts
 │    src/routes/api.$.ts             └─ 15 个 feature 子路由
 │                                        └─ service → data(Drizzle) → D1
 ├─ /api/auth/** ──► better-auth       src/lib/http/handle-auth-request.ts
 ├─ /images/** ──► R2 + Image Resizing src/features/media/service/media.service.ts
 └─ /rss.xml / atom.xml / feed.json / sitemap.xml / robots.txt / site.webmanifest
      ──► src/features/site-documents/service/site-documents.service.ts

异步面
 ├─ Queue（EMAIL / WEBHOOK）      src/lib/queue/queue.handler.ts
 ├─ Durable Object PostPublisher  src/lib/do/post-publisher.ts（发布串行化）
 ├─ Durable Object RateLimiter    src/lib/do/rate-limiter.ts（令牌桶限流）
 └─ Cron "15 0 * * *"             src/server.ts scheduled → Umami 热度同步
```

一条硬约束贯穿全仓：**admin 内容库（`posts.content_json`）与公开展示库（`posts.public_snapshot_json`）是两个数据面**，只有 publish 动作把前者拷到后者（ADR 0002、0008，`GLOSSARY.md`）。

---

## 1. 依赖与构建链

### 1.1 package.json 脚本

| 脚本 | 命令 | 作用 |
| :--- | :--- | :--- |
| `dev` | `vite dev --port 3000` | 本地开发，走 `@cloudflare/vite-plugin` 内置 Miniflare（本地 D1/KV/R2） |
| `build` | `bun run orpc:contract && cf build && bun scripts/ssr-chunk-graph.ts .cloudflare/output/v0/workers/default/bundle` | 生成合约 → 构建 Worker → 校验 SSR chunk 回边 |
| `deploy` | `cf d1 migrations apply "$D1_DATABASE_ID" && cf deploy --prebuilt` | 先迁库，再发布已有产物 |
| `orpc:contract` | `bun run i18n:compile && bun scripts/generate-orpc-contract.ts && oxfmt src/lib/orpc/contract.generated.json` | 合约生成（见 §5.1） |
| `typecheck` | `bun run orpc:contract && cf workers types && ./node_modules/typescript/bin/tsc --noEmit` | 先造类型再查 |
| `check` | `bun run orpc:contract && cf workers types && oxlint && oxfmt --check && tsc --noEmit` | 提交前总检 |
| `test` / `test:node` | `vitest run` / `vitest run --config vitest.node.config.ts` | 两套测试（见 §12.3） |
| `lint` / `lint:fix` / `format` | `oxlint` / `oxlint --fix` / `oxfmt` | oxc 工具链 |
| `i18n:compile` | `bun paraglide-js compile --project ./project.inlang --outdir ./src/paraglide` | Paraglide 运行时代码生成 |
| `i18n:verify` / `i18n:prune-unused` | `bun scripts/verify-translations.ts` / `.../prune-unused-translations.ts` | 词条齐全性 / 未用词条 |
| `db:generate` / `db:push` / `db:studio` | `drizzle-kit *` | 本地 schema 工具 |
| `db:migrate` | `cf d1 migrations apply "$D1_DATABASE_ID"` | 远程迁库 |
| `db:migrate:local` | `cf d1 migrations apply 00000000-0000-4000-8000-000000000000 --local --persist-to .wrangler/state` | 本地迁库，用固定占位 UUID |
| `auth:generate-schema` | `bunx @better-auth/cli generate --yes --config auth-cli.ts --output src/lib/db/schema/auth.table.ts` | `auth.table.ts` 是生成物 |
| `release` / `release:beta` | `export GITHUB_TOKEN=$(gh auth token) && release-it [--preRelease=beta]` | 发布 |
| `postinstall` | `bun run i18n:compile && cf workers types` | 装完依赖即生成 paraglide 与 Worker 类型 |
| `prepare` | `husky` | 装 git hooks |
| `wrangler:prepare` | `bun scripts/wrangler-prepare-deprecated.ts` | 仅打印弃用提示，保留一个大版本 |

`engines.node` 为 `>=24`，`.node-version` 为 `24`。

### 1.2 vite.config.ts

```ts
// vite.config.ts:12-18
define: {
  __APP_VERSION__: JSON.stringify(packageJson.version),
  // Unique per build, so cached pages never outlive the assets they name.
  __BUILD_ID__: JSON.stringify(process.env.WORKERS_CI_BUILD_UUID || Date.now().toString(36)),
},
```

插件顺序（`vite.config.ts:25-43`）：

| 顺序 | 插件 | 作用 |
| :--- | :--- | :--- |
| 1 | `paraglideVitePlugin` | 项目 `./project.inlang`，输出 `./src/paraglide`，策略 `["cookie","preferredLanguage","baseLocale"]`，cookie 名 `LOCALE` |
| 2 | `cloudflare({ viteEnvironment: { name: "ssr" }, experimental: { newConfig: true } })` | 用 `cloudflare.config.ts` 取代 `wrangler.jsonc`，SSR 环境名固定 `ssr` |
| 3 | `tailwindcss()` | Tailwind 4 |
| 4 | `devtools()`（`@tanstack/devtools-vite`） | TanStack Devtools |
| 5 | `tanstackStart()` | Start 插件（生成 `src/routeTree.gen.ts` 等） |
| 6 | `viteReact()` | React 19 插件 |

`resolve.tsconfigPaths: true` + 别名 `@ → ./src`（`vite.config.ts:19-24`）。

### 1.3 cloudflare.config.ts（唯一的 Worker 配置）

| 配置项 | 值 / 代码位置 |
| :--- | :--- |
| 入口 | `import * as entrypoint from "./src/server" with { type: "cf-worker" }`（`cloudflare.config.ts:3`） |
| `compatibilityDate` | `2026-02-17` |
| `compatibilityFlags` | `["nodejs_compat", "global_fetch_strictly_public"]` |
| `cache` | `worker.cache.enabled = true`（Workers Cache 总开关） |
| `observability` | `enabled: true` |
| 域名 | 有 `DOMAIN` 且 `ROUTE` 不为真 → `domains: [domain]`（Custom Domain）；`ROUTE=1` → `triggers.fetch({ pattern, zone })` |
| Cron | `triggers.scheduled({ schedule: "15 0 * * *" })`（每天 00:15 UTC） |
| Queue 消费者 | `triggers.queue({ name, maxBatchSize: 10, maxBatchTimeout: 5, maxRetries: 3 })`，`ctx.mode === "test"` 时不注册 |
| 绑定 | `DB: bindings.d1({id})`、`KV: bindings.kv({id})`、`R2: bindings.r2({name})`、`QUEUE: bindings.queue({name})` |
| `exports` | `default`（cache 关闭）、`App`（cache 开启）、`RateLimiter`（DO，sqlite 存储）、`PostPublisher`（DO，sqlite 存储） |

部署变量的读取方式（`cloudflare.config.ts:5-22`）：`cloudflare.config.ts` **不读 `.env`**，只读真实环境变量（Cloudflare Workers Builds 的构建变量），未设置时用占位符让 `bun dev` / 测试 / CI 能跑起来。D1 的占位 UUID 刻意写成合法的 `00000000-0000-4000-8000-000000000000`，因为 `bun db:migrate:local` 指向它。

### 1.4 构建产物结构

| 路径 | 来源 | 内容 |
| :--- | :--- | :--- |
| `.cloudflare/output/v0/workers/default/bundle/` | `cf build` | Worker 产物目录。构建脚本把它喂给 `scripts/ssr-chunk-graph.ts` |
| `…/bundle/worker-entry-*.js` | `cf build` 分包 | SSR 入口（`scripts/ssr-chunk-graph.ts:6` 的正则 `^worker-entry-[^/]+\.js$`） |
| `…/bundle/index.js` | 分包时 | 重新导出的 stub，真正动态导入在 `assets/worker-entry-*.js` 里（`scripts/ssr-chunk-graph.ts:19-29` 注释原文） |
| `.cloudflare/types/index.d.ts` | `cf workers types` | Worker 类型声明，gitignored，但被 `tsconfig.json:30` include |
| `src/paraglide/` | `i18n:compile` | Paraglide 运行时代码（`m`、`runtime`、`server`） |

`.cloudflare` 在 `.gitignore` 末尾单列（`# cf build output`），本检出中该目录不存在——产物结构由构建脚本与 `ssr-chunk-graph.ts` 的解析逻辑反推。

`scripts/ssr-chunk-graph.ts` 是一个**构建后静态校验器**：它读 SSR 入口里所有 `import("./x.js")` 动态导入，再看被导入 chunk 是否又静态 import 回入口，形成回边就 `process.exit(1)`。回边会让 workerd 的模块图出现循环依赖，SSR 会挂。脚本同时被 `scripts/ssr-chunk-graph.test.ts` 覆盖。

### 1.5 dev 与 deploy 的差异

| 维度 | `bun dev` | `bun run deploy`（Workers Builds） |
| :--- | :--- | :--- |
| 构建器 | Vite dev server + `@cloudflare/vite-plugin` | `cf build`（预构建产物） |
| 存储 | Miniflare 本地模拟 D1/KV/R2（`.wrangler/state`） | 真实 D1/KV/R2/Queue |
| 绑定来源 | `cloudflare.config.ts` 占位符 + `.dev.vars` 运行时变量 | Cloudflare 构建变量 + Worker 机密 |
| 迁移 | 手动 `bun db:migrate:local` | `bun run deploy` 内嵌 `cf d1 migrations apply` |
| 邮件 | `ENVIRONMENT=dev` 时 `sendEmail` 只打日志（`src/features/email/service/email.service.ts:283-288`） | 真实 SMTP（`worker-mailer`） |
| Workers Cache | 本地不生效 | `cache.enabled: true` 生效 |

### 1.6 `cf` CLI 与 wrangler 的关系

- 仓库里**没有** `wrangler.jsonc`、**没有** `wrangler` 依赖、**没有**生成的 `worker-configuration.d.ts`（ADR `docs/adr/0002-cloudflare-config-ts.md` 明写）。
- `cf` 是 devDependency：`"cf": "1.0.0-beta.5"`（`package.json:120`），并且是**打过补丁的依赖**：`patchedDependencies: { "cf@1.0.0-beta.5": "patches/cf@1.0.0-beta.5.patch" }`。
- 补丁改的是 `cf build/deploy` 内部把 `strict` 硬编码为 `true` 的那一行：`patches/cf@1.0.0-beta.5.patch` 把 `deploy` 分支的 `strict:!0` 改成 `strict:!1`。ADR 0002 解释原因：CI 部署时若 Worker 上次是从 Dashboard 改过（保存运行时机密就会触发），`cf deploy` 会因 strict 模式判定配置漂移而中止，且此后每次部署都失败。补齐后只打警告继续，行为对齐 Wrangler 时代的 CI。
- AGENTS.md 给代理的操作约定：Cloudflare 操作一律走 `bunx cf cli search "<task>"` 找命令。
- DO 不再用 `bindings.durableObject()`，改用 `exports`（`cloudflare.config.ts:64-72` 注释原文：`bindings.durableObject()` 总会带上 `script_name`，而 `@cloudflare/vitest-plugin` 测不了）。

### 1.7 为什么用 bun

| 证据 | 说明 |
| :--- | :--- |
| `README.md:78` | 开发环境要求 Bun >= 1.3 |
| `.github/workflows/ci.yml:40` | `bun ci` 安装依赖 |
| `package.json` 脚本 | 全部以 `bun run` / `bun scripts/*.ts` / `bunx` 串联，直接执行 TypeScript |
| `patchedDependencies` | bun 独有的依赖补丁机制，承载 `cf` 的 strict 补丁 |
| `bun.lock` | 唯一锁文件（289KB），无 `package-lock.json` / `pnpm-lock.yaml` |
| `scripts/dev-admin-session.ts:17` | 直接 `import { Database } from "bun:sqlite"` 读写本地 D1 的 sqlite 文件 |
| `cloudflare.config.ts:5` | 反向约束：该文件**只能**由 Node ≥ 22.18（Vite / Vitest / `cf`）加载，Bun 加载不了 |

也就是说分工是明确的：**Bun 负责依赖安装、脚本编排、纯 TS 小工具；Node 负责 Vite/Vitest/cf 这条需要 Node 语义的链路。**

### 可复用要点

- 把「构建产物结构校验」写成构建脚本的一环（`ssr-chunk-graph.ts`），比等运行时白屏更便宜。
- 部署变量放构建变量而非 commit 文件里，fork 者零改文件（ADR 0002）。
- `define` 注入 `__BUILD_ID__`，让缓存键与构建绑定，是 Edge SSR 缓存的基础设施。

### 踩坑点

- `cf` 是 beta 且被 patch：**升级 `cf` 会让补丁失效**（ADR 0002 原文说"upgrading `cf` makes the patch fail to apply, which is the cue to re-check"）。升级前必须重做补丁。
- DO 一旦用 `exports` 声明并部署，**不能回退到基于 `migrations` 的 Wrangler 配置**（`cloudflare.config.ts:64-66`、`docs/deployment.md:245`）。
- `cloudflare.config.ts` 不读 `.env`，本地 `cp .env.example .env` 只是给 `drizzle-kit` 这类本地工具用；改了 `.env` 不会影响 Worker 构建。
- 老版本的构建命令 `bun run wrangler:prepare && bun run build` 仍可跑，但只会打印弃用提示（`scripts/wrangler-prepare-deprecated.ts`），别以为它还在做准备工作。
- 运行时变量在部署时必须全部选 **Secret** 类型：`cf deploy` 保留机密但会丢弃未写进配置的普通文本变量（ADR 0002、`docs/deployment.md:210`）。遗漏会直接报 `Invalid environment variables`。

---

## 2. 运行时与绑定

### 2.1 绑定总表

| 服务 | 声明位置 | 绑定名 / 形式 | 用途 | 读写代码位置 |
| :--- | :--- | :--- | :--- | :--- |
| **D1** | `cloudflare.config.ts:59` `bindings.d1({ id })` | `env.DB` | 唯一关系库：内容、用户、评论、媒体元数据、FTS 索引、系统配置 | `src/lib/db/index.ts:7-9` `getDb(env)` → `drizzle(env.DB, { schema })` |
| **KV** | `cloudflare.config.ts:60` `bindings.kv({ id })` | `env.KV` | ① 公开读模型缓存（`src/features/cache/public-cache.ts`）② 缓存代际号 `ver:<namespace>` ③ 版本检查缓存、邮件测试记录、文章热度快照 | `src/features/cache/kv-store.ts`、`src/features/version/service/version.service.ts:82`、`src/features/post-popularity/data/post-popularity.data.ts` |
| **R2** | `cloudflare.config.ts:61` `bindings.r2({ name })` | `env.R2` | 媒体原图与站点资源（favicon、主题图） | `src/features/media/data/media.storage.ts:11,47` |
| **Queue** | `cloudflare.config.ts:62` + `triggers.queue` | `env.QUEUE`（生产者）、`queue()` handler（消费者） | 邮件与 Webhook 异步投递 | 生产：`src/features/notification/service/notification.publisher.ts:63,77`、`src/lib/auth/auth.server.ts:118,143`；消费：`src/lib/queue/queue.handler.ts` |
| **Durable Object RateLimiter** | `cloudflare.config.ts:70` `exports.durableObject({ storage: "sqlite" })` | **无绑定**，`exports.RateLimiter.getByName(name)` | 令牌桶限流（评论、登录、注册、改密等） | `src/lib/do/rate-limiter.ts`、`src/lib/do/rate-limiter-binding.ts` |
| **Durable Object PostPublisher** | `cloudflare.config.ts:71` | **无绑定**，`exports.PostPublisher.getByName(\`post:${id}\`)` | 单篇文章的发布/下线串行化 | `src/lib/do/post-publisher.ts`、`src/lib/do/post-publisher-binding.ts` |
| **Workers Caching** | `cloudflare.config.ts:34` `worker.cache.enabled`，`exports.App` 单独开 cache | 无绑定（平台级） | 公开 HTML 与站点文档缓存，按 `Cache-Tag` 失效 | `src/features/cache/workers-cache-policy.ts`、`src/features/cache/workers-cache.ts` |
| **Cloudflare Images（Image Resizing）** | 无绑定 | `fetch(url, { cf: { image: {...} } })` | 按请求宽度/质量实时缩放，输出 AVIF/WebP | `src/features/media/service/media.service.ts:356-359` |
| **Workers AI** | 无 | — | 未使用 |
| **Workflows** | 无 | — | 未使用（ADR `0004-workflows-and-queues-for-async-work.md` 原文 "Cloudflare Workflows are not used"） |
| **KV（OAuth）** | 无 | — | ADR 0005 移除 MCP/OAuth provider 时一并删除 `OAUTH_KV` |

### 2.2 入口与三种触发面

`src/server.ts` 一个文件挂三个面：

```ts
// src/server.ts:52-62 —— 默认入口：解 locale，然后转发到 App，并给缓存键加构建前缀
export default {
  async fetch(request, _env, ctx) {
    const locale = extractLocaleFromRequest(request);
    return ctx.exports.App({ props: { locale } }).fetch(request, {
      cf: { cacheKey: `/_build/${__BUILD_ID__}${workersCacheKey(request.url)}` },
    });
  },
```

| 触发面 | 代码 | 行为 |
| :--- | :--- | :--- |
| `fetch` | `src/server.ts:33-50`（`class App extends WorkerEntrypoint`） | `paraglideMiddleware` 包住 `handler.fetch`，注入 `{ env, executionCtx }`，出来再套 `applyWorkersCachePolicy` |
| `queue` | `src/server.ts:63-65` | 转交 `handleQueueBatch` |
| `scheduled` | `src/server.ts:66-73` | 调 `postPopularityService.sync`，失败抛错（让 Cron 记录失败） |
| DO 导出 | `src/server.ts:15-16` | `export { PostPublisher } from "@/lib/do/post-publisher"` 等 |
| 缓存 purge RPC | `src/server.ts:46-49` | `App.purgeCache(target)` 从 `cloudflare:workers` 取 `cache` 做 `purge` |

`src/server.ts:18-27` 用模块扩充把 `env` / `executionCtx` 塞进 Start 的 `requestContext`，这是 `getGlobalStartContext()` 能拿到 Cloudflare 绑定的前提。

`global.d.ts` 声明全局 `Env extends Cloudflare.Env`（补 `QUEUE: Queue<QueueMessage>`）以及 `DB` / `Auth` / `Session` / `BaseContext` / `DbContext` / `SessionContext` / `AuthContext` 六个上下文类型。

### 可复用要点

- 一个 Worker 里同时挂 `fetch`/`queue`/`scheduled` 与 DO 导出，比拆多 Worker 少一层 service binding 心智负担。
- 无绑定的 DO 通过 `exports.X.getByName()` 访问，让 `@cloudflare/vitest-plugin` 能在本地测到真实 DO。

### 踩坑点

- `src/lib/do/rate-limiter-binding.ts:1-2` 与 `post-publisher-binding.ts:1` 都把 `cloudflare:workers` 写成**惰性 import**，注释直说是为了「Bun 跑的脚本（如 `orpc:contract`）也能加载这个模块」。改成顶层 import 会让 `bun scripts/generate-orpc-contract.ts` 直接崩——因为 `cloudflare:workers` 只在 workerd 内可解析。
- `compatibilityFlags` 里有 `global_fetch_strictly_public`，且 `src/lib/http/raw-https.ts` 用 `cloudflare:sockets` 手搓 TLS GET 绕开 `fetch` 自动加的 `cf-*` 头（注释点名 Bilibili 返回 412）。这是"平台默认行为逼出的兼容层"。
- Workers Cache 的 `cacheKey` 前缀 `/_build/<BUILD_ID>`（`src/server.ts:56-60`）是**必需**的：缓存页里引用的静态资源带该次构建的 hash，发版后这些资源被删，旧缓存页永久不可用。去掉前缀会拿到指向已删除资源的 HTML。
- ADR 0009 明确 `cache.purge` 的作用域是**发起 purge 的 entrypoint**，所以 `invalidate.*` 必须通过 `ctx.exports.App.purgeCache` RPC，不能在 DO 或默认 `fetch` 里直接 purge。

---

## 3. 数据库层

### 3.1 统一约定：`src/lib/db/schema/helper.ts`

```ts
// src/lib/db/schema/helper.ts（全文 13 行）
export const createdAt = integer("created_at", { mode: "timestamp" })
  .notNull().default(sql`(unixepoch())`);
export const updatedAt = integer("updated_at", { mode: "timestamp" })
  .notNull().default(sql`(unixepoch())`).$onUpdate(() => new Date());
export const id = integer("id").primaryKey({ autoIncrement: true });
```

| 约定 | 内容 |
| :--- | :--- |
| 时间戳精度 | 业务表用 **秒级** `mode: "timestamp"`，DB 默认 `unixepoch()`，更新时由 Drizzle 的 `$onUpdate` 写 `new Date()` |
| 例外 | `auth.table.ts` 全部用 **毫秒级** `timestamp_ms`，默认值 `cast(unixepoch('subsecond') * 1000 as integer)`——这是 better-auth CLI 生成的约定，不是手写的 |
| 主键 | `id = integer autoIncrement`，所有业务表一致 |
| 例外 | better-auth 的 `user` / `session` / `account` / `verification` / `apikey` 用 `text` 主键（库方生成），`system_config.id` 固定 `1` |

### 3.2 逐表清单

`schema/index.ts` 只 re-export 8 个文件；`drizzle.config.ts:5` 指向 `./src/lib/db/schema/index.ts`。

#### 3.2.1 `posts` — `src/lib/db/schema/posts.table.ts:42-72`

| 列 | 类型 | 约束 |
| :--- | :--- | :--- |
| `id` | integer | PK autoincrement |
| `title` | text | NOT NULL |
| `summary` | text | 可空 |
| `slug` | text | NOT NULL **UNIQUE**（草稿 slug） |
| `content_json` | text (json) | `$type<JSONContent>`，Tiptap/ProseMirror 文档 |
| `public_snapshot_json` | text (json) | `$type<PublicPostSnapshot>`，**公开快照**（null = 草稿） |
| `public_slug` | text | 可空，线上 URL 的 slug |
| `status` | text enum `["draft","published"]` | NOT NULL default `draft` |
| `published_at` | integer ts | 可空 |
| `pinned_at` | integer ts | 可空 |
| `cover_media_id` | integer | 可空（无 FK，见 3.4） |
| `category_id` | integer | FK → `categories.id` ON DELETE **set null** |
| `created_at` / `updated_at` | integer ts | helper |

索引与唯一约束：

| 名称 | 定义 | 说明 |
| :--- | :--- | :--- |
| `posts_public_slug_unique` | `uniqueIndex(public_slug)` | 线上 URL 唯一；草稿间不冲突 |
| `published_at_idx` | `(published_at, status)` | 公开列表主查询 |
| `created_at_idx` | `(created_at)` | |
| `posts_cover_media_id_idx` | `(cover_media_id)` | |
| `posts_category_id_idx` | `(category_id)` | |

`PublicPostSnapshot` 类型（`posts.table.ts:23-34`）字段：`title`、`summary`、`slug`、`contentJson`、`tagIds: number[]`（**历史元数据**，注释原文 "Historical metadata; live Category/Tag assignments use the relations below"）、`categoryId`、`publishedAt: string`、`pinnedAt: string \| null`、`cover: PublicPostCover \| null`。

#### 3.2.2 `categories` / `tags` / `post_tags` — 同文件 `36-94`

| 表 | 关键列 | 约束 |
| :--- | :--- | :--- |
| `categories` | `id`, `name`, `created_at` | `name` NOT NULL UNIQUE；**无** `updated_at` |
| `tags` | `id`, `name`, `created_at` | `name` NOT NULL UNIQUE |
| `post_tags` | `post_id`, `tag_id` | 复合 PK；两列 FK 均 `onDelete: "cascade"`；`post_tags_tag_idx(tag_id)` |

`posts.categoryId → categories.id`（onDelete `set null`）构成「一篇至多一个分类」（ADR 0022、GLOSSARY）。

#### 3.2.3 `post_revisions` — `src/lib/db/schema/post-revisions.table.ts:26-47`

| 列 | 类型 | 说明 |
| :--- | :--- | :--- |
| `id` | integer PK | |
| `post_id` | integer | FK → `posts.id` **cascade** |
| `reason` | text enum `["auto","publish","restore_backup"]` | default `auto`（实际代码只在 publish / 恢复前写） |
| `snapshot_json` | text (json) `$type<PostRevisionSnapshot>` | 见下 |
| `snapshot_hash` | text NOT NULL | SHA-256（`src/features/posts/utils/sync.ts`） |
| `restored_from_revision_id` | integer | 无 FK，纯记录 |
| `created_at` | integer ts | |

索引：`post_revisions_post_created_idx(post_id, created_at)`、`post_revisions_post_hash_idx(post_id, snapshot_hash)`。**无 `updated_at`**——修订是不可变的。

#### 3.2.4 `media` / `post_media` — `src/lib/db/schema/media.table.ts`

| 表 | 列 | 约束 |
| :--- | :--- | :--- |
| `media` | `id`, `key`(UNIQUE NOT NULL), `url`(NOT NULL), `file_name`, `width`, `height`, `mime_type`, `size_in_bytes`, `created_at` | `created_at_idx_media(created_at)` |
| `post_media` | `post_id`, `media_id` | 复合 PK；两列 FK 均 cascade |

`media` **没有** `updated_at`。`post_media` 是媒体引用关系的物化表，由 `src/features/posts/data/post-media.data.ts:39-87` 在创建/更新/发布/下线时同步（用 `db.batch` 做删+插，并先比对集合避免空写）。

#### 3.2.5 `comments` / `email_unsubscriptions` — `src/lib/db/schema/comments.table.ts`

| 列 | 类型 | 约束 / 说明 |
| :--- | :--- | :--- |
| `id` | integer PK | |
| `content` | text | 可空，**纯文本**（ADR 0011） |
| `root_id` | integer | 自引用 FK，`onDelete: "cascade"`（`(): AnySQLiteColumn => CommentsTable.id` 处理自引用类型） |
| `reply_to_comment_id` | integer | 自引用 FK，`onDelete: "set null"` |
| `status` | text enum `["published","deleted"]` | default `published`（软删除，ADR 0014） |
| `post_id` | integer | FK → `posts.id` **cascade** |
| `user_id` | text | FK → `user.id` **set null** |
| `handled_at` | integer ts | 可空，Admin 已处理标记，**Admin-only**（注释原文） |
| `created_at` / `updated_at` | integer ts | helper |

索引 4 条：`comments_post_root_created_idx(post_id, root_id, created_at)`、`comments_user_created_idx(user_id, created_at)`、`comments_status_created_idx(status, created_at)`、`comments_global_created_idx(created_at)`。

`email_unsubscriptions`：`user_id`（FK → `user.id` **cascade**）+ `type enum ["reply_notification"]` 复合 PK，`created_at`。

#### 3.2.6 `friend_links` — `src/lib/db/schema/friend-links.table.ts`

`id`、`site_name`、`site_url`、`description`、`logo_url`、`status enum ["pending","approved","rejected"]` default `pending`、`rejection_reason`、`user_id`（FK → `user.id` cascade，可空，Admin 自建无申请人）、`created_at`、`updated_at`。索引：`friend_links_status_created_idx(status, created_at)`、`friend_links_user_idx(user_id)`。

注意：**没有** `contact_email` 列——迁移 `0021_friend_link_account_email.sql` 已 `DROP COLUMN contact_email`（ADR 0026）。

#### 3.2.7 better-auth 四表 + `apikey` — `src/lib/db/schema/auth.table.ts`

| 表 | 主键 | 关键列 |
| :--- | :--- | :--- |
| `user` | text | `email` UNIQUE NOT NULL、`email_verified` bool、`role` text（**无默认值**）、`banned` / `ban_reason` / `ban_expires`（admin 插件）、`muted_at`（**项目新增**，`timestamp_ms`） |
| `session` | text | `token` UNIQUE、`expires_at`、`ip_address`、`user_agent`、`user_id`（FK cascade）、`impersonated_by`；索引 `session_userId_idx` |
| `account` | text | `account_id`、`provider_id`、`password`、各类 token 与过期时间；索引 `account_userId_idx` |
| `verification` | text | `identifier`、`value`、`expires_at`；索引 `verification_identifier_idx` |
| `apikey` | text | `config_id` default `"default"`、`reference_id`、`key`、`prefix`、`start`、`enabled`、`rate_limit_enabled` default true、`rate_limit_time_window` default `86400000`、`rate_limit_max` default `10`、`permissions`、`metadata`；三条索引 `apikey_configId_idx` / `apikey_referenceId_idx` / `apikey_key_idx` |

`user.mutedAt` 是通过 `auth.config.ts:18-24` 的 `additionalFields`（`type: "date"`, `input: false`）声明的，`input: false` 表示不接受客户端写入。全部文件是 `bun run auth:generate-schema` 的生成物。

#### 3.2.8 `system_config`（单例 JSON）— `src/lib/db/schema/config.table.ts`

| 列 | 类型 | 约束 |
| :--- | :--- | :--- |
| `id` | integer PK NOT NULL default `1` | `CHECK (id = 1)` — 单例由 DB 保证 |
| `config_json` | text (json) `$type<StoredSystemConfig>` NOT NULL | `CHECK json_valid(config_json)` |
| `site_revision` | integer NOT NULL default 0 | `CHECK >= 0` |
| `notification_revision` | integer NOT NULL default 0 | `CHECK >= 0` |
| `updated_at` | integer ts | 复用 helper，**无 `created_at`** |

三个额外 CHECK 约束名为 `system_config_singleton` / `system_config_valid_json` / `system_config_revisions`。注意 schema 层有 `site_revision` / `notification_revision`，但**迁移文件 `0020_system_config_versions.sql` 是手写的**（含一个临时的 `system_config_migration_guard` 表，用 `CHECK (rows <= 1)` 让多行脏数据直接让迁移失败，而不是静默丢数据）。

#### 3.2.9 搜索两表 + FTS 虚表 — `src/lib/db/schema/search.table.ts` + `migrations/0019_search_fts.sql`

| 对象 | 列 / 定义 |
| :--- | :--- |
| `search_documents` | `post_id` integer PK、`slug`、`title`、`summary`、`content`、`tags`（json text）、`tokens`（分词结果） |
| `search_index_meta` | `id` integer PK、`version` text（版本=写入时的时间戳字符串） |
| `search_documents_fts` | `CREATE VIRTUAL TABLE ... USING fts5(tokens, content='search_documents', content_rowid='post_id', tokenize='unicode61')` |
| 触发器 | `search_documents_ai`（AFTER INSERT）、`search_documents_ad`（AFTER DELETE）、`search_documents_au`（AFTER UPDATE，先删后插） |

### 3.3 命名规范与 ID 生成策略

| 维度 | 规范 | 反例（真实存在） |
| :--- | :--- | :--- |
| 表名 | 业务表 snake_case 复数：`posts` / `post_revisions` / `post_media` / `friend_links` / `email_unsubscriptions` | better-auth 表为单数小写 `user` / `session` / `account` / `verification` / `apikey`；`system_config` 单数 |
| 列名 | snake_case；TS 属性 camelCase | `public_snapshot_json` ↔ `publicSnapshotJson` |
| 索引名 | 新表用 `{表}_{列}_{cols}_idx` | 老表混用：`published_at_idx`、`created_at_idx`、`created_at_idx_media`（`media` 表，把表名后置了） |
| 唯一索引名 | `{表}_{列}_unique` | 一致 |
| 业务 ID | `integer autoIncrement` | 全站一致，没有 ULID/UUID |
| 用户侧 ID | better-auth 生成的 text id | `user.id` / `session.id` / `apikey.id` |
| 对象存储 key | `crypto.randomUUID() + 扩展名`（`media.utils.ts:15-20`） | 站点资源例外：固定 `asset/<path>` 覆盖写（`media.storage.ts:41-53`） |
| DO 实例名 | `post:${postId}`（`post-publisher-binding.ts:4`）、`${identifier}:${scope}`（`procedure.ts:96`） | |

### 可复用要点

- 时间戳用 DB 侧 `unixepoch()` 默认值 + Drizzle `$onUpdate`，避免应用时区问题。
- 单例配置表用 `CHECK (id = 1)` 把不变量交给数据库，而不是靠应用自觉。
- 搜索索引独立成表 + FTS 虚表 + 触发器自动同步，业务代码只写 `search_documents`。

### 踩坑点

- **`migrations/meta/_journal.json` 与目录内容已经不一致**：journal 只登记到 `idx: 19`（`0019_search_fts`），`meta/` 快照只到 `0016_snapshot.json`，但目录里存在手写的 `0017`–`0022`。说明 0020–0022 是人工编写的迁移，没有回跑 `drizzle-kit generate`。后续用 `drizzle-kit generate` 重新生成前，必须先确认它不会把这六条迁移重排或重写。
- `posts.cover_media_id` **没有外键**（`posts.table.ts:58`，只有索引），所以「封面媒体被删」不能靠 DB 约束兜底；`syncPostMedia` / `resolveSnapshotCover` 里对缺失媒体返回 `null`（`posts.service.ts:56-70`）。
- 秒级 `timestamp` 与毫秒级 `timestamp_ms` 混用：业务表是秒，auth 表是毫秒。跨表比较时间（如 `comments.created_at` 与 `session.expires_at`）时单位不同，不能直接把数值相加。
- `comments.root_id` 的自引用 FK 需要显式 `(): AnySQLiteColumn => CommentsTable.id` 延迟求值（`comments.table.ts:20-25`），写成直接引用会在模块初始化时报错。
- `posts.slug` 与 `posts.public_slug` 是两个 UNIQUE，草稿可以抢占别人的线上 slug 名字，发布时由 `publicSlugExists` 检查并返回 `PUBLIC_SLUG_TAKEN`（`posts.service.ts:514-521`，409）。改 slug 再发布，**旧公开 slug 直接不可达**（ADR 0008）。

---

## 4. 认证与权限

### 4.1 better-auth 配置

`src/lib/auth/auth.config.ts`（纯配置，可被 CLI 复用）与 `src/lib/auth/auth.server.ts`（真正实例化）拆开。`auth-cli.ts` 只 import `createAuthConfig()`，用一个假的 drizzleAdapter 生成 schema。

| 能力 | 配置位置 | 内容 |
| :--- | :--- | :--- |
| 邮箱密码 | `auth.config.ts:7-9` + `auth.server.ts:101-103` | `enabled: true`，且 **`requireEmailVerification: true`** |
| Session | `auth.config.ts:10-16` | `storeSessionInDatabase: true` + `cookieCache { enabled: true, maxAge: 5*60 }`（5 分钟 cookie 缓存） |
| 用户扩展字段 | `auth.config.ts:17-25` | `mutedAt: { type: "date", required: false, input: false }` |
| admin 插件 | `auth.config.ts:27` | 提供 `user.role` / `banned` / `banReason` / `banExpires` 与 impersonation 字段 |
| api-key 插件 | `auth.config.ts:28-37` | `enableSessionForAPIKeys: true`、`requireName: true`、`defaultPrefix: "fsb_"`、**`rateLimit: { enabled: false }`**、`keyExpiration: { defaultExpiresIn: null, disableCustomExpiresTime: true }`（永不过期且不可自定义） |
| GitHub OAuth | `auth.server.ts:52-57` | `socialProviders.github`，走 `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` |
| 密码重置 | `auth.server.ts:104-126` | 自定义 `sendResetPassword`：先按邮箱限流，再 `renderToStaticMarkup(AuthEmail)`，最后 `env.QUEUE.send({ type: "EMAIL" })` |
| 邮箱验证 | `auth.server.ts:128-153` | 自定义 `sendVerificationEmail`（同样先限流再入队），`autoSignInAfterVerification: true` |
| 数据库 | `auth.server.ts:154-157` | `drizzleAdapter(db, { provider: "sqlite", schema: authSchema })` |
| 首个用户即管理员 | `auth.server.ts:158-172` | `databaseHooks.user.create.before`：查 `user` 表是否为空，空则写入 `role: "admin"` |
| hooks.before | `auth.server.ts:58-99` | ① `/sign-up/email` 按邮箱限流 3 次/小时（`checkEmailRateLimit`，用 DO RateLimiter）② API Key 管理路径的权限判定（见 4.4） |

### 4.2 角色模型

角色是**单层二值**：`user.role === "admin"` 或不是。没有角色表、没有权限矩阵（ADR 0019 明确否决了 per-key permission matrix）。

| 判定点 | 位置 | 行为 |
| :--- | :--- | :--- |
| 前端/SSR 路由守卫 | `src/routes/admin/route.tsx:30-41` | `beforeLoad` 取 `sessionQuery`，无 session → `redirect({ to: "/login" })`，`role !== "admin"` → `redirect({ to: "/" })` |
| 服务端过程守卫 | `src/lib/orpc/procedure.ts:80-88` | `adminProcedure = authProcedure.use(...)`，`context.session.user.role !== "admin"` 抛 `errors.FORBIDDEN()`（403） |
| 首位管理员 | `auth.server.ts:161-168` | 库中无用户时，`create` hook 直接写 `role: "admin"` |
| 通知收件人 | `src/features/auth/data/auth.data.ts:4-12` | `findAdminEmail` 取最早创建的 admin 邮箱 |

`mutedAt` 与 `banned` 是刻意分开的两套：`banned` 是 better-auth 的登录封禁；`mutedAt` 是站内「禁止发评论」，用 `src/features/muted-users/muted-users.ts` 的 `isMuted()` 判断（只要非 null 非空串即视为禁言），且**不能禁言 Admin**（ADR 0017、GLOSSARY）。

### 4.3 session 如何取

| 场景 | 位置 | 做法 |
| :--- | :--- | :--- |
| SSR | `src/lib/auth/get-request-session.ts:6-17` | `getGlobalStartContext()` 拿 `env` → `getDb` → `getAuth` → `auth.api.getSession({ headers: getRequestHeaders() })` |
| 查询层 | `src/features/auth/queries/index.ts:10-21` | `sessionQuery`：`import.meta.env.SSR` 为真走 `getRequestSession()`，否则走 `authClient.getSession()` |
| oRPC 上下文 | `src/lib/orpc/procedure.ts:10-27` | `readSession(context)`：`context.auth.api.getSession({ headers: context.headers })`，把 better-auth 的 401/403 转成 `ORPCError` |
| 客户端 | `src/lib/auth/auth-client.ts` | `createAuthClient` + `adminClient()` + `apiKeyClient()` |

### 4.4 API Key 机制

| 环节 | 位置 | 内容 |
| :--- | :--- | :--- |
| 签发 | `src/features/api-keys/hooks/use-api-keys.ts:44-59` | 客户端调 `authClient.apiKey.create({ name })`，`requireName: true` 保证必须有名字，返回的 `key` 只展示一次 |
| 列表 / 删除 | 同文件 `:32-42`、`:61-73` | `authClient.apiKey.list` / `.delete`，query key `["auth","api-keys"]` |
| 使用 | `src/lib/orpc/index.ts:15-20` | 浏览器 oRPC 客户端把 `getTurnstileToken()` 注入 `X-Turnstile-Token`；API Key 由调用方自己加 `x-api-key` 头（`.agents/skills/flare-stack-blog/SKILL.md` 第 2 节） |
| 守卫 | `src/lib/auth/api-key-guard.ts` | `isApiKeyManagementPath(path)`：以 `/api-key/` 开头且不在 `MANAGEMENT_SKIP`（`/api-key/verify`、`/api-key/delete-all-expired-api-keys`）里；`inspectApiKeyManagementAccess()` 规则：① 带 `x-api-key` 头 → 拒绝，码 `API_KEY_CANNOT_MANAGE_API_KEYS`；② 非 HTTP 请求（服务端内部调用）→ 放行；③ `role !== "admin"` → 拒绝，码 `ADMIN_REQUIRED` |
| 拒绝落地 | `auth.server.ts:84-98` | 命中则 `throw APIError.from("FORBIDDEN", { code, message })` |
| 权限语义 | ADR 0019 | API Key 冒充其拥有者 Admin 的内容管理权限，**唯一例外是不能创建/吊销 API Key** |

### 4.5 认证入口的额外防护

`src/lib/http/handle-auth-request.ts` 是所有 `/api/auth/*` 的入口：

| 路径 | 防护 |
| :--- | :--- |
| `/api/auth/sign-in/email`、`/sign-up/email`、`/request-password-reset`、`/send-verification-email` | Turnstile 校验（`enforceTurnstile`）+ IP 级 5 次/分 + 10 次/小时 |
| 其他 POST | IP 级 5 次/分 |
| 所有请求 | 最后交给 `auth.handler(request)` |

`TURNSTILE_SECRET_KEY` 未配置时 `enforceTurnstile` 直接返回 `null`（放行），是「可选能力」的设计。`src/lib/turnstile.ts` 是校验实现，`src/components/common/turnstile.tsx` 是前端 widget + 全局 token 存储（`window.__turnstileToken`）。

### 可复用要点

- 把"第一个用户是管理员"放在 `databaseHooks.user.create.before` 里，而不是初始化脚本里，部署后无需额外操作。
- API Key 用 `enableSessionForAPIKeys: true` 复用同一条 session 读取路径，服务端代码不必分叉。
- 把「API Key 不能管理 API Key」做成纯函数（`inspectApiKeyManagementAccess`），可以脱离 HTTP 单独测试（`api-key-guard.test.ts`）。

### 踩坑点

- `apikey` 表的插件默认值 `rate_limit_enabled = 1`、`rate_limit_max = 10` **仍在库里**，但插件配置里 `rateLimit: { enabled: false }` 把它整体关掉了（ADR 0019 说默认配额对 AI 工具调用太紧）。读表会看到自相矛盾的默认值。
- `requireEmailVerification: true` 意味着**邮箱服务没配好时新用户无法登录**。`.dev.vars.example` 注明本地 `ENVIRONMENT=dev` 时验证链接只打印到控制台。
- `sessionQuery` 在 SSR 与浏览器走两条不同实现（一个读请求头、一个读 cookie 存储）；新增依赖 session 的路由时，`beforeLoad` 里要用 `context.queryClient.ensureQueryData` 而不是直接调 `authClient`，否则 SSR 阶段拿不到数据。
- admin 路由守卫只在 `src/routes/admin/route.tsx`（父路由）做一次，**子路由不重复鉴权**；真正的安全边界在 `adminProcedure`。路由守卫只是体验层。
- `user.role` 列**没有默认值**，第三方方式（如直连 D1、`scripts/dev-admin-session.ts`）写用户时必须显式写 `role`，否则该用户既非 admin 也无法通过 admin 判定。

---

## 5. API 层

### 5.1 contract 是什么，怎么生成

| 文件 | 角色 |
| :--- | :--- |
| `src/lib/orpc/router.ts` | 15 个 feature 子路由的聚合对象，导出 `AppRouter` 类型 |
| `scripts/generate-orpc-contract.ts` | 读 `router`，写 `minifyContractRouter(router)` 的 JSON |
| `src/lib/orpc/contract.generated.json` | 1143 行、**生成物**，只含 `~orpc.errorMap` / `meta` / `route`（method、path、summary、tags），不含 schema |
| `src/lib/orpc/contract.ts` | `export const contract = generatedContract as unknown as AppRouter;`（4 行） |

关键分叉：**浏览器端只用 `contract` 作为类型与路由表**（`OpenAPILink(contract, {...})` 需要知道 path），**服务端用真实 `router`**。合约 JSON 里没有 schema，说明浏览器端不做输入校验——校验发生在服务端 procedure 的 `.input()`。

`orpc:contract` 脚本先跑 `i18n:compile`，是因为 `server/router.ts` 里有的 procedure 用 `m.*()` 作为 summary/description（例如 `src/features/config/server/router.ts:86` 用 `m` 解析上传入参），词条没编译就会 import 失败。

### 5.2 procedure 分层

`src/lib/orpc/procedure.ts`：

| 导出 | 定义 | 语义 |
| :--- | :--- | :--- |
| `publicProcedure` | `os.$context<ApiContext>().errors({...})` | 基线，声明 4 个标准错误：`UNAUTHORIZED`(401)、`FORBIDDEN`(403)、`RATE_LIMITED`(429, data `{retryAfterMs}`)、`TURNSTILE_FAILED`(400, data `{detail}`) |
| `optionalSessionProcedure` | `publicProcedure.use(...)` | 读 session 但允许为 null，塞进 context |
| `authProcedure` | `publicProcedure.use(...)` | 无 session 抛 `UNAUTHORIZED` |
| `adminProcedure` | `authProcedure.use(...)` | `role !== "admin"` 抛 `FORBIDDEN` |
| `withRateLimit(options)` | middleware | key = `${cf-connecting-ip 或 用户 id}:${options.key}`，超限抛 `RATE_LIMITED` |
| `turnstileMiddleware` | middleware | 未配 secret 直接放行；否则要求 `X-Turnstile-Token` |

错误处理有两层：

1. **procedure 级**：`.errors({ CODE: { status, message } })` 声明本路由的领域错误，handler 里用 `errors.CODE()` 抛（例如 `posts/server/router.ts:41-58` 的 7 个 postErrors）。
2. **service 级 Result**：service 返回 `src/lib/errors/error.ts` 的 `ok()` / `err({ reason })`，由 `src/lib/orpc/unwrap-result.ts` 把 `reason` 映射成 procedure 错误。

```ts
// src/lib/orpc/unwrap-result.ts:10-17
const result = await resultPromise;
if (result.error) {
  const thrower = throwers[result.error.reason];
  if (thrower) thrower();
  throw new Error(result.error.reason);
}
```

`src/lib/orpc/error-handler.ts` 是客户端侧的 `handleORPCError`：按 `isDefinedError` 分流到 `defined[code]` 或 `fallback`。

### 5.3 context 构造

```ts
// src/lib/orpc/create-context.ts:5-18
export function createApiContext(headers, env, executionCtx): ApiContext {
  const db = getDb(env);
  return { headers, env, executionCtx, db, auth: getAuth({ db, env }) };
}
```

`ApiContext`（`src/lib/orpc/context.ts`）= `{ headers, env, executionCtx, db, auth }`；`AuthedApiContext` 追加 `session`。`auth` 实例是**每个请求新建**的（`getAuth` 内部读 `serverEnv(env)` 并 `resolveSiteConfig`），不做跨请求缓存。

### 5.4 OpenAPI 暴露

```ts
// src/lib/orpc/openapi-handler.ts:33-37
new OpenAPIReferencePlugin({
  schemaConverters: [schemaConverter],
  docsPath: "/docs",
  specPath: "/spec.json",
  ...
```

| 项 | 位置 | 值 |
| :--- | :--- | :--- |
| Handler | `src/lib/orpc/openapi-handler.ts` | `new OpenAPIHandler(router, { interceptors: [onError(...)], plugins: [...] })` |
| 挂载 | `src/routes/api.$.ts:9-13` | `openAPIHandler.handle(request, { prefix: "/api", context })`，`ANY` 方法 |
| 文档 | 同文件 `:36-37` | `GET /api/docs`、`GET /api/spec.json` |
| 标题 / 版本 | 同文件 `:38-43` | `title: "Flare Stack Blog API"`、`version: __APP_VERSION__`，描述说明 admin 路由需 cookie 或 `x-api-key` |
| 安全方案 | 同文件 `:44-52` | `components.securitySchemes.apiKey`（header `x-api-key`） |
| 类型转换 | 同文件 `:8,30-32` | `ZodToJsonSchemaConverter` + `SmartCoercionPlugin`（URL 上的字符串自动转 number/boolean） |
| 错误日志 | 同文件 `:11-28` | `onError` 打印单行 JSON（message / error{name,message,stack} / timestamp） |

### 5.5 客户端调用方式

| 环境 | 文件 | 实现 |
| :--- | :--- | :--- |
| 浏览器 | `src/lib/orpc/index.ts:11-24` | `new OpenAPILink(contract, { url: \`${origin}/api\`, interceptors: [reviveQueryDates], headers: 注入 X-Turnstile-Token })` + `createORPCClient(link)` |
| SSR | `src/lib/orpc/server-client.ts:7-21` | `createRouterClient(router, { context: () => createApiContext(getRequestHeaders(), ctx.env, ctx.executionCtx) })`——**进程内直调，不过网络** |
| 出口 | `src/lib/orpc/index.ts:26-30` | `orpcClient` 按 `import.meta.env.SSR` 二选一；`orpc = createTanstackQueryUtils(orpcClient)` |
| 查询封装 | 各 feature 的 `queries/index.ts` | 例如 `src/features/posts/queries/index.ts` 暴露 `orpc.posts.list.infiniteOptions(...)` 等 |

日期序列化：HTTP 上日期是 ISO 字符串，`src/integrations/tanstack-query/revive-dates.ts` 按固定键集（`publishedAt`/`updatedAt`/`createdAt`/`pinnedAt`/`registeredAt`）递归还原成 `Date`，并通过 `root-provider.tsx:46-48` 的 `hydrate.deserializeData` 在 SSR 水合时也生效。

### 5.6 一条完整调用链：浏览器发布文章 → D1

以 `POST /api/admin/posts/12/publish` 为例：

| # | 层 | 位置 | 动作 |
| :--- | :--- | :--- | :--- |
| 1 | UI | `src/features/posts/components/post-editor/hooks/use-post-actions.tsx:87-102` | `handlePublish` 先 `await flush()` 强制落盘自动保存，再 `publishMutation.mutate()` |
| 2 | 客户端 | `use-post-actions.tsx:59-60` → `src/lib/orpc/index.ts:11-24` | `orpcClient.posts.admin.publish({ id: 12 })` → `OpenAPILink` 拼出 `POST /api/admin/posts/12/publish`，带 cookie / `x-api-key`、可能带 `X-Turnstile-Token` |
| 3 | Worker 路由 | `src/routes/api.$.ts:8-16` | `ANY` handler 收到请求，`createApiContext(request.headers, context.env, context.executionCtx)` |
| 4 | OpenAPI 层 | `src/lib/orpc/openapi-handler.ts:10` | `OpenAPIHandler` 按 method+path 匹配到 `posts.admin.publish`，`SmartCoercionPlugin` 把路径里的 `12` 转成 number，`.input(PublishPostInputSchema)` 校验 |
| 5 | 守卫 | `src/lib/orpc/procedure.ts:80-88` | `adminProcedure` → `readSession(context)` 走 `auth.api.getSession` → 无 session 401 / 非 admin 403 |
| 6 | DO RPC | `src/features/posts/server/router.ts:272-273` → `src/lib/do/post-publisher-binding.ts` | `(await getPostPublisher(12)).publish(12)`，即 `exports.PostPublisher.getByName("post:12")`，**阻塞式 RPC**，同名请求被 DO 串行化 |
| 7 | 业务 | `src/features/posts/services/posts.service.ts:491-573` | `publishPost`：补 `publishedAt` → 校验未来日期 → 查 `publicSlugExists`（占用则 409 `PUBLIC_SLUG_TAKEN`）→ 归一化内容 → `createPublishRevision`（SHA-256 相同则跳过）→ `highlightSnapshotContent`（服务端 Shiki）→ `buildPublicSnapshot` → `writePublicSnapshot` → `syncPostMedia` |
| 8 | DB | `src/features/posts/data/posts.data.ts`（Drizzle） | `UPDATE posts SET public_snapshot_json = ?, public_slug = ?, status = ?` |
| 9 | 搜索 | `posts.service.ts:557-565` → `src/features/search/service/search.service.ts:90-96` | `SearchService.upsert` 写 `search_documents`（触发器同步 FTS），并 bump `search_index_meta.version` |
| 10 | 缓存 | `posts.service.ts:567-570` → `src/features/cache/public-cache.ts:281-287` | 若 slug 变了先 `invalidate.postDeleted(旧 slug)`，再 `invalidate.postPublished(新 slug)`：删 KV 键 / bump `ver:` 代际 → `purgeWorkersCache` → `ctx.exports.App.purgeCache({ tags })` → Workers Cache 按 `Cache-Tag` 清理 |
| 11 | 返回 | `src/lib/orpc/unwrap-result.ts` | Result → 成功返回 `{ success: true }`；失败按 `PUBLISHED_AT_IN_FUTURE` / `PUBLIC_SLUG_TAKEN` / `POST_NOT_FOUND` 映射为 400/409/404 |

### 可复用要点

- 「合约 JSON 只含路由元数据、类型靠 `as unknown as AppRouter` 断言」是一套低成本方案：客户端拿到类型与 URL，服务端保留真实校验。
- service 返回 `Result` 而非抛异常，把「领域失败」与「程序错误」分开；`unwrapResult` 是唯一适配点。
- SSR 走 `createRouterClient` 直调 router，省掉一次 fetch，也让 SSR 阶段的鉴权与浏览器完全同源。

### 踩坑点

- `contract.generated.json` 是生成物但**进了 git**；改任何 `.route({ path })` 都必须重跑 `bun run orpc:contract`，否则类型与运行时路径不一致。`typecheck` / `check` / `build` 都把这一步放在最前面。
- `src/lib/orpc/router.ts:1-5` 有一组**副作用 import**（`config.cache`、`friend-links.cache`、`posts.cache`、`categories.cache`、`tags.cache`）。这是为了触发 `defineEntry` 的注册副作用；删掉会让缓存条目在 invalidation 时找不到，静默失效。
- `withRateLimit` 的 identifier 优先用 `cf-connecting-ip`，缺失时退到用户 id，再退到字符串 `"unknown"`（`procedure.ts:93-96`）。本地/无该头环境下所有匿名请求共享一个桶。
- `turnstileMiddleware` 在未配置 `TURNSTILE_SECRET_KEY` 时**无条件放行**（`procedure.ts:114`），生产误删该机密等于关掉验证码。
- OpenAPI 的 `docsPath` / `specPath` 挂在 `/api` 前缀下，即实际路径是 `/api/docs` 与 `/api/spec.json`；`.agents/skills/flare-stack-blog/SKILL.md:32` 让 agent 直接 GET `{url}/api/spec.json`。
- `onError` interceptor 只写 `console.error`，不改变响应；排错要靠 `observability.enabled` 的日志。

---

## 6. 路由结构

### 6.1 全量路由表

`src/routeTree.gen.ts` 是 TanStack Router 生成物（首行注释 "You should NOT make any changes in this file"），并在 `oxlint`/`oxfmt`/`fallow` 三处被忽略。

#### 布局与惰性段（`_` 前缀）

| 文件 | 路由 ID | 语义 | 关键行为 |
| :--- | :--- | :--- | :--- |
| `src/routes/__root.tsx` | `__root__` | 根 | `beforeLoad` 用 `ensureQueryData(siteConfigQuery)` 预取站点配置；`head` 输出 charset/viewport/title/description/icons/manifest/RSS-Atom-JSONFeed alternate；`shellComponent: RootDocument` 设 `<html lang={getLocale()}>` 并注入主题 CSS 变量；devtools 用 `createIsomorphicFn().client(...).server(placeholder)` 隔离 |
| `src/routes/_public/route.tsx` | `/_public` | 公开站布局（**无 URL 段**） | `headers()` 返回 `CACHE_CONTROL.public`；`head` 按 `VITE_UMAMI_WEBSITE_ID` 决定是否注入 `/stats.js`；`component` 里挂 navbar/toaster + Cmd/Ctrl+K 跳搜索 |
| `src/routes/_public/_auth/route.tsx` | `/_public/_auth` | 认证页布局 | 已登录且非 `verify-email` → `redirect "/"`；`headers()` 返回 private |
| `src/routes/_public/_user/route.tsx` | `/_public/_user` | 用户页布局 | 只取 session 传给 `UserLayout isAuthenticated`，**不重定向**；private 头 |
| `src/routes/admin/route.tsx` | `/admin` | 后台布局 | **管理员鉴权唯一入口**（见 6.3） |
| `src/routes/admin/posts/route.tsx` | `/admin/posts` | 只做标题，无 UI | `loader` 返回 `title`，供父布局取页面标题 |
| `src/routes/admin/posts/edit.$id/route.tsx` | `/admin/posts/edit/$id` | 编辑器外壳 | |
| `src/routes/admin/settings/route.tsx` | `/admin/settings` | 设置外壳，**`ssr: false`** | 设置页全部只在浏览器渲染 |

#### 公开页

| 文件 | URL | 说明 |
| :--- | :--- | :--- |
| `src/routes/_public/index.tsx` | `/` | `validateSearch` 限 `page ∈ [1, 1000000]`；loading 阶段页码越界用 `redirect` 纠正；并行预取 home / domain / popular |
| `src/routes/_public/posts.tsx` | `/posts` | 列表（支持 tag/category/uncategorized 筛选） |
| `src/routes/_public/post/$slug.tsx` | `/post/$slug` | 详情。`validateSearch: { comment?: number }`（ADR 0015：评论链接用 query 定位）；`head` 按内容是否含数学/代码块动态追加 katex.css / jetbrains-mono.css；输出 Article JSON-LD |
| `src/routes/_public/friend-links.tsx` | `/friend-links` | 友链墙 |
| `src/routes/_public/search.tsx` | `/search` | 搜索页，`?q=`，输入 300ms 防抖 |
| `src/routes/_public/unsubscribe.tsx` | `/unsubscribe` | 退订确认，**`ssr: false`**、private 头 |
| `src/routes/_public/_auth/login.tsx` | `/login` | |
| `src/routes/_public/_auth/register.tsx` | `/register` | |
| `src/routes/_public/_auth/forgot-password.tsx` | `/forgot-password` | |
| `src/routes/_public/_auth/reset-link.tsx` | `/reset-link` | |
| `src/routes/_public/_auth/verify-email.tsx` | `/verify-email` | 唯一允许登录态访问的 auth 页 |
| `src/routes/_public/_user/profile.tsx` | `/profile` | |
| `src/routes/_public/_user/submit-friend-link.tsx` | `/submit-friend-link` | |

#### 后台页

| 文件 | URL |
| :--- | :--- |
| `src/routes/admin/index.tsx` | `/admin/` |
| `src/routes/admin/posts/index.tsx` | `/admin/posts/` |
| `src/routes/admin/posts/edit.$id/index.tsx` | `/admin/posts/edit/$id/` |
| `src/routes/admin/posts/edit.$id/history.tsx` | `/admin/posts/edit/$id/history` |
| `src/routes/admin/posts/edit.$id/history_.$revisionId.tsx` | `/admin/posts/edit/$id/history/$revisionId`（文件名里的 `history_` 下划线是 TanStack 的**脱离父级布局**语法） |
| `src/routes/admin/friend-links/index.tsx` | `/admin/friend-links/` |
| `src/routes/admin/media/index.tsx` | `/admin/media/` |
| `src/routes/admin/settings/index.tsx` | `/admin/settings/` |
| `src/routes/admin/settings/site.tsx` | `/admin/settings/site` |
| `src/routes/admin/settings/notifications.tsx` | `/admin/settings/notifications` |
| `src/routes/admin/settings/api-keys.tsx` | `/admin/settings/api-keys` |
| `src/routes/admin/settings/muted-users.tsx` | `/admin/settings/muted-users` |
| `src/routes/admin/settings/maintenance.tsx` | `/admin/settings/maintenance` |

#### 通配（`$`）

| 文件 | URL | 行为 |
| :--- | :--- | :--- |
| `src/routes/_public/$.tsx` | `/_public/$` | `loader` 直接 `throw notFound()`，`headers()` 用 `CACHE_CONTROL.notFound`（CDN 只缓存 10s） |
| `src/routes/admin/$.tsx` | `/admin/$` | 同上，但**不设** notFound 缓存头（继承 admin 的 private） |

#### 服务端资源路由（`server.handlers`，无组件）

| 文件 | URL | 方法 | 来源 |
| :--- | :--- | :--- | :--- |
| `src/routes/api.$.ts` | `/api/**` | ANY | `openAPIHandler` |
| `src/routes/api.auth.ts` + `api.auth.$.ts` | `/api/auth`、`/api/auth/**` | ANY | `handleAuthRequest` |
| `src/routes/api.send.ts` | `/api/send` | ANY | 反向代理到 `UMAMI_SRC/api/send`；未配置返回 404 |
| `src/routes/images.$.ts` | `/images/**` | GET | R2 原图或 Image Resizing |
| `src/routes/stats[.]js.ts` | `/stats.js` | GET | 代理 Umami `script.js`，缓存 1h + swr 1d |
| `src/routes/rss[.]xml.ts` | `/rss.xml` | GET/HEAD | `buildRssXml` |
| `src/routes/atom[.]xml.ts` | `/atom.xml` | GET/HEAD | `buildAtomXml` |
| `src/routes/feed[.]json.ts` | `/feed.json` | GET/HEAD | `buildFeedJson` |
| `src/routes/sitemap[.]xml.ts` | `/sitemap.xml` | GET/HEAD | `buildSitemapXml` |
| `src/routes/robots[.]txt.ts` | `/robots.txt` | GET/HEAD | `buildRobotsTxt` |
| `src/routes/site[.]webmanifest.ts` | `/site.webmanifest` | GET/HEAD | `buildWebManifest` |

文件名里的 `[.]` 是 TanStack 的**转义点号**语法：`rss[.]xml.ts` → 路由 `/rss.xml`（否则会被解析成 `/rss/xml`）。

### 6.2 SSR 与客户端导航边界

| 机制 | 位置 | 行为 |
| :--- | :--- | :--- |
| 预加载 | `src/router.tsx:17` | `defaultPreload: "intent"` |
| SSR 与 Query 水合 | `src/router.tsx:37-40` | `setupRouterSsrQueryIntegration({ router, queryClient })` |
| 首屏不回顶 | `src/router.tsx:32-35` | `router._scroll.n = false`，注释原文解释：首次水合不算客户端导航，保留 `n=true` 会在 SSR HTML 已上屏后 `scrollTo(0)`，把已滚动的读者拽回顶部 |
| 滚动恢复例外 | `src/router.tsx:29` | `scrollRestoration: ({ location }) => !isAdminWorkspace(location.pathname)`，admin 工作区各自管理内层滚动容器 |
| 过渡动画 | `src/router.tsx:27` | `defaultViewTransition: false`，改用自定义 `PageFade`（`src/components/layout/page-fade.tsx`） |
| 错误 / 404 兜底 | `src/router.tsx:25-26` | `defaultNotFoundComponent: NotFound`、`defaultErrorComponent: ErrorPage` |
| 关闭整页 SSR | `src/routes/admin/settings/route.tsx:19`、`src/routes/_public/unsubscribe.tsx:20` | `ssr: false` |
| 缓存策略 | 各路由 `headers()` | `_public` 用 `CACHE_CONTROL.public`；admin / auth / user 用 `private`；`_public/$` 用 `notFound` |
| 二次覆盖 | `src/server.ts:43` | `applyWorkersCachePolicy(request, response)` 在 Start 之后按 **pathname** 再定一次策略（见 §8.4） |

### 6.3 admin 鉴权在哪一层

三层，各司其职：

1. **路由层（唯一入口）**：`src/routes/admin/route.tsx:30-41` 的 `beforeLoad`。SSR 阶段 `context.queryClient.ensureQueryData(sessionQuery)` 走 `getRequestSession()`（读请求头）、浏览器阶段走 `authClient.getSession()`。任一失败或非 admin 就 `redirect`。子路由**不重复**鉴权。
2. **接口层（真正的边界）**：`src/lib/orpc/procedure.ts:80-88` 的 `adminProcedure`，所有 `/api/admin/**` 与写操作都过它。
3. **插件层（特殊规则）**：`src/lib/auth/api-key-guard.ts` + `auth.server.ts:74-98`，处理「API Key 不得管理 API Key」这条路由守卫与 procedure 都覆盖不到的规则。

### 可复用要点

- 用 `_public` / `_auth` / `_user` 三个下划线布局段切分「同一 URL 树下的不同框架」，不污染 URL。
- 服务端资源路由（feed/sitemap/robots/images）放在同一文件路由树里，`server.handlers` 天然无客户端 JS。
- 页面标题用「子路由 loader 返回 `title`，父布局从 `useMatches()` 反向找最近的非空 title」的模式（`src/routes/admin/route.tsx:58-65`）。

### 踩坑点

- `src/router.tsx:35` 的 `router._scroll.n = false` 是对 TanStack Router 内部字段的**直接写入**，注释承认这是绕过水合后强制回顶的 workaround。升级 router 时这一行最先需要复查。
- `_public/$` 的 notFound 只用 10 秒 CDN 缓存（`CACHE_CONTROL.notFound`），而它的 `headers()` 与 `src/server.ts` 的 `applyWorkersCachePolicy` 会给同一响应打两遍 Cache-Control（后者按 pathname 判为 `private`），最终以后者为准——404 页实际不会被 CDN 缓存。
- `history_.$revisionId.tsx` 的下划线只在**文件名**里生效，很容易在读目录时被误认成笔误。
- `src/routes/api.auth.ts` 与 `api.auth.$.ts` 是两个几乎相同的文件，都是为了 `/api/auth` 与 `/api/auth/*` 两种形态都能命中，删任何一个都会漏一半路径。
- `robots.txt` 里手写了一批 `Disallow`（`src/features/site-documents/service/site-documents.service.ts:146-158`），新增私有页面（例如未来的草稿预览路径）必须同步改这里，没有从路由表自动派生。

---

## 7. feature 分层

### 7.1 目录约定

`src/features/<name>/` 下出现的稳定角色：

| 角色 | 路径模式 | 职责 | 是否必须 |
| :--- | :--- | :--- | :--- |
| 组件 | `components/**` | React 组件 + 同目录 `.css`；复杂功能再套一层子目录（`post-manager/`、`media-library/`、`friend-link-manager/`） | 视功能 |
| 数据访问 | `data/*.data.ts` | 只写 D1 查询（Drizzle），返回 db 行或聚合结果，不做业务判断 | 有持久化时 |
| 数据辅助 | `data/helper.ts` | 拼 where / order by 子句（`src/features/posts/data/helper.ts`） | 可选 |
| 缓存条目 | `<name>.cache.ts` | `defineEntry(...)` 声明公开缓存（`posts.cache.ts`、`config.cache.ts`、`tags.cache.ts`、`categories.cache.ts`、`friend-links.cache.ts`） | 可选 |
| 查询封装 | `queries/index.ts` | 把 `orpc.*` 包成 React Query options | 前端要拉数据时 |
| hooks | `hooks/**` | 表单状态、mutation、DOM 交互 | 可选 |
| 服务 | `service/*.service.ts` 或 `services/*.service.ts` | 业务编排：校验、跨 repo 调用、事务顺序、失效触发 | 有业务逻辑时 |
| schema | `<name>.schema.ts`，或 `schema/*.schema.ts` | zod 输入输出 schema + `drizzle-zod` 派生 + 类型导出 | 有 API 时 |
| API 路由 | `server/router.ts` | oRPC procedure 定义（路径、方法、输入、输出、错误、handler） | 有 API 时 |
| 领域纯函数 | `<name>.ts`、`utils/**` | 无副作用的规则（`muted-users.ts`、`comment-thread.ts`、`writing-calendar.ts`） | 可选 |
| 测试 | `<name>.test.ts` / `*.integration.test.ts` | 就近放置 | |

两种服务目录拼写**并存**：`src/features/posts/services/`（复数）、`src/features/comments/service/`… 实际是 `src/features/comments/comments.service.ts`（根级文件）。看目录不能靠猜，见 7.4。

### 7.2 样本一：posts

| 文件 | 职责 |
| :--- | :--- |
| `src/features/posts/schema/posts.schema.ts` | 全部 zod：`PostItemSchema` / `PostWithTocSchema` / `AdminPostSchema` / `PostListResponseSchema` / `GetPostsInputSchema` / `UpdatePostInputSchema` / `VideoMetaSchema` 等；用 `createSelectSchema` / `createUpdateSchema` 从表派生 |
| `src/features/posts/schema/json-content.schema.ts` | 手写递归 `JsonContentSchema`（Tiptap 文档），带 `superRefine` 禁止 text 节点带 content |
| `src/features/posts/schema/post-revisions.schema.ts` | 修订相关输入输出 |
| `src/features/posts/data/posts.data.ts`（659 行） | 全部 posts/tags/categories 的 Drizzle 查询：`insertPost`、`getPosts`、`getPostsCursor`、`getHomePosts`、`findPostBySlug`、`writePublicSnapshot`、`clearPublicSnapshot`、`publicSlugExists`、`findReusableEmptyDraft`、`getPublishedPostsForSitemapBatch` 等 |
| `src/features/posts/data/helper.ts` | `buildPostWhereClause` / `buildPostOrderByClause`；含 `adminPostTextColumns`：当 `taxonomy.scope === "public"` 时，title/summary/slug 一律改读 `public_snapshot_json` 的 `json_extract` |
| `src/features/posts/data/post-media.data.ts` | `syncPostMedia`（用 `db.batch`）、`pointDraftImagesAt`、`isMediaInUse`、`getPostsByMediaKey` |
| `src/features/posts/data/post-revisions.data.ts` | 修订的增查删 |
| `src/features/posts/services/posts.service.ts`（595 行） | 业务核心：`createDraft` / `createEmptyPost` / `updatePost` / `deletePost` / `publishPost` / `unpublishPost` / `generateSlug` / `findPostById` / `listAdminPostsPage`；slug 冲突重试策略也在这里 |
| `src/features/posts/services/post-revisions.service.ts` | 修订快照校验、恢复、批量删除 |
| `src/features/posts/services/video-meta.service.ts` | 抓 B 站 / YouTube 的标题封面时长 |
| `src/features/posts/posts.cache.ts` | 5 个公开缓存条目：`homePosts` / `pinnedPosts` / `popularPosts` / `postsList` / `postBySlug` |
| `src/features/posts/public-snapshot.ts` | 快照 ↔ 公开模型转换：`mapSnapshotToPublicPost`、`toPublicCover`、`toIsoOrNull` |
| `src/features/posts/server/router.ts`（396 行） | 20 个 procedure |
| `src/features/posts/queries/index.ts` | 9 个 React Query 封装 |
| `src/features/posts/utils/*.ts` | 14 个纯函数模块：`content.ts`（slugify / convertToPlainText / estimateReadTimeMinutes）、`toc.ts`、`sync.ts`（内容 hash）、`highlight-code-blocks.ts`、`normalize-content.ts`、`video-source.ts`、`date.ts`、`feed.ts`、`is-post-body-empty.ts`、`post-public-search.ts`、`post-tag-filter.ts`、`open-public-post.ts`、`cached-public-post.ts`、`format-public-post-date.ts` |
| `src/features/posts/components/**` | pages（`home-page` / `posts-page` / `post-page` + 各自 skeleton）、`post-card`、`post-meta`、`table-of-contents`、`post-editor/**`、`post-manager/**`、`archive/**`、`content/**`（渲染） |
| `src/features/posts/editor/**` | Tiptap 扩展与 schema（见 §10） |

posts 的 oRPC 路由命名（`server/router.ts` 的 `route({ path })`）：

| procedure | 方法 + 路径 |
| :--- | :--- |
| `list` | GET `/posts` |
| `home` | GET `/posts/home/page` |
| `bySlug` | GET `/posts/{slug}` |
| `adjacent` | GET `/posts/{slug}/adjacent` |
| `pinned` | GET `/posts/pinned` |
| `popular` | GET `/posts/popular` |
| `admin.list` | GET `/admin/posts` |
| `admin.get` | GET `/admin/posts/{id}` |
| `admin.generateSlug` | GET `/admin/posts/slug` |
| `admin.videoMeta` | GET `/admin/posts/video-meta` |
| `admin.create` | POST `/admin/posts` |
| `admin.update` | PATCH `/admin/posts/{id}` |
| `admin.remove` | DELETE `/admin/posts/{id}` |
| `admin.publish` | POST `/admin/posts/{id}/publish` |
| `admin.unpublish` | POST `/admin/posts/{id}/unpublish` |
| `admin.revisions.list` | GET `/admin/posts/{postId}/revisions` |
| `admin.revisions.get` | GET `/admin/posts/{postId}/revisions/{revisionId}` |
| `admin.revisions.restore` | POST `/admin/posts/{postId}/revisions/{revisionId}/restore` |
| `admin.revisions.remove` | DELETE `/admin/posts/{postId}/revisions` |

### 7.3 样本二：comments

| 文件 | 职责 |
| :--- | :--- |
| `src/features/comments/comments.schema.ts` | `CommentSelectSchema`（**`.omit({ handledAt: true })`**，Admin-only 字段不外泄）、`CommentWithUserSchema`、`RootCommentWithReplyCountSchema`、`GetRootCommentsResponseSchema`、`CreateCommentInputSchema`（`content: z.string().trim().min(1)`）等 |
| `src/features/comments/data/comments.data.ts`（386 行） | 查询：`getRootCommentsByPostId`、`getRepliesByRootId`、`getPublishedReplyCountsByRootIds`、`getReplyPreviewsByRootIds`、`updateComment`、`setCommentHandledAt`、`markCommentHandledOnce`；含 `visibleRootCondition`（用 `alias` + `exists` 实现「根已删但有存活回复时仍可见」，ADR 0014） |
| `src/features/comments/data/helper.ts` | 评论 where 子句 |
| `src/features/comments/comments.service.ts`（341 行） | 业务：`getRootCommentsByPostId`（并行取列表/总数/viewerMuted）、`createComment`（校验帖子已发布 → 校验禁言 → 校验 root/replyTo 关系链 → 插入 → Admin 回复自动标记 handled → 发通知）、`deleteComment`（软删）、`markCommentHandled` / `unmarkCommentHandled` / `markAllUnrepliedCommentsHandled`、`getMyComments` |
| `src/features/comments/workflows/helpers.ts` | `sendReplyNotification`：判定是否该通知（无 replyTo / 无邮箱 / 自回复 / 版主就是被回复人四种跳过），生成退订 token 与评论链接，交给 `publishNotificationEvent`。**目录名叫 workflows，但它是普通模块，不是 Cloudflare Workflow** |
| `src/features/comments/comment-thread.ts` / `comment-url.ts` / `comment-body.ts` | 领域纯函数：分页常量、公开评论 URL、纯文本处理 |
| `src/features/comments/server/router.ts`（246 行） | 9 个 procedure，见下表 |
| `src/features/comments/queries/index.ts` | 3 个 infinite/query 封装 |
| `src/features/comments/hooks/**` | `use-comment-composer`、`use-comments`、`use-scroll-to-comment` |
| `src/features/comments/components/**` | `comment-section`、`comment-item`、`comment-list`、`comment-editor`、`comment-avatar`、`comment-reveal`、`expandable-content`、`comment-confirmation-modal` + `comments.css` |

| procedure | 守卫 + 路径 |
| :--- | :--- |
| `roots` | `optionalSessionProcedure` GET `/posts/{postId}/comments` |
| `replies` | `optionalSessionProcedure` GET `/posts/{postId}/comments/{rootId}/replies` |
| `thread` | `optionalSessionProcedure` GET `/posts/{postId}/comments/{id}/thread` |
| `create` | `authProcedure` + `withRateLimit({ capacity: 10, interval: "1m", key: "comments:create" })` + `turnstileMiddleware`，POST `/posts/{postId}/comments` |
| `remove` | `authProcedure` + 限流，DELETE `/comments/{id}` |
| `mine` | `authProcedure` GET `/me/comments` |
| `admin.markHandled` | `adminProcedure` PUT `/admin/comments/{id}/handled` |
| `admin.unmarkHandled` | `adminProcedure` DELETE `/admin/comments/{id}/handled` |
| `admin.markAllHandled` | `adminProcedure` POST `/admin/comments/handled` |

### 7.4 zod schema 放哪 / server function 怎么写

| 问题 | 答案 |
| :--- | :--- |
| zod schema 放哪 | 两种：扁平式 `<feature>/<name>.schema.ts`（comments、tags、categories、friend-links、muted-users、media、dashboard、version、webhook、post-popularity、email、config 有多份），以及子目录式 `<feature>/schema/*.ts`（只有 posts 用）。没有全局 `schemas/` 目录 |
| 与表的关系 | 用 `drizzle-zod` 的 `createSelectSchema` / `createUpdateSchema` 从表派生，再 `.omit()` / `.extend()`。派生后必须手工处理日期（`src/features/posts/schema/posts.schema.ts:10` 的 `coercedDate`，因为 HTTP 上日期是字符串） |
| server function 怎么写 | **不用 `createServerFn`**，ADR `0006-orpc-openapi-on-tanstack-start.md` 明写 "Hono and `createServerFn` are removed"。所有服务端调用都是 `server/router.ts` 里的 oRPC procedure；`src/routes/**` 里只有 6 个文件用 `server.handlers`，它们都是非 JSON 协议（图片、feed、robots、umami 代理） |
| 分层顺序 | `router.ts` 只做 route 元数据 + input/output + 错误映射 → `service` 做业务 → `data` 做 SQL。router 里不写业务逻辑，service 里不写 Drizzle |

一个典型 procedure（`src/features/posts/server/router.ts:244-259`）：

```ts
const remove = adminProcedure
  .errors(postErrors)
  .route({ method: "DELETE", path: "/admin/posts/{id}", summary: "Delete a post", tags: ["Admin Posts"] })
  .input(DeletePostInputSchema)
  .handler(({ context, input, errors }) =>
    unwrapResult(PostService.deletePost(context, input), {
      POST_NOT_FOUND: () => { throw errors.POST_NOT_FOUND(); },
    }),
  );
```

### 可复用要点

- `data` / `service` / `server` / `queries` / `hooks` / `components` 六段式，单 feature 内自洽，feature 间只通过 service 或 schema 互相引用。
- 表派生 zod + 显式 `.strict()` 的更新 schema，一次堵住"客户端伪造 id/createdAt/status"这类漏洞。
- 缓存条目（`*.cache.ts`）与服务层分开，缓存策略可见、可单测。

### 踩坑点

- `PostUpdateSchema` 刻意 `.strict()` 并 omit 了 `status` / `id` / `createdAt` / `updatedAt`，注释原文：不 omit 的话客户端 PATCH `{ status: "published" }` 会拿到 200 但文章仍是草稿；用 `.strict()` 是为了直接报错而不是静默丢弃（`posts.schema.ts:40-63`）。
- `PostItemSchema` 里 `category: PublicCategorySchema.nullable().catch(null)`（`:72`）——`catch(null)` 会把格式不符的分类静默降级为 `null`，坏数据不会报错，只会消失。同文件的 `cover` 也一样（`:75`）。
- slug 生成的并发竞态有专门处理：`insertDraftWithGeneratedSlug` 最多重试 5 次，前 2 次重算派生后缀，之后改随机后缀（`posts.service.ts:244-274`），注释直说"a whole batch racing at once keeps re-deriving the same next suffix"。这是真实压测出来的补丁。
- `utils` 里同名概念分散在 `content.ts` / `normalize-content.ts` / `is-post-body-empty.ts` 三处，读代码时要先确认归一化发生在哪一层（`updatePost` 和 `publishPost` 各调一次 `normalizePostContent`）。
- `features/comments/workflows/` 只有 `helpers.ts`。按目录名找 Cloudflare Workflow 会白跑一趟。

---

## 8. 内容模型与"公开快照"机制

### 8.1 两个内容面的定义

| 面 | 存储 | 读取者 |
| :--- | :--- | :--- |
| admin 内容库 | `posts.content_json`（可编辑 Tiptap 文档）+ `posts.title/summary/slug/status/published_at/pinned_at/cover_media_id` | 后台编辑器、自动保存、修订 |
| public 展示库 | `posts.public_snapshot_json`（`PublicPostSnapshot`）+ `posts.public_slug` | 公开列表、详情、RSS/Atom/JSON Feed、sitemap、搜索索引、公开缓存 |

判定：**`public_snapshot_json IS NULL` 即草稿**。`posts.data.ts:66` 的 `buildPostWhereClause` 里 `publicOnly` 与 `taxonomy.scope === "public"` 都翻译成 `public_snapshot_json IS NOT NULL`。代码里没有第二处 status 判断。

### 8.2 相关 ADR 的要点

| ADR | 决定 |
| :--- | :--- |
| `0002-separate-public-content-snapshots.md` | 公开内容与可编辑内容分离；代价是同步与失效工作量 |
| `0008-publish-replaces-public-snapshot.md` | publish 用 Admin 正在编辑的 Post **整体替换**快照；autosave 不动快照；发布不生成摘要；下线丢弃快照；draft/published 是动作结果而非可切换字段；无定时发布；发布时间取首次发布的服务器时间且不能是未来；发布时另存修订，恢复修订前再存一次；autosave 不建修订；发布幂等；**没有自动快照队列，也没有 post-process workflow** |
| `0013-comments-require-public-snapshot.md` | 只有存在公开快照的 Post 才能建评论；下线不删评论，评论随文章一起下架、再上线时回来 |
| `0022-category-is-not-a-tag.md` | Category 是至多一个的独占分组；早期 schema 里 `posts.category` 是必填 text，随 Tags 一起在 `0001` 被删 |
| `0020-post-cover-is-optional-media.md` | 封面必须是 Media（非远程 URL、非正文首图）；发布写入快照，autosave 不写；无 og:image 兜底 |

### 8.3 publish 流程（`src/features/posts/services/posts.service.ts:491-573`）

| 步 | 动作 | 细节 |
| :--- | :--- | :--- |
| 1 | 取 Post | `PostRepo.findPostById`，不存在 → `POST_NOT_FOUND` |
| 2 | 补发布时间 | 无 `publishedAt` 就写 `new Date()`；已有但**在未来** → `PUBLISHED_AT_IN_FUTURE`（`src/features/posts/utils/date.ts` 的 `isFuturePublishDate`） |
| 3 | 查公开 slug 冲突 | `publicSlugExists(slug, { excludeId })` → `PUBLIC_SLUG_TAKEN`(409) |
| 4 | 归一化正文 | `normalizePostContent` |
| 5 | 建修订 | `createPublishRevision`：算 SHA-256（`utils/sync.ts`），与最近一条 `reason: "publish"` 的 `snapshotHash` 相同就跳过 |
| 6 | 服务端代码高亮 | `highlightSnapshotContent(contentJson, 旧快照.contentJson)`：先复用旧快照里已有的 `highlightedHtml`（`applyCodeBlockHighlighting`），只对缺失的调 Shiki |
| 7 | 组装快照 | `buildPublicSnapshot`：title / summary / slug / content / `tagIds`（去重排序）/ `categoryId` / `publishedAt`(ISO) / `pinnedAt` / `cover`（查 `coverMediaId` → Media 行，缺失为 null） |
| 8 | 写库 | `writePublicSnapshot` 更新 `public_snapshot_json` + `public_slug`（+ status） |
| 9 | 同步媒体引用 | `syncPostMedia` |
| 10 | 更新搜索索引 | `SearchService.upsert({ id, slug, title, summary, contentJson: 快照内容, tags, category })` |
| 11 | 失效缓存 | slug 变了先 `invalidate.postDeleted(旧)`，再 `invalidate.postPublished(新)` |

`unpublishPost`（`:575-594`）反向：取 publicSlug（`publicSlug ?? 快照.slug ?? slug`）→ `clearPublicSnapshot` → `syncPostMedia` → `SearchService.deleteIndex` → `invalidate.postDeleted`。

### 8.4 缓存失效：KV 公开缓存 + Workers Cache

两套缓存，一次失效动作同时处理。`src/features/cache/` 结构：

| 文件 | 作用 |
| :--- | :--- |
| `public-cache.ts` | KV 读模型的 `defineEntry` 注册表 + 读写 + `invalidate.*` 出口 |
| `kv-store.ts` | 通用 KV 读写（`get`/`put`/`remove`/`remember`），全部 `catch` 后打日志不抛错 |
| `serialize.ts` | `CacheKey` → `"posts:list:tech:1"` 形式（数组 join `:`，null/undefined → `_`） |
| `types.ts` | `CacheKey`、`PublicCacheReason`（7 种）、`PublicCacheReadContext` |
| `workers-cache.ts` | Workers Cache 的 `purge` 封装与 `purgeWorkersCache`（经 `ctx.exports.App`） |
| `workers-cache-policy.ts` | pathname → `{cache: "private"}` 或 `{cache: "public", tags}`；`workersCacheKey`；`purgeOptionsFor` |
| `server/router.ts` | 唯一的 `POST /admin/cache/invalidate`（`invalidate.all`） |

**KV 缓存的两级键**（`public-cache.ts:57-122`）：有 `namespace` 的条目键为 `ver:<namespace>:<logicalKey>`。`readGeneration` 读 `env.KV.get("ver:"+ns)`，缺失按 `"v0"`；`bumpGeneration` 写一个 `crypto.randomUUID()`。所以「换整个命名空间」只需一次 put，「删单个条目」用 `isAddressable` 判断（`address` 声明哪些参数能唯一定位，例如 `posts.detail` 的 `address: ["slug"]`）。

`features/posts/posts.cache.ts` 的 5 个条目：

| 条目 | namespace | key | TTL | invalidatedBy |
| :--- | :--- | :--- | :--- | :--- |
| `posts.home` | `posts:home` | `["posts","home",page]` | 7d | post.published / deleted / tag.changed / category.changed |
| `posts.pinned` | `posts:pinned` | `["posts","pinned"]` | 7d | 同上 |
| `posts.popular` | `posts:popular` | `["posts","popular",snapshotVersion,limit]` | 7d | 同上 + `post-popularity.updated` |
| `posts.list` | `posts:list` | `["posts","list",limit,cursor,tagName,categoryName]`，`address: ["limit","cursor"]` | 7d | 同上 |
| `posts.detail` | `posts:detail` | `["post",slug]`，`address: ["slug"]` | 7d | 同上 |

**Workers Cache 策略**（`workers-cache-policy.ts:68-109`）：

| pathname | 策略 | Cache-Tag |
| :--- | :--- | :--- |
| `/`、`/posts`、`/atom.xml`、`/rss.xml`、`/feed.json`、`/sitemap.xml` | public | `html,posts` |
| `/friend-links` | public | `html,friend-links` |
| `/search`、`/robots.txt`、`/site.webmanifest` | public | `html` |
| `/stats.js`、`/images/**` | public | 无 tag（不可定向清理） |
| `/post/{slug}` | public | `html,posts,post:<slug>` |
| 其他 | private | 清空 Cache-Tag |

`purgeOptionsFor(reason, params)` 把失效原因翻译成清理目标：`site-config.changed` → `["html"]`；`friend-links.changed` → `["friend-links"]`；`tag.changed` / `category.changed` → `["posts", ...post:<slug>]`；带 slug 的发布/删除 → `["posts","post:<slug>"]`；`all` → `{ purgeEverything: true }`。

`workersCacheKey`（`:36-66`）对三类路径做了键归一化，把无意义的查询参数剔掉：`/` 只保留 `page`（且 `page=1` 视同无）；`/posts` 只保留 `tagName`/`categoryName`/`uncategorized`；`/images/**` 只保留 `original`/`quality`/`width`/`height`/`fit`/`v`。这样 `?utm_source=x` 之类不会造成缓存击穿。

### 8.5 修订与回滚

`post_revisions` 的三条写入路径（`POST_REVISION_REASONS = ["auto","publish","restore_backup"]`）：

| 动作 | 位置 | 说明 |
| :--- | :--- | :--- |
| publish | `posts.service.ts:103-147` | hash 相同则跳过写入，避免"重复发布产生噪声修订" |
| 恢复前备份 | `services/post-revisions.service.ts` | 恢复另一条修订前，先把当前编辑态存成修订，防止未发布修改丢失（ADR 0008） |
| `auto` | 枚举里存在但**代码里没有写入方**（grep 全仓仅 `posts.table.ts` 的枚举声明与 `ADR 0008` 的"Autosave does not create a Post Revision"） | autosave 不建修订 |

### 可复用要点

- 用「一个可空 JSON 列的存在性」表达发布状态，比 `status` + 快照两处判断少一类不一致。
- 两级键（代际号 + 逻辑键）让"清整个命名空间"退化成一次 KV put，不需要列举键。
- 服务端高亮 + 快照复用（`applyCodeBlockHighlighting`）把"重复发布"的 CPU 成本降到只处理变化的代码块。

### 踩坑点

- **快照里的 `tagIds` / `categoryId` 是历史值**：`posts.table.ts:28` 注释原文 "Historical metadata; live Category/Tag assignments use the relations below"。公开页面读的是当前关系（`hydratePublicPosts` 现查 `with: { category, postTags }`），所以改分类/标签**不需要重新发布**（ADR 0008）。任何新代码如果去读快照里的 `tagIds` 会拿到过期数据。
- 代码高亮的"复用"有前置条件：只有 `highlightedHtml` 非空才跳过（`highlight-code-blocks.ts:12-18`）。旧快照里存的是纯文本 HTML（`plainCodeHtml`）时，语言一旦变成受支持的就重新高亮（ADR 0024）。
- `invalidate.postPublished` 的 purge 失败会**抛错并使整个 publish 失败**（`workers-cache.ts:19-27` 的 `assertPurge`）。这是刻意设计（ADR 0009 "a failed purge fails the mutation"），但意味着 Workers Cache 的瞬时故障会挡住发布，Admin 需要重试（发布是幂等的）。
- 快照里的 `publishedAt` / `pinnedAt` 是 **ISO 字符串**，而表列是 integer 秒；Drizzle 查询里用 `json_extract(public_snapshot_json, '$.publishedAt')` 排序（`posts.data.ts:41-42`、`utils/feed.ts:44-48`），这是 JSON 字符串排序，格式不统一就会错序。
- 编辑器的"公开快照正文预览"字段叫 `publicSnapshotContentJson`，在 `AdminPostSchema` 里与 `contentJson` 并列（`posts.schema.ts:114`），并带描述说明"不是草稿"。它是最容易被误当成写入字段的坑（`.agents/skills/flare-stack-blog/SKILL.md:65` 也专门提醒）。

---

## 9. 异步与后台任务

### 9.1 总表

| 机制 | 实现 | 解决什么 | 怎么触发 |
| :--- | :--- | :--- | :--- |
| Durable Object `PostPublisher` | `src/lib/do/post-publisher.ts` | **同一篇文章的发布/下线串行化**，避免并发写快照产生交错 | `adminProcedure` handler 内 `(await getPostPublisher(id)).publish(id)`，阻塞式 RPC |
| Durable Object `RateLimiter` | `src/lib/do/rate-limiter.ts` | 令牌桶限流，替代 KV 计数（KV 无原子自增） | `getRateLimiter(name).checkLimit({...})`，见 §9.3 |
| Cloudflare Queue | `src/lib/queue/queue.handler.ts` + `queue.schema.ts` | 邮件与 Webhook 投递的**重试与解耦**，接口响应零阻塞 | 生产者 `env.QUEUE.send(...)`；消费者 `export default { queue }` |
| Cron `15 0 * * *` | `src/server.ts:66-73` | 每日同步 Umami 文章热度快照 | Cloudflare 定时触发 |
| Cloudflare Workflows | **未使用** | — | ADR 0004 原文 "Cloudflare Workflows are not used" |
| `features/comments/workflows/` | `helpers.ts` | 只是回复通知的编排函数，不是 Workflow | 由 `createComment` 直接 `await` |

### 9.2 PostPublisher：为什么用 DO

`src/lib/do/post-publisher.ts` 全文 21 行，只做三件事：

```ts
export class PostPublisher extends DurableObject {
  async publish(postId: number) {
    return PostService.publishPost(this.serviceContext(), { id: postId });
  }
  async unpublish(postId: number) { /* 同构 */ }
  private serviceContext() {
    return { env: this.env, db: getDb(this.env), executionCtx: this.ctx as unknown as ExecutionContext };
  }
}
```

命名规则是 `post:<id>`（`post-publisher-binding.ts:4`），所以不同文章的发布并行、同一篇文章串行。ADR 0004 的原文把职责列清楚了：DO 内完成 写修订 → 高亮代码块 → 替换公开快照 → 更新搜索索引 → 更新公开缓存，且**整个序列幂等**，任何一步失败 Admin 再发一次即可。

一个实现细节值得注意：`serviceContext()` 把 `this.ctx` 强转成 `ExecutionContext`，因为 service 层签名要求 `{ env, db, executionCtx }`（用于 `waitUntil` 与缓存 purge），而 DO 的 `ctx` 类型是 `DurableObjectState`。

### 9.3 RateLimiter：令牌桶

`src/lib/do/rate-limiter.ts` 是**自定义令牌桶**，不用平台内置限流：

| 参数 | 值 / 来源 |
| :--- | :--- |
| 状态 | `{ tokens, lastRefill }` 存在 DO sqlite 的键 `"bucket"` |
| 构造 | `ctx.blockConcurrencyWhile` 里读一次，保证首请求前状态就绪 |
| 算法 | `rate = capacity / ms(interval)`；`currentTokens = min(capacity, tokens + elapsed * rate)`；够则扣减并 `waitUntil(storage.put + setAlarm)` |
| `cost > capacity` | 直接拒绝且 `retryAfterMs: -1`（不可能满足） |
| 清理 | `CLEANUP_INTERVAL = 7d`；`alarm()` 里若 7 天没活动就 `deleteAlarm + deleteAll`，否则续期 |
| 返回值 | `{ allowed, remaining, retryAfterMs }` |

调用点：

| 调用点 | 位置 | 容量 / 窗口 |
| :--- | :--- | :--- |
| 注册按邮箱 | `src/lib/auth/auth.server.ts:24-35` | 3 / 1h |
| 找回密码按邮箱 | `auth.server.ts:104-107` | 3 / 1h |
| 验证邮件按邮箱 | `auth.server.ts:129-132` | 3 / 1h |
| auth 入口按 IP | `src/lib/http/handle-auth-request.ts:24-44` | 5 / 1m，敏感路径再加 10 / 1h |
| oRPC 评论创建 | `src/features/comments/server/router.ts:104` | 10 / 1m |
| oRPC 评论删除 | 同文件 `:147` | 10 / 1m |

DO 实例名：`${identifier}:${scope}`，identifier 是邮箱（`email-signup:<邮箱>`）、IP（`<cf-connecting-ip>:<key>`）或用户 id（`procedure.ts:93-96`）。

### 9.4 Queue：消息模型与消费

`src/lib/queue/queue.schema.ts` 是一个 `discriminatedUnion("type", [...])`：

| 消息 | 字段 |
| :--- | :--- |
| `EMAIL` | `{ to, subject, html, headers?, idempotencyKey?, unsubscribe?{userId,type} }` |
| `WEBHOOK` | `webhookEndpointSchema.shape` 展开 + `event: notificationEventSchema` |

注释特别标注 `// Messages queued before providers carry only url and secret.`——为兼容旧消息保留了"只有 url + secret"的形态。

`src/lib/queue/queue.handler.ts` 的批处理逻辑：

1. `queueMessageSchema.safeParse(message.body)`，失败 → `console.error` 单行 JSON + **`message.ack()`**（不重试坏消息，避免毒丸）。
2. 按 `type` 分派：`EMAIL` → `handleEmailMessage`（带上 `message.id` 作为 `idempotencyKey`）；`WEBHOOK` → `handleWebhookMessage`。
3. `default: event satisfies never` —— 用 TS 穷尽性检查让新增消息类型必须处理。
4. 成功 `ack()`；抛错则 `console.error` + `message.retry()`。

`cloudflare.config.ts:50-56` 配 `maxBatchSize: 10`、`maxBatchTimeout: 5`、`maxRetries: 3`。测试模式（`ctx.mode === "test"`）**不注册消费者**，注释原文："Tests only produce to the queue; a consumer would race their assertions."——这样集成测试里 `QUEUE.send` 被 mock，断言不会被真实消费者干扰（`tests/test-utils.ts:114-121` 把 `env.QUEUE.send` 替换成 resolved promise）。

生产者两处：

| 位置 | 消息 |
| :--- | :--- |
| `src/lib/auth/auth.server.ts:118-125`、`:143-150` | 重置密码邮件、验证邮件 |
| `src/features/notification/service/notification.publisher.ts:63-66`、`:77-80` | 通知邮件、Webhook |

Webhook 的投递细节在 `src/features/webhook/api/webhook.consumer.ts`：`buildWebhookRequest(endpoint, content, rawBody)` 按 provider 生成请求，`fetch` 带 10 秒 `AbortSignal.timeout`，失败时把响应体前 1000 字符带进错误消息（便于在 Queue 重试日志里定位）。9 个 provider 的 secret 需求用一张表声明：`SECRET_USE = { generic: "required", telegram: "required", custom: "optional", 其余 "none" }`（`webhook.providers.ts:37-47`），ADR 0029 说明了"secret 不跟着 Admin 换频道"的设计。

### 9.5 Cron：每日热度同步

`src/server.ts:66-73` → `postPopularityService.sync`（`src/features/post-popularity/service/post-popularity.service.ts:129-198`）：

| 步 | 动作 |
| :--- | :--- |
| 1 | 算窗口 `getPostPopularityWindow(now)`（前 30 个完整 UTC 日） |
| 2 | 读上一次的 `status` 记录 |
| 3 | 并行取 Umami 的 path metrics + 当前公开文章列表 |
| 4 | `buildPostPopularitySnapshot` 写 KV |
| 5 | `invalidate.postPopularityUpdated`（KV 条目 + Workers Cache） |
| 6 | 写 `status`（lastAttemptAt / lastSuccessAt / window） |
| 7 | 失败：写 `lastError`，返回 `err({ reason: "SYNC_FAILED" })`，`server.ts` 抛错让 Cron 标记失败 |

这个 service 用**依赖注入**构造（`createPostPopularityService(dependencies)`），13 个依赖项都是函数（`now` / `resolveConfig` / `getPathMetrics` / …），所以能脱离 Cloudflare 单测（`post-popularity.service.test.ts`）。读侧 `getPopular` 会在快照缺失或超过 `POST_POPULARITY_MAX_AGE_MS`（7 天）时返回空数组，ADR 0016 说明首页此时退回置顶 + 最新。

### 可复用要点

- 「高频写用 DO，需要重试用 Queue，定时用 Cron」的分工清晰；发布这种需要串行且必须立刻知道结果的动作放在 DO 而不是 Queue。
- Queue 消费者的「坏消息 ack、暂时失败 retry」是最省心的一组默认行为。
- 服务用依赖注入构造，让可测性不依赖平台。

### 踩坑点

- `RateLimiter` 的令牌桶状态**存在内存里**（`this.state`）并异步落盘（`waitUntil`）。DO 被驱逐后重新读盘是对的，但同一实例上"落盘还没完成就再来一个请求"时读的是内存值——这是设计意图，但意味着**不能把 `this.state` 当成已持久化**。
- `alarm()` 的清理条件是 `now - lastRefill > 7d`，而不是"7 天没请求"。桶空置后 `lastRefill` 只在被拒绝时**不更新**（`checkLimit` 只在放行时写 `lastRefill`），长期被限流的桶同样会被清掉，效果上没问题，但读代码时容易误判。
- `queue.handler.ts:11-22` 对解析失败的消息直接 `ack()`，等于**静默丢弃**。schema 变更（例如给 `WEBHOOK` 消息加必填字段）会让存量在途消息被丢掉，只能靠日志发现。
- `maxRetries: 3` 与 `console.error` 的日志都是单行 JSON，没有 `level` 字段的分支（只有 `notification.publisher.ts` 带 `level: "info"`），日志聚合时要按是否存在 `level` 分别处理。
- 测试环境**不注册 Queue 消费者**（`cloudflare.config.ts:47-56`），所以 `bun test` 永远测不到 `handleQueueBatch` 的真实投递；相关覆盖只在 `src/features/infra.integration.test.ts` 这类直接调用 handler 的测试里。
- `DELETE /admin/comments/handled` 与 `POST /admin/comments/handled` 是两个不同语义（取消标记 / 全部标记），路径相同方法不同，读 OpenAPI 时要看清 method。

---

## 10. 编辑器与渲染

### 10.1 Tiptap 扩展清单

`src/features/posts/editor/schema.ts` 的 `createSchemaExtensions()` 是**共享 schema 工厂**，编辑器与只读渲染（修订查看、公开发布后的正文预览）都用它，参数化点有四个：`codeBlock` / `image` / `mathematics` / `video`。

| 扩展 | 类型 | 说明 |
| :--- | :--- | :--- |
| `StarterKit.configure({ heading: false, codeBlock: false, blockquote: false, code: {...}, link: { autolink: true, openOnClick: false, target: "_blank" } })` | 基座 | 关掉四个会被自定义版本替换的 |
| `HeadingExtension` | 自定义（`extensions/typography/heading.tsx`） | `levels: [2,3,4]`，正文无 h1 |
| `BlockQuoteExtension` | 自定义 | |
| `schemaCodeBlock` / `CodeBlockExtension` | `extensions/code-block/` | 追加属性 `highlightedHtml`（`rendered: false`，不进 DOM） |
| `schemaInlineMath` / `schemaBlockMath` / `MathEditing` | 内联 Node / `extensions/math-editing/` | 属性 `latex`，HTML 上映射为 `data-latex` + `data-type="inline-math" \| "block-math"` |
| `TableBlockExtension` | 数组（`extensions/table/`） | 表格 + 列宽 + 列对齐 + 单元格选择 + 全宽拖拽 |
| `schemaImage` / `ImageExtension` | `extensions/images/` | 追加 `uploadId`（`rendered: false`） |
| `schemaVideo` / `VideoEditing` | 自定义 Node | 属性 `provider` / `videoId` / `page` / `start` / `title` / `cover` / `duration`，存 provider+id 而非 iframe 源码 |

`src/features/posts/editor/config.ts` 在此之上追加编辑器专属扩展（不进只读渲染）：

| 扩展 | 作用 |
| :--- | :--- |
| `Placeholder` | 空文档占位文案（走 i18n） |
| `ImageUpload` | `onUpload: handleImageUpload` → `orpcClient.media.upload({ image: file })`；`onError` 弹 toast |
| `ImagePlaceholder` | 上传中的占位块 |
| `FileHandler` | 拖放/粘贴图片，`allowedMimeTypes` 五个：png/jpeg/jpg/gif/webp |
| `SlashMenu` | `/` 命令菜单（`extensions/slash-menu/items.ts`） |
| `LinkEditing` | 链接编辑 |
| `MarkdownPaste` | 粘贴 Markdown 转文档 |

### 10.2 Markdown 双向转换

用的是 `@tiptap/markdown`（`package.json` 依赖 `"@tiptap/markdown": "^3.31.4"`），入口在 `extensions/markdown-paste/parse-markdown.ts`：

| 处理 | 位置 | 说明 |
| :--- | :--- | :--- |
| 独立 `Marked` 实例 | `parse-markdown.ts:127-139` | 注释原文："An own instance keeps the tokenizers off the shared `marked` singleton"；同时禁掉了脚注定义 `def`，让 `[^1]: note` 保留为文本而不是被吞掉 |
| 行内数学 tokenizer | `:24-38` | `$$` 在段落中不当数学（防止第二个 `$` 开启行内公式） |
| 块级数学 tokenizer | `:40-54` | 只有行首的 `$$` 才开块 |
| 任务列表标记 | `:60-86` | 编辑器没有任务列表，`- [ ] item` 把标记降级为文本 |
| front matter | `:17` | 解析前用正则剥掉 `---` 包裹的头部 |
| 标题层级 | `:14-15`、`:232-247` | 全部内容按最小标题级别整体平移，再夹紧到 2–4 |
| 图片 | `:152-160`、`:188-218` | 远端 URL 保留为图片块；本地路径降级成 `![alt](path)` 文本，并统计 `localImageCount` 用于 toast 提示 |
| 触发条件 | `:284-316` | 有文件、在代码块内、纯文本粘贴时**不**走这条路径；VS Code 粘贴（`vscode-editor-data`）只在 markdown/plaintext 模式启用 |

`parsePastedMarkdown(markdown)` 的返回是 `{ content: JSONContent[], localImageCount: number }`，上游只消费这两个字段。

### 10.3 Shiki 代码高亮

`src/lib/shiki.ts`：

| 项 | 值 |
| :--- | :--- |
| 引擎 | `createHighlighterCore` + `createJavaScriptRegexEngine()`（不依赖 WASM） |
| 主题 | `vitesse-light` / `vitesse-dark`，其中 dark 被**改过背景**：`bg: "#18181b"`，注释原文 "Customizing the background color of vitesse-dark to remove the greenish tint ... to match the dark mode UI" |
| 语言加载 | `createHighlighterCore({ langs: [] })` 起步，按需 `loadLanguage`（模块级单例 `highlighterPromise`） |
| 输出 | `codeToHtml(code, { lang, themes: { dark, light } })`，双主题同出 |
| 兜底 | 高亮异常时 `console.warn` + `plainCodeHtml(code)` |

语言清单集中在 `src/lib/code-languages.ts`：**59 个语言**（含 `mermaid`），每个 `{ id, label, aliases, load }`，`load` 是动态 `import("shiki/langs/x.mjs")`。注释说明这是"单一来源"：publish 期高亮、编辑器语言选择器、公开页面代码块角标都读它，且"Importing this module loads no grammar"。别名表由 `byName` Map 构建，`resolveCodeLanguage(name)` 支持大小写与别名（`ts`、`bash`、`ps1`、`yml`…）。常量 `PLAIN_TEXT = "text"`，别名 `txt` / `plaintext`；`MERMAID = "mermaid"`。

高亮发生在**服务端**（`src/features/posts/utils/highlight-code-blocks.ts` → `src/lib/shiki.ts`），结果 HTML 存进快照的 `attrs.highlightedHtml`。ADR 0008 原文："Visitors do not highlight on the client."

### 10.4 数学（KaTeX）

| 环节 | 位置 |
| :--- | :--- |
| 依赖 | `katex`（`package.json`）+ `@tiptap/extension-mathematics` |
| schema | `src/features/posts/editor/schema.ts:34-85` 的 `inlineMath` / `blockMath` 两个 atom Node，属性 `latex` |
| 编辑态 | `editor/extensions/math-editing/`（`index.ts`、`math-editor-panel.tsx`、`state.ts`、`syntax.ts`） |
| 渲染态 | `src/features/posts/components/content/math-content.tsx`（懒加载）+ `runner`/`render-math.tsx` |
| CSS 加载 | `src/routes/_public/post/$slug.tsx:54-56`：只有内容里出现 `inlineMath`/`blockMath` 才把 `katex/dist/katex.min.css` 加进 `head.links` |
| 判定 | `jsonContentHasType(content, ["inlineMath","blockMath"])`（`src/features/posts/utils/content.ts:36-53`），递归遍历 JSON |

`ContentRenderer`（`components/content/content-renderer.tsx`）在含数学时**整体切到 `MathContent` 懒加载路径**（`useMemo` 里 `if (!content || hasMath) return null`），不混用两条渲染路径。

### 10.5 Mermaid 为什么在浏览器渲染（ADR 0027）

ADR `0027-mermaid-renders-in-the-visitor-browser.md` 的核心论证链：

1. Mermaid 是 `language: "mermaid"` 的代码块，快照里存的是 Shiki 高亮后的源码。
2. **不能**在 publish 期预渲染 SVG：Mermaid 需要 DOM，而 Worker 与 PostPublisher DO 都没有 DOM；且"用 API Key 发布的文章没有浏览器参与"。
3. 所以快照保留源码作为 RSS / JSON Feed / 搜索索引 / 无 JS 读者的兜底，只有含 Mermaid 的文章才加载 Mermaid。
4. Mermaid 只能在客户端路径导入（effect + SSR 检查），因为 "the Worker is one module and any dynamic import reachable from server code would be inlined into it"。
5. `securityLevel: "strict"`，颜色取自 Fuwari tokens，主题变化时重渲染。

实现落点：

| 文件 | 作用 |
| :--- | :--- |
| `src/features/posts/components/content/render.tsx:23-24,84-108` | `lazy(() => import("./mermaid-code-block"))`，只在 `isMermaidLanguage(attrs.language)` 为真时渲染，`Suspense fallback` 是高亮源码块 |
| `src/components/content/mermaid-render.ts:7-9` | `const loadMermaid = import.meta.env.SSR ? null : () => import("mermaid").then(m => m.default)` —— **SSR 构建里把它替换成 `null`**，从根上保证 Mermaid 不进 Worker bundle |
| `src/components/content/mermaid-render.ts:13-62` | 全局渲染队列（Mermaid 只有一个全局 config，必须串行）、离屏测量宿主（避免滚动条闪动与布局横跳）、`securityLevel: "strict"` |
| `src/components/content/mermaid-diagram.tsx` | 组件层：pending / rendered / failed 三态；失败时保留源码并显示错误；`showAtNaturalWidth` 覆盖 Mermaid 默认的 `width:100%`，改为固定自然宽度 + 容器横向滚动 |
| `src/components/content/mermaid-theme.ts` | 从 Fuwari tokens 抽主题变量 |

### 10.6 静态渲染（`@tiptap/static-renderer`）用在哪

**用在公开文章正文与修订查看的 SSR 渲染**。`src/features/posts/components/content/render.tsx`：

```ts
// render.tsx:2,33-36
import { renderToReactElement } from "@tiptap/static-renderer/pm/react";
...
renderToReactElement({
  extensions: schemaExtensions,          // 与编辑器同一套 schema
  content: withUniqueHeadingIds(content),
  options: { nodeMapping: { ... } },
});
```

`nodeMapping` 覆盖了 11 种节点：`heading`（夹紧层级 + 注入锚点 `#` 链接）、`video`、`image`、`codeBlock`（含 Mermaid 分支）、`table` / `tableCell` / `tableHeader`（列宽按比例，ADR 0028）、`inlineMath` / `blockMath`。表格用 `tableColumnLayout(node)` 把存储的像素宽度换算成百分比 + `table-layout: fixed`，外层再包 `fuwari-table-scroll`。

这套渲染是**纯函数 → React 元素**，所以能在 SSR 与客户端水合两侧跑出同一结果。`schemaExtensions`（不带编辑器扩展）而不是 `extensions`（带 SlashMenu、FileHandler 等）被传给渲染器——这是编辑器能与公开渲染共享 schema、又不把编辑器依赖打进公开页的关键。

### 可复用要点

- 用 `createSchemaExtensions(overrides)` 让编辑器与只读渲染共享一套 Node/Mark，只在需要处注入可交互版本。
- 按内容特征（是否含数学 / 代码块 / Mermaid）**动态决定要不要加载对应 CSS / JS**，把首屏体积压到内容相关。
- 服务端渲染高亮 HTML 存快照，读者端零高亮成本。

### 踩坑点

- Mermaid 的 SSR 隔离靠 `import.meta.env.SSR ? null : () => import("mermaid")`（`mermaid-render.ts:7-9`）。ADR 0027 明确警告：任何**从服务端代码可达**的动态 import 都会被 inline 进 Worker bundle。也就是说这条 `SSR ? null` 一旦被去掉，Worker 体积会暴涨。
- ADR 0024 规定：编辑器在**光标位于代码块内时不高亮**，静止时才展示快照里的 Shiki HTML；超过约 **500 行或 50k 字符**的块在编辑器里保持纯文本（发布时仍高亮）。这是一条只在代码注释/ADR 里、不在 UI 上的限制。
- `parse-markdown.ts:146` 注释解释为什么每次都要自建 `Marked` 实例：共享单例会让自定义 tokenizer 污染其他使用者。改这里时不要图省事复用全局 `marked`。
- ADR 0028 记录了一次真实的返工：早期用 Tiptap 的像素 `colwidth` 直接渲染，在约 975px 的编辑器里拖出来的表格会在更窄的公开文章列里裁切，因此 `f7ca4003` 曾把列宽功能整个关掉。现在改成"存像素、显示比例"，且"改列宽是与右侧列**交换**宽度而不是把表格撑宽"。
- `math-content.tsx` 与 `mermaid-code-block.tsx` 都是懒加载，`ContentRenderer` 的 fallback 是空 `div`（数学）与源码块（Mermaid）。数学未加载完成时页面会出现空区间，这是有意的（避免布局跳动）。
- 编辑器 schema 里 `highlightedHtml` 与 `uploadId` 都标了 `rendered: false`，它们的 HTML 属性名是**驼峰**（Drizzle/Tiptap 默认），与项目其他 `data-*` 属性风格不一致，写选择器时容易踩空。

---

## 11. 搜索 / SEO / 订阅

### 11.1 搜索：D1 FTS（ADR 0023）

ADR `0023-search-index-in-d1-fts.md` 的原因写得具体：原来的 Orama 方案每次 upsert 都要 `save` + JSON + gzip 把整个索引持久化到 KV，**打爆 Workers Free 的 10ms CPU 预算**。现方案是"一篇已发布文章一行 D1 + 一个 FTS5 虚表"。

| 环节 | 位置 | 说明 |
| :--- | :--- | :--- |
| 建表与触发器 | `migrations/0019_search_fts.sql` | `search_documents_fts` 是 `content='search_documents'` 的 external-content 虚表，`content_rowid='post_id'`，`tokenize='unicode61'`；三个触发器保持同步 |
| schema | `src/lib/db/schema/search.table.ts` | `SearchDocumentsTable` / `SearchIndexMetaTable` |
| 分词 | `src/features/search/tokenize.ts` | `new Intl.Segmenter("zh-CN", { granularity: "word" })`；`tokenizeForSearch` 取 `isWordLike` 的段、转小写、用空格拼接（**中文分词靠 Segmenter，不是 FTS 自带的分词器**） |
| FTS 查询构造 | 同文件 `:13-21` | 分词后每个 token 用双引号包裹（并转义内部 `"`）拼成隐式 AND 的 MATCH 串；空查询返回 `null` |
| SQL 孤岛 | `src/features/search/data/search.data.ts:67-98` | 唯一一处裸 SQL：`SELECT ... FROM search_documents_fts JOIN search_documents d ON d.post_id = search_documents_fts.rowid WHERE search_documents_fts MATCH ? ORDER BY rank LIMIT ?`。注释（ADR 0023）解释：Drizzle 没有一等 FTS API，所以 MATCH "stays in a small SQL island behind SearchService" |
| 索引写入 | `src/features/search/service/search.service.ts:90-96` | publish 时 `upsert`；单篇只写一行 |
| 版本号 | `src/features/search/data/search.data.ts:109-118` | 每次写/删都 `bumpSearchIndexVersion`（值 = `Date.now().toString()`），`search_index_meta` 单行 |
| 客户端缓存键 | `src/routes/_public/search.tsx:62-72` | `searchDocsQueryOptions(term, metaQuery.data?.version)`，`staleTime: Infinity`——**用版本号当缓存键，索引变了旧结果自然失效** |
| 重建 | `POST /api/admin/search/rebuild`（`search/server/router.ts:24-31`）→ `rebuildIndex` | 删除全部行后按 10 行一批重插（`INSERT_BATCH = 10`），返回 `{ indexed, duration }` 并打日志 |
| 切片上限 | `src/features/search/search.constants.ts` | `CONTENT_SLICE = 10000`、`SNIPPET_SLICE = 200`、`SNIPPET_CONTEXT = 60`、`SCAN_LIMIT`、`FUZZY_MAX_DISTANCE = 1`（后两个常量当前无引用：FTS 没有 Orama 那种模糊排序，ADR 0023 已承认） |

索引文档的组成（`search.service.ts:21-48`）：`content` = 分类名 + 正文纯文本（截断到 10000 字符）；`summary` 为空时取 `content` 前 200 字符；`tokens` = `tokenizeForSearch(title, summary, content, category, ...tags)`。搜索结果里的 `score` 恒为 `0`（`:69`），排序完全靠 FTS 的 `rank`。

### 11.2 SEO

`src/lib/seo.ts` 全文 90 行，三个出口：

| 函数 | 输出 |
| :--- | :--- |
| `buildCanonicalUrl(domain, pathname, searchParams?)` | `https://<domain><归一化路径>`，路径去尾斜杠（`/` 除外），查询参数过滤空值 |
| `canonicalLink(href)` | `{ rel: "canonical", href }`，用于路由 `head.links` |
| `buildArticleJsonLd({ authorName, canonicalHref, post })` | `JSON.stringify` 的 `schema.org/Article`，含 `headline` / `url` / `mainEntityOfPage` / `author` / `dateModified`，可选 `description` / `datePublished` / `keywords`（来自 tags）/ `image` |

使用点：`src/routes/_public/post/$slug.tsx:39-43,82-97`（canonical + og:* + twitter:card + JSON-LD 脚本）、`src/routes/_public/index.tsx:42-56`（首页 canonical + 背景图 preload）。

`src/routes/__root.tsx:47-115` 是所有页面的 head 基线：charset / viewport / title / description / 六个图标 / manifest / 三种 feed 的 `alternate` / 样式表。

### 11.3 订阅与站点文档

统一由 `src/features/site-documents/service/site-documents.service.ts` 产出，每条路由是薄壳（`server.handlers` 的 GET 直接调函数，HEAD 返回 `null` body —— 用 HEAD 拿 HEAD 语义但省掉重复计算）。

| 资源 | 路由文件 | 构建函数 | 数据来源 | Cache-Control |
| :--- | :--- | :--- | :--- | :--- |
| `/rss.xml` | `rss[.]xml.ts` | `buildRssXml` → `feed.rss2()` | `buildFeed` | `public, max-age=3600, s-maxage=3600` |
| `/atom.xml` | `atom[.]xml.ts` | `buildAtomXml` → `feed.atom1()` | 同上 | 同上 |
| `/feed.json` | `feed[.]json.ts` | `buildFeedJson` → `feed.json1()` | 同上 | 同上 |
| `/sitemap.xml` | `sitemap[.]xml.ts` | `buildSitemapXml` | `getPublishedPostsForSitemapBatch` 分批 500 | 同上 |
| `/robots.txt` | `robots[.]txt.ts` | `buildRobotsTxt` | 静态文本 + `DOMAIN` | `public, max-age=86400, s-maxage=86400` |
| `/site.webmanifest` | `site[.]webmanifest.ts` | `buildWebManifest` | `ConfigService.getSiteConfig` | `public, max-age=3600, s-maxage=3600` |

`buildFeed`（`src/features/posts/utils/feed.ts`）细节：

- 用 `feed` 包（`package.json` `"feed": "^5.2.1"`）。
- 查询直接读 `posts` 表：`where(isNotNull(publicSnapshotJson))`，按 `json_extract(public_snapshot_json, '$.publishedAt')` 倒序，**`limit(100)`**。
- 条目 `description` 用快照 summary，`content` 用 `convertToPlainText(snapshot.contentJson)`（**纯文本，不是 HTML**）。
- 作者邮箱从站点社交链接里找 `platform === "email"`，剥 `mailto:`、去查询串、`decodeURIComponent`，再用正则校验；不合法就不传邮箱。

`buildSitemapXml` 手写 XML：3 条固定 URL（`/`、`/posts`、`/friend-links`）+ 每个已发布文章一条，`lastmod` 取 `updatedAt ?? publishedAt ?? createdAt`，`changefreq` 分别 daily/weekly/weekly，`priority` 1.0/0.8/0.8/0.7。游标是 `{ publishedAt, id }`，`SITEMAP_BATCH_SIZE = 500`。

`src/lib/http/site-document-response.ts` 是响应包装（设置 Content-Type 与缓存头、按 method 决定 body）。

### 可复用要点

- 搜索索引版本号当下游查询的缓存键，是一种不需要主动失效的缓存策略。
- 站点文档（feed / sitemap / robots / manifest）共用一套 cache-control 常量与一个响应包装，新增文档类型只需加一个 20 行的路由文件。
- JSON-LD 与 canonical 都是纯函数，跟着路由 `head` 走，SSR 直出。

### 踩坑点

- `src/features/search/search.constants.ts` 里的 `SCAN_LIMIT` 与 `FUZZY_MAX_DISTANCE` 是 Orama 时代的残留常量，现在**没有引用**。ADR 0023 已承认"FTS has no Orama-style fuzzy ranking"，读代码时不要以为存在模糊匹配。
- 搜索结果的 `score` 硬编码为 `0`（`search.service.ts:69`），排序信息只在 SQL 的 `ORDER BY rank` 里，客户端拿不到相关度。
- `content` 切片是**前端截断**（`indexed.slice(0, CONTENT_SLICE)`），超过 1 万字符的正文后半段搜不到；这是一个静默的能力上限。
- `tokenizeForSearch` 用空格拼接分词结果存进 `tokens` 列，而 `search_documents_fts` 的 `tokenize='unicode61'` 会再分一次。中文靠 `Intl.Segmenter`（ADR 0023），英文靠 unicode61；混合内容的行为要看两段逻辑叠加。
- feed 条目数硬编码 100（`utils/feed.ts:49`），且 `content` 是纯文本——RSS 阅读器里看不到代码高亮与公式（这正是 ADR 0027 说 Mermaid 源码要对 RSS 可读的原因）。
- `robots.txt` 的 `Disallow` 列表是手写的（见 §6 踩坑点），且 `Cache-Control` 是 24 小时，改了 robots 后 CDN 会继续发旧版一天。
- `PUBLIC_IMAGE_WIDTH`（`media.utils.ts:59-66`）与 `IMAGE_TRANSFORM_WIDTHS = [400, 800, 1600, 2560]`（`:118`）是两处独立的宽度约定，`parseImageTransform` 只接受后者中的值，超出则**原样返回原图**（不报错）。

---

## 12. 工程化

### 12.1 i18n

| 组成 | 位置 | 内容 |
| :--- | :--- | :--- |
| 项目定义 | `project.inlang/settings.json` | `baseLocale: "zh"`，`locales: ["zh","en"]`，两个远程插件（`@inlang/plugin-message-format@4`、`@inlang/plugin-m-function-matcher@2`），`pathPattern: "./messages/{locale}.json"` |
| 词条 | `messages/zh.json`、`messages/en.json` | 各 1120 条，zh 文件 71KB |
| 编译 | `bun paraglide-js compile --project ./project.inlang --outdir ./src/paraglide` | 生成 `m`、`runtime`、`server`；`postinstall` 自动跑 |
| Vite 集成 | `vite.config.ts:26-31` | 策略 `["cookie","preferredLanguage","baseLocale"]`，cookie 名 `LOCALE` |
| SSR 中间件 | `src/server.ts:35-42` | `paraglideMiddleware(request, () => handler.fetch(...))` |
| 类型桥 | `src/lib/i18n.ts` | `Messages = typeof ParaglideMessages.m`、`Locale = typeof locales[number]`，供 zod 工厂函数（如 `parseSiteAssetUploadInput(formData, m)`）使用 |
| 校验脚本 | `scripts/verify-translations.ts` | 只检查"zh 的 key 是否都在 en 里"（缺一个就 `exit 1`）；不检查值的语义 |
| 清理脚本 | `scripts/prune-unused-translations.ts` | `--check` 用于 CI，`--write` 用于本地清理 |
| 忽略 | `.oxlintrc.json` / `.oxfmtrc.json` | 均忽略 `src/paraglide`（生成物） |

`src/lib/auth/auth-errors.ts` 是一个值得注意的设计：它把 better-auth 的错误码（`USER_ALREADY_EXISTS`、`INVALID_PASSWORD`、`SESSION_EXPIRED` 等）与三个自定义码（`RATE_LIMITED`、`TURNSTILE_MISSING_TOKEN`、`TURNSTILE_VERIFICATION_FAILED`）映射成 i18n 文案，并为登录 / 注册 / 忘记密码 / 重置 / 社交登录 / 资料 / 改密 / 登出八个场景各出一个入口函数（差别在于个别码的文案覆盖）。

### 12.2 lint / format

| 工具 | 配置 | 关键点 |
| :--- | :--- | :--- |
| oxlint | `.oxlintrc.json` | `plugins: ["typescript","unicorn","oxc"]`；`categories: { correctness: "error" }`；`typescript/no-explicit-any: "error"`；关掉 `eslint/no-unused-vars`（交给 tsc 的 `noUnusedLocals`）；`options.typeAware: true`；忽略 `src/paraglide`、`src/routeTree.gen.ts`、`.cloudflare/**`、`migrations/**`、`dist/**`；测试文件关掉 `typescript/unbound-method` |
| oxfmt | `.oxfmtrc.json` | 2 空格、`printWidth: 80`、双引号、`semi: true`、`trailingComma: "all"`、`arrowParens: "always"`；忽略 `src/paraglide`、`routeTree.gen.ts`、`.cloudflare`、`migrations/**/*`、`messages/**`、`docs/**`、`**/*.md` |
| 死代码 | `.fallowrc.json` | `entry` 列出 `src/server.ts` 与 `cloudflare.config.ts`（非标准入口）；`dynamicallyLoaded` 列出 `.release-it.ts` 与测试 mock；`usedClassMembers` 声明 `WorkerEntrypoint.fetch`、`DurableObject.{alarm,checkLimit,publish,unpublish,...}` 是外部会调的成员——否则 DO 方法会被判为未使用 |
| git hooks | `.husky/pre-commit`（`bun lint`）、`.husky/pre-push`（`bun typecheck`） | 提交只跑 lint，推送才做完整类型检查 |

TS 侧（`tsconfig.json`）没有开 `noUncheckedIndexedAccess`，但开了 `strict`、`noUnusedLocals`、`noUnusedParameters`、`noFallthroughCasesInSwitch`、`noUncheckedSideEffectImports`；`types: ["vite/client","@cloudflare/vitest-plugin/types"]`；`include` 里显式加了 `.cloudflare/types/index.d.ts`（生成物）。

### 12.3 测试体系

**只有两套 vitest 配置**（任务描述里说的"三个 config"在本检出中不成立）：

| 维度 | `vitest.config.ts`（集成） | `vitest.node.config.ts`（单元） |
| :--- | :--- | :--- |
| `include` | `src/**/*.integration.test.ts` | `src/**/*.test.ts`、`scripts/**/*.test.ts` |
| `exclude` | — | `**/*.integration.test.ts` |
| 环境 | workerd（`cloudflareTest` 插件） | `node` |
| 配置来源 | `experimental.newConfig: { configPath: "./cloudflare.config.ts" }` | 无 |
| 绑定 | `miniflare.bindings` 注入 `TEST_MIGRATIONS`（`readD1Migrations("migrations")`）、`BETTER_AUTH_SECRET`、`BETTER_AUTH_URL`、`GITHUB_CLIENT_ID/SECRET`、`DOMAIN`、`ENVIRONMENT: "test"` | 无 |
| 迁移 | `setupFiles: ["./tests/apply-migrations.ts"]`，用 `cloudflare:test` 的 `applyD1Migrations` | 无 |
| 别名 | `@tanstack/react-start/server-entry` → `tests/mocks/tanstack-start-mock.ts` | 无 |
| 超时 | test / hook / teardown 各 50 秒 | 默认 |
| 其他 | `restoreMocks: true`；`loadEnv("test", cwd, "VITE_")` | — |

`tests/apply-migrations.ts` 有三处讲究：

```ts
vi.mock("@/features/cache/workers-cache", () => ({ purgeWorkersCache: vi.fn(async () => undefined) }));
// Setup files run outside per-test-file storage isolation. Cloudflare's
// applyD1Migrations() only applies migrations that have not already run.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
beforeEach(async () => { await applyD1Migrations(env.DB, env.TEST_MIGRATIONS); ... });
afterEach(async () => { await drainTestExecutionContexts(); await reset(); });
```

- `purgeWorkersCache` 被 mock 掉（Workers Cache 在测试环境不可用）。
- setup 文件**在每文件存储隔离之外**执行，所以迁移要在 `beforeEach` 里再跑一次。
- `drainTestExecutionContexts()` 等所有 `waitUntil` 完成，避免跨用例污染；`reset()` 清 storage。

`tests/test-utils.ts` 提供测试上下文工厂：`createTestContext` / `createAuthTestContext` / `createAdminTestContext`（后者带 `role: "admin"` 的 mock session）、`createMockSession` / `createMockAdminSession`、`createMockExecutionCtx`、`seedUser`，以及 **`seedAdminApiKey(name)`** —— 它真的调 `auth.api.createApiKey` 造一把可用于 `x-api-key` 的钥匙，模拟外部编辑器/agent 调用 Admin API（对应 `src/features/api-keys/api-keys.integration.test.ts`）。

单元测试与集成测试规模对比（`src/` 内 `.test.ts` 约 60 个，`.integration.test.ts` 约 20 个），最大两个是 `posts.integration.test.ts`（52KB）与 `comments.integration.test.ts`（41KB）。

### 12.4 CI（`.github/workflows/ci.yml`）

触发：`pull_request` 到 `main` / `dev`（忽略 `**.md`、`.agent/**`、`.vscode/**`、`.gitignore` 的改动）+ `workflow_dispatch`。单个 job `quality`，Ubuntu，Node 24 + Bun latest，缓存 `~/.bun/install/cache`。实际执行的命令按顺序：

| 步 | 命令 |
| :--- | :--- |
| 安装 | `bun ci` |
| Lint | `bun lint` |
| 编译 i18n | `bun run i18n:compile` |
| 词条检查 | `bun run i18n:verify && bun run i18n:prune-unused --check` |
| 类型检查 | `bun typecheck`（内含 `orpc:contract` 与 `cf workers types`） |
| 构建 | `bun run build` —— 注释原文 "Same command Workers Builds runs to deploy, so a broken build fails here first." |
| Node 测试 | `bun run test:node` |
| 集成测试 | `bun run test` |

注意 CI **不跑** `bun run deploy`，也不跑 `bun check`（`check` 是本地综合命令，CI 把它的步骤拆开以便失败定位）。

### 12.5 release-it

`.release-it.ts`：

| 项 | 值 |
| :--- | :--- |
| git | `commit: true`、`tag: true`、`push: true`，`commitMessage: "chore: release v${version}"` |
| github | `release: true`，`releaseName: "v${version}"`，资产 `tmp/flare-stack-blog-skills-v${version}.zip` |
| `before:init` hooks | `i18n:compile` → `bun check` → `test:node` → `test` → `i18n:verify` → `i18n:prune-unused --check` |
| `before:github:release` | `mkdir -p tmp && git archive --format=zip --prefix=skills/ -o tmp/flare-stack-blog-skills-v${version}.zip HEAD:.agents/skills` |
| changelog | `@release-it/conventional-changelog`，`preset: conventionalcommits`，只列 `feat` / `fix` / `refactor`，`ignoreRecommendedBump: true`（版本号人工定） |

发布产物里带的是 `.agents/skills/` 的 zip —— 即让 AI 客户端操作已部署博客的那套技能（`.agents/skills/flare-stack-blog/SKILL.md` + `scripts/fsb.py` / `tiptap.py`）。

### 12.6 migrations 流程

| 环节 | 命令 / 位置 |
| :--- | :--- |
| 生成 | `bun db:generate`（`drizzle-kit generate`），输出 `./migrations`，schema 入口 `./src/lib/db/schema/index.ts` |
| 远程应用 | `bun db:migrate` = `cf d1 migrations apply "$D1_DATABASE_ID"`；也在 `bun run deploy` 里自动执行 |
| 本地应用 | `bun db:migrate:local` = `cf d1 migrations apply 00000000-0000-4000-8000-000000000000 --local --persist-to .wrangler/state` |
| 测试应用 | `applyD1Migrations(env.DB, env.TEST_MIGRATIONS)`（`tests/apply-migrations.ts`），migrations 由 `readD1Migrations` 在配置阶段读入 |
| drizzle-kit 连接 | `drizzle.config.ts`：`dialect: "sqlite"`、`driver: "d1-http"`，凭证读 `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_DATABASE_ID` / `CLOUDFLARE_D1_TOKEN`（只用于 `db:studio` / `db:push`） |
| 命名 | drizzle-kit 自动命名（`0007_nervous_pepper_potts.sql`），项目内混合手写命名（`0011_publish_public_snapshot.sql`、`0019_search_fts.sql`、`0020_system_config_versions.sql`） |

23 个迁移的语义脉络（从文件与 ADR 交叉得出）：

| 编号 | 文件 | 内容 |
| :--- | :--- | :--- |
| 0000–0010 | `0000_breezy_pretty_boy` … `0010_romantic_roland_deschain` | 初始 schema 与十次演进 |
| 0011 | `0011_publish_public_snapshot` | 加 `public_snapshot_json` / `public_slug` + 唯一索引；把存量 published 文章用 `json_object(...)` 回填快照；**删掉 `public_content_json` 与 `read_time_in_minutes`** |
| 0012 | `0012_drop_comment_moderation` | 移除评论审核态（ADR 0010） |
| 0013 | `0013_comment_body_plain_text` | 评论正文改纯文本（ADR 0011） |
| 0014 | `0014_drop_page_views` | 删浏览计数（改由 Umami 快照承担，ADR 0016） |
| 0015 | `0015_muted_at` | `ALTER TABLE user ADD muted_at integer`（ADR 0017） |
| 0016 | `0016_apikey` | 加 `apikey` 表（ADR 0019） |
| 0017 | `0017_post_cover` | 加文章封面（ADR 0020） |
| 0018 | `0018_category` | 加 `categories` 与 `posts.category_id`（ADR 0022） |
| 0019 | `0019_search_fts` | FTS5 虚表 + 三触发器 + `search_index_meta`（ADR 0023） |
| 0020 | `0020_system_config_versions` | 重建 `system_config`，加 CHECK 与双 revision；先经 `system_config_migration_guard` 拒绝多行脏数据（ADR 0025） |
| 0021 | `0021_friend_link_account_email` | `ALTER TABLE friend_links DROP COLUMN contact_email`（ADR 0026） |
| 0022 | `0022_comment_handled_at` | `ALTER TABLE comments ADD handled_at integer` |

0011 是一条值得细读的迁移：它用一条 `UPDATE ... SET public_snapshot_json = json_object('title', title, ..., 'contentJson', json(COALESCE(public_content_json, content_json, 'null')), 'tagIds', json(COALESCE((SELECT json_group_array(tag_id) FROM post_tags WHERE post_id = posts.id), '[]')), 'publishedAt', strftime('%Y-%m-%dT%H:%M:%S.000Z', COALESCE(published_at, created_at), 'unixepoch'), 'pinnedAt', CASE WHEN pinned_at IS NULL THEN NULL ELSE strftime(...) END) WHERE status = 'published'` 把整个公开快照面**在 SQL 里就地建起来**，然后才删旧列。

### 12.7 其他工程配置

| 文件 | 内容 |
| :--- | :--- |
| `.github/dependabot.yml` | 两条更新（`github-actions` 与 `bun`），都指向 `dev` 分支，每周一 05:00 America/Los_Angeles；分组 11 组（tanstack / tiptap / react / drizzle / ui / **orpc（同进同退）** / better-auth / cloudflare / tooling / typescript）；忽略 `@types/node`、`vitest`、`@vitest/*` 的 major 升级（注释说明 vitest 只能到 4，因为 `@cloudflare/vitest-plugin`） |
| `.cta.json` | Create TanStack App 的模板残留：`packageManager: "pnpm"`、`framework: "react-cra"`、`chosenAddOns: ["start","shadcn","tanstack-query"]`。与当前实际（bun + Start + TanStack Query，无 shadcn）不符 |
| `CONTRIBUTING.md` | 基于 `dev` 分支开发；改文案必须同时改 `messages/zh.json` 与 `en.json` 并跑 `i18n:compile`，删文案后用 `i18n:prune-unused --write`，CI 会拦残留 key；提交信息用 Conventional Commits |
| `AGENTS.md` / `CLAUDE.md` | AGENTS.md 声明 issue 跟踪、triage 标签、单上下文 domain 文档布局，并规定 Cloudflare 操作走 `bunx cf cli search "<task>"`；CLAUDE.md 只有一句"读 AGENTS.md" |
| `GLOSSARY.md` | 205 行的领域词典：术语定义 + `_Avoid_` 禁用词 + 关系清单 + 示例对话 + 歧义标记。`docs/agents/domain.md` 声明的"单上下文 domain 文档"指的就是它 |
| `docs/webhook.md`、`docs/research/umami-post-heat-sync.md` | 专题文档 |
| `.vscode/settings.json`、`.dev.vars.example`、`.env.example` | 本地开发配置与变量说明（含"运行时要全选 Secret 类型"的告警） |
| `.agents/skills/flare-stack-blog/` | 面向 AI 客户端的运维技能：SKILL.md（凭据文件 `~/.config/flare-stack-blog/config.toml`、`x-api-key`、`GET /api/spec.json`、WAF 1010 的处理）+ `scripts/fsb.py`（HTTP 客户端）+ `scripts/tiptap.py`（Markdown ↔ Tiptap JSON） |
| `.claude/skills/run-blog/SKILL.md` | 本地跑博客的技能 |

### 可复用要点

- CI 里跑与部署**完全相同**的构建命令，让构建失败在 PR 阶段暴露。
- 用一份 `createAuthConfig()` 同时喂运行时与 CLI，schema 生成与运行配置不会漂移（`auth-cli.ts`）。
- 把领域词典（GLOSSARY）当作工程资产维护，并在里面写 `_Avoid_` 反例，能压住命名漂移。
- release 资产是"给 AI 用的技能包"，把运维能力随版本一起分发。

### 踩坑点

- `.cta.json` 是模板残留，`packageManager` 写着 `pnpm`，而仓库实际用 bun。以它为准会做出错误判断。
- `scripts/verify-translations.ts` **只做单向检查**（`zh` 的 key 必须在 `en` 里）。en 多出来的 key、值的语义、占位符是否一致都不检查，多出的 key 靠 `prune-unused --check` 覆盖。
- `postinstall` 会跑 `cf workers types`，这意味着**首次 `bun install` 需要能访问 Cloudflare**（或至少 `cf` 能生成类型）。离线环境装依赖会失败在这一步。
- `.husky/pre-commit` 只跑 `bun lint`（oxlint），**不跑格式化**；`.oxfmtrc.json` 忽略了 `messages/**`、`docs/**`、`migrations/**/*`，所以这些目录的格式不受约束。
- `tsconfig.json` 的 `include` 里有 `.cloudflare/types/index.d.ts`，但该文件 gitignored 且只在 `cf workers types` 之后存在。干净克隆上直接跑 `tsc` 会因为缺类型报大量 Cloudflare 相关错误——必须按 `typecheck` 脚本的顺序（先生成类型）。
- CI 的 `paths-ignore` 只忽略 `**.md`、`.agent/**`、`.vscode/**`、`.gitignore`。`.agents/`（复数、放置技能包）**不在忽略列表里**，改技能包会触发完整 CI。
- 三条迁移（0020–0022）是手写 SQL 且未回灌 drizzle meta（见 §3 踩坑点）。`drizzle-kit generate` 之后的 diff 需要人工审。
- `docs/adr/` 里有**两篇编号 0002**（`0002-cloudflare-config-ts.md` 与 `0002-separate-public-content-snapshots.md`），按编号检索会撞车，必须用文件名。

---

## 附录 A：踩坑点速查

| # | 坑 | 证据位置 |
| :--- | :--- | :--- |
| 1 | 升级 `cf` 会让 strict 补丁失效，必须重做补丁 | `patches/cf@1.0.0-beta.5.patch`、ADR 0002 |
| 2 | DO 用 `exports` 声明后无法回退到 wrangler `migrations` 配置 | `cloudflare.config.ts:64-66`、`docs/deployment.md:245` |
| 3 | 运行时变量必须全部是 Secret，否则部署后报 `Invalid environment variables` | `.dev.vars.example:2-3`、`docs/deployment.md:210` |
| 4 | `cloudflare:workers` 必须惰性 import，否则 Bun 脚本崩 | `src/lib/do/rate-limiter-binding.ts:1-2` |
| 5 | Workers Cache 键必须带 `__BUILD_ID__` 前缀 | `src/server.ts:56-60`、ADR 0009 |
| 6 | `_journal.json` 只到 0019，实际有 0022 个迁移且 meta 只到 0016 | `migrations/meta/_journal.json`、`migrations/meta/0016_snapshot.json` |
| 7 | 秒级 `timestamp` 与毫秒级 `timestamp_ms` 混用 | `src/lib/db/schema/helper.ts` vs `auth.table.ts` |
| 8 | `posts.cover_media_id` 无外键 | `src/lib/db/schema/posts.table.ts:58` |
| 9 | 快照里的 `tagIds` / `categoryId` 是历史值，不可用于展示 | `posts.table.ts:28` 注释、ADR 0008 |
| 10 | `user.role` 无默认值，直写库时必须显式给 | `src/lib/db/schema/auth.table.ts:19`、`scripts/dev-admin-session.ts:105` |
| 11 | `apikey` 表默认开启限流字段，但插件整体关掉了限流 | `auth.table.ts:110-114` vs `auth.config.ts:32` |
| 12 | `contract.generated.json` 是生成物但入库，改路径必须重跑脚本 | `package.json` `orpc:contract` |
| 13 | `src/lib/orpc/router.ts` 顶部副作用 import 不能被"清理" | `src/lib/orpc/router.ts:1-5` |
| 14 | `turnstileMiddleware` 未配 secret 时无条件放行 | `src/lib/orpc/procedure.ts:114` |
| 15 | `_public/$` 的 404 缓存头被 `applyWorkersCachePolicy` 改成 private | `src/routes/_public/$.tsx:12` vs `src/server.ts:43` |
| 16 | `api.auth.ts` 与 `api.auth.$.ts` 必须成对存在 | `src/routes/` 两个同名文件 |
| 17 | 路由守卫只在 `/admin` 父路由做一次，安全边界在 `adminProcedure` | `src/routes/admin/route.tsx:30-41`、`procedure.ts:80-88` |
| 18 | `router._scroll.n = false` 是对 TanStack 内部字段的直接写入 | `src/router.tsx:32-35` |
| 19 | publish 时缓存 purge 失败会连带发布失败 | `src/features/cache/workers-cache.ts:19-27`、ADR 0009 |
| 20 | Queue 里解析失败的消息被 `ack()` 静默丢弃 | `src/lib/queue/queue.handler.ts:11-22` |
| 21 | 测试环境不注册 Queue 消费者，`bun test` 测不到真实投递 | `cloudflare.config.ts:47-56` |
| 22 | `RateLimiter` 令牌状态在内存、异步落盘 | `src/lib/do/rate-limiter.ts:73-79` |
| 23 | Mermaid 的 `SSR ? null` 一旦去掉会污染 Worker bundle | `src/components/content/mermaid-render.ts:7-9`、ADR 0027 |
| 24 | 编辑器代码块超过约 500 行 / 50k 字符不高亮 | ADR 0024 |
| 25 | 搜索的 `SCAN_LIMIT` / `FUZZY_MAX_DISTANCE` 已无引用，FTS 无模糊匹配 | `src/features/search/search.constants.ts`、ADR 0023 |
| 26 | 搜索正文切片 10000 字符，超出部分搜不到 | `src/features/search/search.constants.ts`、`search.service.ts:27` |
| 27 | feed 条目上限 100、content 为纯文本 | `src/features/posts/utils/feed.ts:49,77` |
| 28 | `robots.txt` 的 Disallow 是手写清单，且缓存 24h | `site-documents.service.ts:144-159` |
| 29 | `.cta.json` 是模板残留（写着 pnpm） | `.cta.json` |
| 30 | `postinstall` 依赖 `cf workers types`，离线装依赖会失败 | `package.json:36` |
| 31 | `docs/adr/` 有两篇 0002 | `docs/adr/0002-*.md` |
| 32 | CI 的 `paths-ignore` 不覆盖 `.agents/**` | `.github/workflows/ci.yml:6-10` |
| 33 | `utils.ts` 里 `PostItemSchema.category` / `cover` 用 `.catch(null)` 静默降级 | `src/features/posts/schema/posts.schema.ts:72,75` |
| 34 | slug 并发生成有 5 次重试 + 随机后缀兜底 | `src/features/posts/services/posts.service.ts:244-274` |
| 35 | `features/comments/workflows/` 不是 Cloudflare Workflow | `src/features/comments/workflows/helpers.ts`、ADR 0004 |

## 附录 B：核心概念一句话索引

| 概念 | 一句话 | 主要落点 |
| :--- | :--- | :--- |
| Public Content Snapshot | Post 的已发布态，`public_snapshot_json` 非空即为已发布 | `posts.table.ts`、`posts.service.ts:491-573` |
| Post Revision | 发布时、以及恢复前保存的编辑态快照；autosave 不产生 | `post-revisions.table.ts`、`utils/sync.ts` |
| Public Cache | KV 读模型（两级键）+ Workers Cache（Cache-Tag） | `features/cache/**` |
| Search Index | D1 的 `search_documents` + FTS5 虚表 | `migrations/0019_search_fts.sql`、`features/search/**` |
| Post Popularity Snapshot | 每日由 Umami 生成的 30 天排名，超 7 天视为过期 | `features/post-popularity/**`、`src/server.ts:66-73` |
| API Key | 以所属 Admin 身份调用 HTTP API，不能管理 API Key | `auth.config.ts:28-37`、`api-key-guard.ts` |
| Muted User | 不能发评论但仍是正常用户；Admin 不可被禁言 | `auth.table.ts:23`、`muted-users.ts` |
| Webhook Endpoint | 唯一的通知外发目标，按 provider 生成请求体 | `features/webhook/**`、ADR 0018/0029 |
| System Config | 单例 JSON，Site Config + 通知投递，双 revision 分区替换 | `config.table.ts`、`config.storage.ts`、ADR 0025 |
