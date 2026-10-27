# LuyBlog 架构分析笔记

- 目标仓库：`C:\opt\workstations\project\blogs\taiping_blog\docs\LuyBlog`（下文所有路径均相对该目录）
- 分析方式：**只读**。未修改、未安装依赖、未执行构建与测试，仅读取文件与 `git log`。
- 仓库当前状态（实测）：工作区 `git status --porcelain` 为空；`node_modules/`、`dist/`、`.wrangler/`、`local.db`、`.dev.vars` **均不存在**，因此所有关于"产物内容"的结论来自源码与配置的推导，不来自实际构建结果（凡属推导处已明确标注）。
- 最近 5 次提交：`1653984 feat: remove music module` / `acb3490`、`bc6e010`（图标） / `34cc0e1 feat(frontend): 重写 LuyBlog 界面视觉系统` / `ce1eeee feat(ai): 完善博客 AI 写作助手`。
- 命名遗留：`package.json:2` 的包名与 `wrangler.jsonc:3` 的 Worker 名仍是模板名 `nekro-edge-template`，只有 `wrangler.jsonc:28` 的 production 环境覆盖为 `luy-blog`。

---

## 1. 工程结构

### 1.1 根目录各子目录职责

| 目录/文件 | 职责 | 关键证据 |
|---|---|---|
| `src/` | Worker 后端。入口 `index.ts`、路由 `routes/`、Drizzle schema `db/`、中间件 `middleware/`、业务服务 `services/`、工具 `utils/`、SEO 配置 `config/seo.ts`、绑定类型 `types.ts` | `src/index.ts`、`src/routes/*.ts`（11 个文件）、`src/db/schema.ts` |
| `common/validators/` | 前后端共享的 Zod schema（4 个文件，共约 370 行） | `common/validators/admin.schema.ts`(162 行)、`ai.schema.ts`(82)、`blog.schema.ts`(83)、`auth.schema.ts`(43) |
| `frontend/` | React 18 + Vite 前端。`src/admin`（后台模块）、`src/pages`（前台页面）、`src/components`、`src/context`、`src/hooks`、`src/services`、`src/theme`、`src/config`、`src/utils`、`src/assets`；`public/` 4 个静态文件；`index.html` 是**脚本生成物** | `frontend/vite.config.mts`、`frontend/index.html`、`scripts/generateHtml.ts:20` |
| `drizzle/` | D1 迁移与元数据。15 个手写 SQL + `meta/`（`_journal.json` + 2 个 snapshot）+ 空 `seed.sql` | `drizzle/0000…0014`、`drizzle/meta/_journal.json`、`drizzle/seed.sql` |
| `scripts/` | 构建辅助脚本，只有一个 28 行的 `generateHtml.ts`（生成开发/构建用的 HTML 模板） | `scripts/generateHtml.ts` |
| `docs/` | 面向使用者/维护者的 Markdown 文档，7 篇，与代码无构建耦合 | `docs/API_GUIDE.md`(487 行)、`AUTHENTICATION.md`(320)、`DEVELOPMENT.md`(420)、`THEMING.md`(511)、`INSTALLATION.md`(266)、`SEO_GUIDE.md`(220)、`DEPLOYMENT.md`(81) |
| `.cursor/` | AI 编码规则与一次 SSR 故障的调试留痕（非运行时代码） | `.cursor/rules/global.mdc`(14.9KB)、`.cursor/trace/debugging-ssr-error.md`(13.9KB) |
| 根配置文件 | `wrangler.jsonc`（部署）、`tsconfig.json`/`tsconfig.node.json`、`drizzle.config.ts`、`pnpm-workspace.yaml`、`env.example`、`worker-configuration.d.ts`、`.prettierrc.json`、`.vscode/settings.json`、`.gitignore`、`LICENSE`(MIT) | 见下表 |

> 目录语义的一处破坏：**后端源码反向依赖前端目录**。`src/routes/siteConfig.ts:4` 从 `../../frontend/src/config/siteConfig` 导入默认配置与 `normalizeSiteConfig`/`toPublicSiteConfig`；后端测试 `src/routes/ai.test.ts:3` 也 import 前端 config。`common/` 没有承担"共享层"职责，真正被前后端共用的只有 `frontend/src/config/siteConfig.ts` 和 `common/validators/*` 中的少部分。

### 1.2 `package.json` 全部脚本逐个解释

`package.json:6-28`：

| 脚本 | 命令 | 用途 | 备注/坑 |
|---|---|---|---|
| `dev` | `concurrently "npm:dev:backend" "npm:dev:frontend"` | 并行起 Worker(8787) + Vite(5173) | 依赖 `concurrently` |
| `dev:backend` | `wrangler dev` | 本地 Worker（含 D1 本地库、assets） | 会读 `.dev.vars` |
| `dev:frontend` | `vite --config frontend/vite.config.mts` | Vite dev server | 端口由环境变量 `VITE_PORT` 决定 |
| `build:client` | `vite build --emptyOutDir --config frontend/vite.config.mts` | 客户端构建 → `dist/client` | `--emptyOutDir` 会清空目录 |
| `build:server` | `vite build --emptyOutDir --ssr src/entry-server.tsx --outDir ../dist/server --config frontend/vite.config.mts` | SSR 构建 → `dist/server/entry-server.mjs` | 该 `--ssr` 指向的 `src/entry-server.tsx` **在仓库里不存在**（真实文件是 `frontend/src/entry-server.tsx`）；靠 Vite root=frontend 才解析到，属隐式依赖，改目录即断 |
| `build` | `pnpm generate:html && pnpm build:client && pnpm build:server` | 标准构建三连 | 先生成 `frontend/index.html` 再交给 Vite |
| `build:prod` | `pnpm db:migrate:prod && pnpm generate:html && pnpm build:client && pnpm build:server` | 迁移 + 构建 | |
| `generate:html` | `tsx scripts/generateHtml.ts` | 写出 `frontend/index.html` | 产物被 git 跟踪，生成逻辑与运行时模板同源 |
| `deploy` | `pnpm build && wrangler deploy --env production` | 构建并部署生产 | **不跑** `db:migrate:prod` |
| `serve:prod` | `pnpm build && wrangler dev --env production` | 用生产配置本地跑 | |
| `test` | `vitest` | 跑测试 | 无 `vitest.config.*`，默认 node 环境；`@cloudflare/vitest-pool-workers` 装了但未配置 |
| `cf-typegen` | `wrangler types` | 生成 `worker-configuration.d.ts` | 该文件当前内容过期（见 1.4） |
| `db:generate` | `drizzle-kit generate` | 生成迁移 | 因 meta 快照停在 0001 而不可用（见 4.4） |
| `db:migrate` | `wrangler d1 migrations apply DB --local` | 本地迁移 | 只按 `drizzle/` 目录字母序，独立于 `_journal.json` |
| `db:migrate:prod` | `wrangler d1 migrations apply DB --env production --remote` | 生产迁移 | |
| `db:studio` | `drizzle-kit studio` | Drizzle 可视化 | 受 4.4 影响 |
| `db:check` | `drizzle-kit check` | 迁移一致性检查 | 受 4.4 影响 |
| `db:seed` / `db:seed:prod` | `wrangler d1 execute … --file=./drizzle/seed.sql` | 执行种子 | `seed.sql` 只有注释，无数据 |
| `db:import:halo:prod` | `wrangler d1 execute … --file=./drizzle/halo-import.sql` | Halo 导入 | **引用的文件不存在**，命令必然失败 |
| `typecheck` | `tsc --noEmit && tsc -p frontend/tsconfig.json --noEmit` | 类型检查 | 与 `lint` 完全相同 |
| `lint` | 同 `typecheck` | —— | 没有 ESLint，`lint` 是别名 |
| `format` | `prettier . --write` | 格式化 | 配置见 `.prettierrc.json`（printWidth 120、trailingComma all） |

### 1.3 workspace 与 tsconfig 分包

- `pnpm-workspace.yaml:1-2`：`packages: ["."]` —— 单包 workspace。用它的真实目的是下面的构建白名单：`allowBuilds: {'@swc/core': true, esbuild: false, sharp: false, workerd: false}`（`pnpm-workspace.yaml:4-8`），即允许 `@swc/core` 构建、禁止其余四者。没有多包结构，`common/` 不是 workspace 包，靠相对路径导入。
- 根 `tsconfig.json`：目标 ESNext、`moduleResolution: bundler`、`strict: true`、`noEmit`、`isolatedModules`、`allowImportingTsExtensions`；路径别名 `@/* → ./src/*`、`@frontend/* → ./frontend/src/*`（`tsconfig.json:19-22`）；`types` 同时含 `@cloudflare/workers-types` 与 `vite/client`；`include` 同时包含 `src/**/*.ts` 与 `frontend/src`（`tsconfig.json:26`）—— **一个 tsconfig 覆盖两端**，只有 `types` 与全局环境共享，没有"服务端 tsconfig / 客户端 tsconfig"的隔离。
- `frontend/tsconfig.json`：`extends ../tsconfig.json`，把 `@/*` 与 `@frontend/*` 都重定向到 `frontend/src`（`frontend/tsconfig.json:4-7`）。这意味着**同一个 `@/` 在两份 tsconfig 下指向不同目录**（根里指 `src/`，前端里指 `frontend/src/`），是类型解析歧义的来源。
- `tsconfig.node.json`：`extends` 根配置、`types: ["node"]`、只 `include` 三个配置类文件（`drizzle.config.ts`、`frontend/vite.config.mts`、`frontend/uno.config.ts`）。**没有任何脚本使用它**（`typecheck`/`lint` 都没引用），属摆设。

### 1.4 `env.example` 每个变量

`env.example` 全文 17 行，只有 3 个变量 + 1 行说明：

| 变量 | 含义 | 出现位置 | 一致性 |
|---|---|---|---|
| `GITHUB_CLIENT_ID` | GitHub OAuth App 的 Client ID | `env.example:10` | 与 `src/types.ts:6`、`src/routes/auth.ts:214` 一致 |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App 的 Client Secret | `env.example:11` | 与 `src/types.ts:7`、`src/routes/auth.ts:279` 一致 |
| `APP_BASE_URL` | 应用基准地址，用于拼 `redirect_uri` 与生产 CORS 白名单 | `env.example:15` | 与 `src/types.ts:8`、`auth.ts:228`、`index.ts:32` 一致；同时也在 `wrangler.jsonc:24,44` 的 `vars` 里重复定义 |
| （注释） | `AI 配置已迁移到后台「站点配置」页面` | `env.example:17` | 与实现一致：AI key 存 D1（见第 8 节） |

**没有被 `env.example` 记录但运行时需要的变量**：`NODE_ENV`（决定 dev 反代与 CORS 行为，`index.ts:31,92,162`）、`VITE_PORT`（dev 反代目标端口，`index.ts:93`）、`QWEATHER_KEY`（`src/types.ts:9`、`src/routes/utility.ts:50`，可选）、`VITE_API_PORT`/`VITE_API_HOST`（`frontend/vite.config.mts:13-14`，用于 Vite dev proxy 目标）。后四个只在 `wrangler.jsonc:21-25` 或代码里有，`env.example` 里完全没有。

`worker-configuration.d.ts`（`wrangler types` 的产物）只声明了 `DB`/`ASSETS`/`NODE_ENV`/`VITE_PORT` 四个绑定，**缺** `GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET`、`APP_BASE_URL`、`QWEATHER_KEY`，而真实类型源是手写的 `src/types.ts:1-10`。两份类型定义并存且不同步。

### 可复用要点

- 用 `concurrently` 把"Worker 侧运行时 + Vite 侧 HMR"拆成两个进程，前端仍享受完整 Vite 体验，这是 Workers + SPA 项目里成本最低的 dev 形态。
- 把 HTML 模板抽成 `src/utils/htmlTemplate.ts` 的纯函数，同时被构建脚本（`scripts/generateHtml.ts`）与运行时 SSR（`src/index.ts:146-156`）复用，避免"手写 index.html 与 SSR 模板不一致"这一经典问题。
- `pnpm-workspace.yaml` 的 `allowBuilds` 白名单是锁定供应链构建脚本的轻量手段，比引入整条 CI 校验便宜。

### 问题/坑点

- `build:server` 的 `--ssr src/entry-server.tsx` 与真实文件位置不符，只靠 Vite `root` 相对解析工作，`ls src/entry-server.tsx` 会失败，属极易踩断的隐式约定。
- `frontend/index.html` 是生成物但被纳入版本管理，且 `generate:html` 不是 `build` 的唯一入口（开发者直接改 index.html 也能生效），生成物与源模板会漂移。
- `db:import:halo:prod` 指向不存在的 `drizzle/halo-import.sql`。
- `lint` 就是 `typecheck`，没有静态规则检查；`typecheck` 又因为一个 tsconfig 覆盖两端而无法区分 DOM 与 Worker 全局。
- `env.example` 与实际需要的变量集不一致，新环境照抄会缺 `NODE_ENV`/`VITE_PORT`（本地幸好有 `wrangler.jsonc` 兜底，生产改由控制台配置，但文档没写全）。

---

## 2. 部署拓扑

### 2.1 `wrangler.jsonc` 的作用

| 配置 | 值 | 作用 |
|---|---|---|
| `name` | `nekro-edge-template`（`wrangler.jsonc:3`），production 覆盖为 `luy-blog`（`:28`） | Worker 名 |
| `main` | `src/index.ts`（`:4`） | Worker 入口，被 esbuild 打包成单文件脚本 |
| `compatibility_date` / `flags` | `2024-07-29` + `nodejs_compat`（`:5-8`） | 运行时 API 版本；`nodejs_compat` 提供 Node 兼容层（`@paralleldrive/cuid2` 等依赖需要） |
| `assets.binding` / `assets.directory` | `ASSETS` / `./dist/client`（`:9-12`，生产重复定义 `:29-32`） | 声明 Worker 的静态资源绑定与目录 |
| `d1_databases[0]` | `DB` / `nekro-edge-db-local` / `database_id: "local"` / `migrations_dir: drizzle`（`:13-20`） | 本地模式；`database_id: "local"` 只是占位 |
| `env.production.d1_databases[0]` | `DB` / `luyblog_prod` / `556a28d9-10d5-48b4-b711-015085b2ee0a`（`:33-40`） | 生产库真实 ID 已写进仓库 |
| `vars` | `NODE_ENV` / `VITE_PORT` / `APP_BASE_URL`（`:21-25`，生产 `:41-45`） | 非密变量；生产 `APP_BASE_URL=https://blog.lyuy.top` |
| `observability` | `enabled: false`，但 `logs.enabled: true, persist: true, invocation_logs: true`（`:48-62`） | 关掉可观测性总开关，仅保留日志落盘 |
| 未设置 | `assets.run_worker_first`、`assets.not_found_handling` | 使用平台默认，直接决定下面的分流行为 |

**这个文件没有出现的绑定**：任何 `r2_buckets`、`kv_namespaces`、`queues`、`durable_objects`、`services`、secrets。也就是说整套系统只有"静态资源 + D1"两种存储（第 10 节）。

### 2.2 `main: src/index.ts` + `assets.directory: ./dist/client` 如何共存

这是 Cloudflare Workers Static Assets 的标准形态：平台在 Worker 之外托管 `./dist/client`，同时把同一个 Worker 脚本挂上去；`assets.binding = "ASSETS"` 额外给脚本内一个 `Fetcher`，让代码也能读这些文件。

分流规则（关键，且仓库里没写）：
- **默认 `run_worker_first = false`**：请求先做静态资源匹配，命中就由平台直接返回，**Worker 脚本不会收到这次请求**；未命中才进入 Worker。
- `not_found_handling` 未设置（默认 `none`）：未命中资源的请求交给 Worker 处理，而不是返回平台 404。

由此推出两条重要后果（**属推导，需用 `wrangler dev --env production` 实测确认**）：

1. `dist/client/index.html` 会被匹配到，因此 **`/` 请求极可能由平台直接返回构建产物里的 `index.html`，`src/index.ts` 的 SSR 分支不会执行**。SSR 实际只对"没有对应文件的路径"生效，例如 `/blog/xxx`、`/moments`、`/admin`、`/about`。
2. `src/routes/*` 里的 API 路径（`/api/**`）在 `dist/client` 里没有同名文件，因此稳定进入 Worker——这与代码预期一致。

而 `src/index.ts:111-120` 只对 `pathname.startsWith("/assets/")` 主动调 `ASSETS.fetch`，这层判断在"平台已经先匹配过一遍"的前提下是冗余的（重复劳动，且永远不会命中 404 分支）。

`dist/client` 里都有什么（**推导**，仓库里 `dist/` 不存在）：
- `index.html`：由 Vite 以 `frontend/index.html` 为入口产出（`frontend/vite.config.mts:19-25`，`root: "frontend"`），脚本/样式被改写成带 hash 的 `/assets/xxx.js`、`/assets/xxx.css`。
- `assets/*.js`、`assets/*.css`：哈希命名的 bundle；`manifest: true` 额外产出 `.vite/manifest.json`。
- `.vite/manifest.json`：SSR 侧用它找入口（`src/index.ts:126,139`）。
- `frontend/public/` 的 4 个文件被原样拷到 `dist/client/` 根：`luyblog-icon.svg`、`logo.png`(773KB)、`anime-night-studio.png`(2.19MB)、`moment-lustopia.jpg`。它们不走 `/assets/` 前缀，也没有 hash，因此不受长缓存策略保护。

### 2.3 开发模式下 5173 与 8787 的关系

两端入口 + 双向代理：

| 访问入口 | 请求走向 | 证据 |
|---|---|---|
| `http://localhost:8787/**` | Worker 的 catch-all（`src/index.ts:91`）在 `NODE_ENV=development` 时把 `c.req.raw` 原样 `fetch` 到 `http://localhost:5173`（`:92-105`），端口取 `c.env.VITE_PORT`，host 强制 `localhost` | `src/index.ts:92-105` |
| `http://localhost:5173/**` | Vite dev server 直接服务；只有 `/api` 前缀被 proxy 到 `http://${VITE_API_HOST||localhost}:${VITE_API_PORT||8787}`（`changeOrigin: true`） | `frontend/vite.config.mts:28-39` |
| `http://localhost:5173/api/**` | 经 Vite proxy 打到 8787 Worker | 同上 |
| 8787 的 `/api/**` | Worker 自身处理（catch-all 之前注册），不转发 | `src/index.ts:40` 在 `:91` 之前 |

因此 dev 下 **SSR 完全关闭**（8787 只做反向代理），前端在 5173 上以纯 SPA 方式运行。

跨域处理：`src/index.ts:27-37` 的 CORS 只挂在 `/api/*`。开发环境下 `origin: (origin) => origin || "*"`，即**反射任意来源**；生产环境只允许 `origin === c.env.APP_BASE_URL`，不匹配时返回空串（相当于禁用 CORS 头）。`allowMethods` 列出 GET/POST/PUT/DELETE/OPTIONS/PATCH。

常见的两个陷阱：
- OAuth 回调地址被硬编码成 `${APP_BASE_URL}/auth/callback`（`src/routes/auth.ts:228`），本地是 `http://localhost:8787/auth/callback`（`env.example:9`）。若开发者直接在 5173 上点登录，跳 GitHub 回来后落在 **8787** 的 SPA 上（由 dev 反代提供），两个 host 的 `localStorage` 不互通——`github_oauth_state` 与 `auth_token` 存在 5173 域下时，8787 域的 `AuthCallbackPage` 读不到 state（`frontend/src/pages/AuthCallbackPage.tsx:24`），表现为"登录后仍是未登录"。这是"双入口 + localStorage 存凭证"的结构性摩擦。
- Vite 侧 `ssr.noExternal` 把 `react-router-dom`、MUI 全家桶、emotion、i18next 内联（`frontend/vite.config.mts:48-59`），配合 `entry-client.tsx:12-14` 的 CJS/ESM interop hack（`(OriginalBrowserRouter as any).default ?? OriginalBrowserRouter`），说明 SSR 打包这条链历史上踩过 CJS 互操作问题。

### 2.4 构建链路与 HTML 模板生成

`pnpm build` 的时序：
1. `generate:html` → `scripts/generateHtml.ts:12-25` 调 `generateHtmlTemplate({ path: "/", content: "<!--app-html-->", cssFiles: [], jsFiles: ["/src/entry-client.tsx"] })`，写到 `frontend/index.html`。产物即 `frontend/index.html:68,71`（`<div id="root"><!--app-html--></div>` + `/src/entry-client.tsx`）。
2. `build:client` → Vite 以 `frontend` 为 root 构建到 `../dist/client`，把上一步的 `index.html` 作为模板产出最终的 `dist/client/index.html`。
3. `build:server` → 以 SSR 模式把 `frontend/src/entry-server.tsx` 打包到 `dist/server/entry-server.mjs`。

运行时（生产）SSR 装配（`src/index.ts:123-158`）：动态 `import("../dist/client/.vite/manifest.json")` 与 `import("../dist/server/entry-server.mjs")` → 取 `manifest["index.html"]` → 用它的 `css[]`/`file` 拼成 `<link>`/`<script>` → `render(url.pathname)` 得到 HTML 字符串 → 套 `generateHtmlTemplate` → `c.html(template)`。**同一套模板函数被构建期和运行期各用一次**，`src/utils/htmlTemplate.ts:13-99` 是唯一真源。

失败兜底：`src/index.ts:159-172` 捕获 SSR 异常，生产返回通用文案，开发返回完整 `message + stack` 且 `200` 之外的 `500` 状态码（用 `c.html(..., 500)`）。

### 可复用要点

- "一个 Worker 同时托管 SPA 和 API、零额外 CDN 配置"是这个模板最大的价值：省掉域名/证书/CORS/Cookie 域的全部复杂度。
- 用 `manifest.json` 的 `index.html` 条目拿入口 chunk（`src/index.ts:139`）比硬编码文件名健壮，hash 变更自动跟随。
- dev 期让 Worker 反向代理到 Vite（而不是让 Vite 代理到 Worker）能使 8787 上的行为与线上尽量一致（同一端口既有 `/api` 又有 HTML），代价是要处理回环 fetch。

### 问题/坑点

- 未设置 `run_worker_first`：`/` 是否走 SSR 完全交给平台默认行为，代码里却按"所有非 /assets 路径都 SSR"来写（`src/index.ts:107-158`），两者语义不一致，且**首页 SEO/首屏在两种行为下完全不同**。
- `src/index.ts:111-120` 的 `ASSETS.fetch` 与平台层匹配重复。
- 生产 `database_id`、`APP_BASE_URL` 都硬编码在仓库（`wrangler.jsonc:37,44`），换域名/换库要改代码仓库。
- `observability.enabled = false` 却又开启日志持久化，语义矛盾；实际没有 traces、没有告警。
- dev 双入口与 `localStorage` 存 token 的组合会让 OAuth 在 5173/8787 之间失效。
- dev 下 CORS 反射任意 origin + `credentials` 未显式配置，一旦将来改用 Cookie 会话就会踩 `Access-Control-Allow-Credentials` 坑。

---

## 3. 后端入口与中间件

### 3.1 `src/index.ts` 全量解读（175 行）

| 行 | 内容 | 说明 |
|---|---|---|
| 10-21 | imports | `OpenAPIHono`、`swaggerUI`、`secureHeaders`、`cors`、`logger`、`etag`、`drizzle`，以及 `./routes/api`、`./db/schema`、`./types` |
| 23 | `const app = new OpenAPIHono<{ Bindings: Bindings }>()` | 顶层应用，只声明 `Bindings`，**没有声明 `Variables.db`**（DB 注入在子应用 `routes/api.ts:16-18` 里声明） |
| 26 | `app.use("*", etag(), secureHeaders(), logger())` | 全局中间件：ETag 协商缓存 + 安全响应头 + 请求日志 |
| 27-37 | `app.use("/api/*", cors({...}))` | 仅 API 前缀启用 CORS |
| 40 | `app.route("/api", api)` | 挂载 API 子应用 |
| 43-49 | `app.doc("/api/doc", {...})` | OpenAPI 3.1.0 JSON |
| 52-57 | `app.get("/doc", swaggerUI({ url: "/api/doc" }))` | Swagger UI 页面 |
| 60-66 | `GET /robots.txt` | 动态生成，`Cache-Control: public, max-age=86400` |
| 69-76 | `GET /sitemap.xml` | 现造 drizzle 实例后调 `generateDynamicSitemapXml`，`max-age=86400` |
| 78-88 | `GET /rss.xml` 与 `GET /feed.xml` | 同一 handler，`application/rss+xml`，`max-age=3600` |
| 91-173 | `app.get("*", async (c) => {...})` | 静态资源 + SPA/SSR 兜底 |
| 92-105 | dev 分支 | 反代到 `http://localhost:${VITE_PORT}`，逐字段复制 status/statusText/headers，body 用流透传 |
| 107-120 | 生产静态分支 | 仅 `pathname.startsWith("/assets/")` 时尝试 `c.env.ASSETS.fetch(c.req.raw)`，404 则继续往下 |
| 122-158 | 生产 SSR 分支 | 动态 import manifest + entry-server → `render(pathname)` → 取 `entry.css`/`entry.file` → `generateHtmlTemplate` → `c.html` |
| 159-172 | SSR 失败捕获 | 生产隐藏细节、开发回显 stack；均返回 500 HTML |
| 175 | `export default app` | Workers 的模块入口 |

**路由分流总结（按注册顺序，先注册先匹配）**：

| 路径模式 | 处理者 |
|---|---|
| `/api/**` | `routes/api` 下的子应用（DB 中间件 + 各业务路由） |
| `/api/doc`、`/doc` | OpenAPI JSON / Swagger UI |
| `/robots.txt`、`/sitemap.xml`、`/rss.xml`、`/feed.xml` | Worker 内动态生成 |
| `/assets/**` | 生产：尝试 `ASSETS.fetch`；开发：转发 Vite |
| 其余一切 | 开发：转发 Vite；生产：SSR 渲染任意 pathname |

**动态页面 `/:slug` 兜底的真实实现位置是前端，不在 Worker**：Worker 对所有未知路径一律 `renderToString`（`src/index.ts:134`），真正决定渲染什么的是 `frontend/src/routes.tsx:42` 的 `<Route path=":slug" element={<MarkdownPage />} />`，而 `MarkdownPage` 用 `useQuery` 请求 `GET /api/pages/:slug`（`frontend/src/pages/MarkdownPage.tsx:8-12` → `frontend/src/services/content.ts:137`）。因此：

- 服务端**不校验 slug 是否存在**，任何路径都返回 HTTP 200 + 同样的壳 + `MarkdownPage` 的加载态；
- 页面不存在时表现为客户端出现"页面不存在或尚未发布"（`MarkdownPage.tsx:24-28`）——典型 soft 404，对 SEO 不利；
- 客户端 `:slug` 会吞掉任何未定义的路径（没有 `path="*"` 兜底、没有 404 路由），例如 `/nonsense` 与"页面不存在"是同一个 UI。

### 3.2 `src/middleware/` 每个中间件

| 文件 | 作用 | 关键实现 |
|---|---|---|
| `src/middleware/auth.ts` | 从 `Authorization: Bearer <token>` 取会话 token，查 `user_sessions`（token 相等且 `expiresAt > now`），再查 `users`，`status === "banned"` 拒绝，通过则 `c.set("user", user)` | `auth.ts:17-47`；401（缺 token / 无效过期）、401（用户不存在）、403（被封禁） |
| `src/middleware/admin.ts` | 读 `c.get("user")`，`user.role !== "admin"` → 403 | `admin.ts:15-21`。**它自身不做认证**，必须与 `authMiddleware` 串联使用，顺序反了就会误判（`c.get("user")` 为 undefined → 403，属安全的一侧） |

使用方式（全部是 `createMiddleware` + 链式挂载）：
- `src/routes/admin.ts:37`：`app.use("/*", authMiddleware, adminMiddleware)` —— 整个后台一个守卫。
- `src/routes/ai.ts:32`：同上。
- `src/routes/utility.ts:17`：`protectedRoutes.use("/*", authMiddleware, adminMiddleware)`。
- `src/routes/auth.ts:210`、`src/routes/post.ts:20`、`src/routes/comment.ts:82`：只用 `authMiddleware`（不需要 admin）。

除 Hono 自带的 `etag/secureHeaders/logger/cors` 外，业务中间件只有这两个，**没有**：请求体大小限制、速率限制、统一错误处理（`app.onError`）、统一 404（`app.notFound`）、请求 ID/追踪、DB 事务封装。

### 可复用要点

- `c.set("db", drizzle(c.env.DB, { schema }))` 在 API 子应用的第一层统一注入（`src/routes/api.ts:22-26`），路由层完全不用碰 `c.env.DB`，是 Workers 上很干净的写法。
- 把"认证"和"授权"拆成两个可组合中间件（`auth` → `admin`），后续加角色只需替换第二段。
- robots/sitemap/rss 作为普通路由注册在 SPA 兜底之前，避免被 `catch-all` 吞掉，这个顺序意识是对的。
- SSR 失败时区分环境返回不同详细程度（`index.ts:161-166`），生产不泄露 stack。

### 问题/坑点

- 没有 `app.onError`/`app.notFound`：未匹配的 `/api/xxx` 返回 Hono 默认纯文本 `404 Not Found`，与业务 JSON 错误格式不一致；任何未捕获异常直接 500 且无统一结构。
- `etag()` 挂在 `*` 上，对 `/api/*` 也生效。对 `GET /api/posts/:slug` 这类**有副作用**的接口（自增 `viewCount`）会造成"304 也会写库"的悖论（handler 已执行，缓存只省了传输）。
- dev 反代把 `url.hostname` 强制为 `localhost`（`index.ts:95`），IPv6/自定义 host 场景会失效；且 `fetch(url, c.req.raw)` 复用原始请求（含 `Host` 头语义）在部分环境需要 `changeOrigin` 等价处理。
- `c.env.VITE_PORT` 类型是 `string`（`src/types.ts:5`），`index.ts:93` 有 `|| "5173"` 兜底，但这属于把构建期变量当运行期变量用。
- 顶层 `app` 只声明 `Bindings`，而子应用返回的 Variables 类型不会传播回顶层 —— 顶层若想读 `c.get("db")` 拿不到类型（当前没读，属潜在坑）。

---

## 4. 数据库层

`src/db/schema.ts` 共 237 行、**10 张表**（不是 11；`drizzle/` 里出现过的 `features`/`chatters`/`photos`/`music_tracks` 均已删除）。

### 4.1 表结构与约束（逐表）

#### users（`schema.ts:5-29`）

| 列 | 类型 | 约束/默认 |
|---|---|---|
| `id` | text | PK，`$defaultFn(createId)`（cuid2） |
| `github_id` | text | NOT NULL，**UNIQUE** |
| `username` | text | NOT NULL |
| `email` / `avatar_url` | text | 可空 |
| `api_key` | text | NOT NULL，**UNIQUE**，默认 `ak-${createId()}` |
| `role` | text enum `["user","admin"]` | NOT NULL，默认 `user` |
| `status` | text enum `["active","banned"]` | NOT NULL，默认 `active` |
| `created_at` / `updated_at` | integer(timestamp) | NOT NULL，DDL 默认 `strftime('%s','now')` |

索引：`users_github_id_idx`、`users_api_key_idx`（`:28`）。注意 `github_id`、`api_key` 已各有 UNIQUE 索引，这里又各建一条普通索引——**冗余索引**。

#### user_sessions（`schema.ts:31-50`）

| 列 | 类型 | 约束 |
|---|---|---|
| `id` | text | PK，cuid2 |
| `user_id` | text | NOT NULL，FK → `users.id` **ON DELETE CASCADE** |
| `session_token` | text | NOT NULL，**UNIQUE** |
| `expires_at` | integer(timestamp) | NOT NULL（无默认，代码写 30 天） |
| `created_at` | integer(timestamp) | NOT NULL，默认 `$defaultFn(() => new Date())`（JS 侧，与其它表的 `strftime` 不一致） |

索引：`session_token`、`user_id`（`:46-49`）。

#### posts（`schema.ts:52-86`）

| 列 | 类型 | 约束/默认 |
|---|---|---|
| `id` | text | PK cuid2 |
| `author_id` | text | NOT NULL，FK → `users.id` CASCADE |
| `title` | text | NOT NULL |
| `slug` | text | NOT NULL，**UNIQUE** |
| `summary` / `cover` / `category` | text | 可空 |
| `tags` | text | 可空，**JSON 字符串**（无关联表） |
| `reading_time` | integer | 可空（后台未计算，前端 fallback 6 分钟） |
| `view_count` | integer | NOT NULL 默认 0 |
| `frontmatter` | text | 可空（当前没人写，只有 `moments`/`pages` 创建时硬写 `"{}"`） |
| `content_md` | text | NOT NULL |
| `status` | text enum `["draft","published"]` | NOT NULL 默认 `draft` |
| `published_at` | integer(timestamp) | 可空 |
| `created_at`/`updated_at` | integer | NOT NULL 默认 `strftime('%s','now')` |

索引：`author_id`、`(status, published_at)`、`slug`、`category`（`:80-85`）。`slug` 同时有 UNIQUE 与普通索引（冗余）。

#### moments（`schema.ts:88-112`）

`id`(PK cuid2)、`slug`(UNIQUE)、`content_md`、`location`(可空)、`images`(text，JSON 数组)、`frontmatter`(可空)、`status`(enum draft/published，**默认 `published`**)、`published_at`(可空)、`created_at`/`updated_at`。索引：`(status, published_at)`、`slug`。注意：**没有 author_id**，无归属概念。

#### pages（`schema.ts:114-133`）

`id`、`slug`(UNIQUE)、`title`、`content_md`、`frontmatter`、`status`(默认 published)、`created_at`/`updated_at`。索引：`slug`、`status`。**没有 published_at**，因此 sitemap 只能拿 `updatedAt` 当 lastmod（`src/utils/feed.ts:120`）。

#### projects（`schema.ts:135-156`）

`id`、`name`、`description`、`icon`、`github_url`、`tags`(JSON)、`sort_order`(默认 0)、`status`(默认 published)、时间戳 x2。索引：`(status, sort_order)`。

#### friend_links（`schema.ts:158-178`）

`id`、`name`、`description`、`url`(NOT NULL)、`avatar_url`、`sort_order`(默认 0)、`status`(默认 published)、时间戳 x2。索引：`(status, sort_order)`。

#### nav_items（`schema.ts:180-198`）

`id`(PK，**由种子数据指定语义化 id** 如 `nav_home`)、`label`、`path`、`sort_order`(默认 0)、`status`(enum `enabled/disabled`，默认 enabled)、时间戳 x2。索引：`(status, sort_order)`。

#### comments（`schema.ts:200-229`）

| 列 | 类型 | 约束 |
|---|---|---|
| `id` | text | PK cuid2 |
| `post_id` | text | **可空**，FK → `posts.id` CASCADE |
| `target_type` | text enum `["post"]` | NOT NULL 默认 `post`（枚举只剩一个值） |
| `target_slug` | text | 可空 |
| `parent_id` | text | 可空，**无自引用 FK** |
| `user_id` | text | NOT NULL，FK → `users.id` CASCADE |
| `content` | text | NOT NULL |
| `status` | text enum `["visible","hidden"]` | NOT NULL 默认 `visible` |
| 时间戳 x2 | integer | 同前 |

索引 5 条：`(post_id, created_at)`、`(target_type, target_slug, created_at)`、`parent_id`、`user_id`、`status`（`:222-228`）。

#### site_settings（`schema.ts:231-237`）

`key` text **PK**（无 cuid）、`value` text NOT NULL、`updated_at` integer 默认 `strftime`。**单行 KV 表，全站配置就是 `key='siteConfig'` 的那一行 JSON**（见第 7 节）。

### 4.2 ID 生成策略

- **统一用 `@paralleldrive/cuid2` 的 `createId()`**，表定义里全部是 `text("id").primaryKey().$defaultFn(() => createId())`（`schema.ts:8-10` 等各处），没有自增整数主键、没有 UUID、没有 ULID。
- 两处例外/叠加：
  - `users.apiKey` 的 schema 默认是 `` `ak-${createId()}` ``（`schema.ts:18`），但 `src/routes/auth.ts:382` 建用户时显式传 `generateUserApiKey()`（`src/utils/encryption.ts:10-14`，格式 `sec-` + 64 位 hex，用 `crypto.getRandomValues`）。**两套前缀并存**，DB 层的 `ak-` 默认实际上永不触发（OAuth 注册是唯一写路径）。
  - `nav_items.id` 用语义化固定 id（`nav_home` 等，`src/routes/navigation.ts:13-19`），不走 cuid2。
- 会话 token 也是 `createId()`（`src/routes/auth.ts:389`）——用 collision-resistant 的 cuid2 当**认证凭证**属误用（详见第 6、12 节）。
- 前端 `createMomentSlug()` 用 `moment-${createId().slice(0,8)}`（`frontend/src/admin/momentSlug.ts`）。

### 4.3 时间字段约定

- 列类型统一 `integer(..., { mode: "timestamp" })`（Drizzle 的 Unix 秒模式），DDL 层默认值统一写成 `sql\`(strftime('%s', 'now'))\``（`schema.ts:23` 等）。
- 应用层则大量显式赋值：`updatedAt: new Date()`（如 `admin.ts:124,157,243`），`publishedAt` 由状态推导（`admin.ts:242,285`）。
- **秒级截断**：D1 存的是整秒，且 JS `new Date()` 会被取整，所以同一秒内的多条记录时间相同，`orderBy(desc(updatedAt))` 不稳定；`posts` 的排序用 `publishedAt, createdAt` 双字段缓解（`src/routes/post.ts:31`）。
- `user_sessions.created_at` 用 JS 默认值（`schema.ts:44`）而非 `strftime`，与其它表不一致（功能上等价）。
- `posts.published_at` 在状态切回 `draft` 时会被置为 `null`（`admin.ts:285`：`nextStatus === "published" ? existing.publishedAt ?? new Date() : null`）——即"下架再上架"会保留首次发布时间，但"切草稿"会丢掉发布时间。

### 4.4 `drizzle/` 15 个迁移的演进脉络

| # | 文件 | 变更内容 | 说明它做了什么决定 |
|---|---|---|---|
| 0000 | `0000_little_mordo.sql` | 建 `features(id,key,name,description,enabled)` + `features_key_idx` | 模板脚手架自带，与博客无关 |
| 0001 | `0001_black_retro_girl.sql` | 建 `user_sessions`、`users`（含各 UNIQUE 索引） | 认证底座 |
| 0002 | `0002_sparkling_blog_mvp.sql` | `users` 加 `role`/`status`；建 `posts`、`comments` | 博客 MVP，评论只支持文章 |
| 0003 | `0003_drop_features.sql` | `DROP TABLE IF EXISTS features`（仅 1 行，32 字节） | **第一次砍功能**：放弃"功能开关"模块 |
| 0004 | `0004_xhblogs_content.sql` | `posts` 加 `cover`/`tags`/`category`/`reading_time`/`frontmatter` + `posts_category_idx`；新建 `chatters`、`moments`、`pages`、`projects`、`photos`（5 张）；把 `comments` 重建为 `comments_new`（新增 `target_type`/`target_slug`/`parent_id`，`post_id` 改可空）并做数据搬迁（`LEFT JOIN posts` 回填 `target_slug`）、`DROP` 旧表、`RENAME`、重建 5 条索引 | 一次从 Halo 迁移内容模型：内容从"只有文章"扩成 5 类；评论从"只属于文章"升级为**多态目标** |
| 0005 | `0005_music_tracks.sql` | 建 `music_tracks`（`netease_id` UNIQUE + `cached_url`/`cached_at`/`cache_expires_at`/`level`） | 网易云音乐模块：靠服务端缓存播放地址 |
| 0006 | `0006_drop_chatter_photos.sql` | `DELETE FROM comments WHERE target_type='chatter'`；`DROP chatters`、`DROP photos` | **第二次砍功能**：说说 + 相册整体删除，并且**先清评论再删表**（因为那时评论表已无 FK 保护） |
| 0007 | `0007_disable_moment_comments.sql` | `DELETE FROM comments WHERE target_type='moment'`（1 行数据清理，无 DDL） | **关掉瞬间评论**：不删列、不改约束，只清数据——直接后果是 `target_type` 枚举值从 3 个收敛成 1 个，而 schema 里的 enum 也只留 `"post"`，历史语义只能靠这条 DELETE 记录 |
| 0008 | `0008_friend_links.sql` | 建 `friend_links` + `(status,sort_order)` 索引 | 友链模块 |
| 0009 | `0009_site_settings.sql` | 建单行 KV 表 `site_settings` | 真正的配置中心落地（此前配置散在 `src/config/seo.ts` 与前端默认值里） |
| 0010 | `0010_post_view_count.sql` | `posts` 加 `view_count`（默认 0） | 阅读量 |
| 0011 | `0011_nav_items.sql` | `CREATE TABLE IF NOT EXISTS nav_items` + 索引 + `INSERT OR IGNORE` **8 条**默认导航（含 `nav_music /music`） | 导航可配置化；注意它是**幂等写法**，与 `src/routes/navigation.ts:22-27` 的运行时建表完全重复 |
| 0012 | `0012_music_track_playlists.sql` | `music_tracks` 加 `playlist_id`/`playlist_name`/`playlist_cover` | 歌单支持 |
| 0013 | `0013_direct_music_urls.sql` | 建 `music_tracks_direct`，从 `music_tracks` 迁数据：`COALESCE(cached_url,'')` 作为 `url`，**没有 url 的记录 status 改成 `disabled`**；`DROP` 旧表 → `RENAME` → 重建索引 | 从"网易云 API + 服务端缓存"整体切换为"直链播放"，字段大幅简化（去掉 netease_id/cache_*/level） |
| 0014 | `0014_remove_music_module.sql` | `DROP TABLE IF EXISTS music_tracks`；`DELETE FROM nav_items WHERE id='nav_music' OR path='/music'` | **第三次砍功能**：音乐模块整体下线（对应 git 提交 `1653984 feat: remove music module`） |

**"砍功能"迁移说明了什么**：

1. 演进路径是**先堆后删**（模板带 `features` → 砍；Halo 导入带 `chatters`/`photos` → 砍；自建音乐模块两次重构 → 最终砍），不是"先设计边界再实现"。功能表的存在与否完全由业务心情驱动，`0014` 是 8 天前最后一次提交的产物，说明这套 schema 仍在剧烈变动期。
2. 删除方式一律是 `DROP TABLE` / `DELETE FROM`，**没有一条回滚脚本**、没有 down migration，也不留归档表。`0013` 甚至直接丢掉了整个网易云缓存列。
3. 枚举值只活在应用层（Drizzle `text(..., { enum })` 在 SQLite 里**不产生 CHECK 约束**，见 `drizzle/0002` 的 `users.role` 只是 `text DEFAULT 'user'`），所以"删功能"只能靠 `0006`/`0007` 那种数据美容；`target_type` 的三→一变迁就留下了不可见的语义债。
4. `0004` 的 `comments` 重建是唯一"有数据搬迁意识"的迁移（`INSERT INTO comments_new … SELECT … LEFT JOIN posts`），其余迁移都是纯加列/纯删表，说明作者只在"表结构不兼容"时才会写数据迁移。
5. 生活在 `nav_items` 里的默认导航被 0011 插入、被 0014 删除、又被 `src/routes/navigation.ts:12-20` 的代码常量重新 seed（且这份常量里已经**没有**音乐项）——**同一份默认值有两处真源**。

### 4.5 迁移账本的严重不一致（重点发现）

`drizzle/meta/` 实际只有 3 个文件：`_journal.json`(668B)、`0000_snapshot.json`(1665B)、`0001_snapshot.json`(6394B)。而 `_journal.json:6-33` 只登记了 4 条：`0000_little_mordo`、`0001_black_retro_girl`、`0002_sparkling_blog_mvp`、`0003_drop_features`。

结论：
- **`0002` 与 `0003` 没有 snapshot**，且 `0001_snapshot.json` 里仍然写着 `features` 表（即快照停留在 0001 的状态）。
- **`0004` ~ `0014` 这 11 个迁移完全没有进入 journal**，也没有任何 snapshot。
- 因此 `pnpm db:generate`（`drizzle-kit generate`）会以"0001 的快照"为基线去 diff 当前 `src/db/schema.ts`，生成一批**重复建表/重复建索引**的迁移（例如再建一次 `posts`、再建一次 `posts_slug_idx`），而 `pnpm db:check`、`db:studio` 同样基于这份过期元数据。
- 线上/本地能正常迁移是因为 `wrangler d1 migrations apply` 不读 `_journal.json`，只按 `migrations_dir` 内的文件名字母序执行并记录到 `d1_migrations` 表。**两套账本各走一条路**：wrangler 那份是对的，drizzle-kit 那份是坏的。

### 可复用要点

- 所有 ID 用 cuid2 文本主键，天然适合"前端生成 slug/ID + 服务端 upsert"的形态，也让 `nav_items` 能预置语义化 id。
- 用 `site_settings(key,value)` 单行 KV 装整站配置，是"只有一个站点"场景下最省事的方案（增字段不用迁移）。
- 迁移里保留 `CREATE TABLE IF NOT EXISTS` + `INSERT OR IGNORE` 的幂等写法（`0011`），对"可能在半初始化库上执行"的场景有帮助。
- `0004` 的表重建 + 数据搬迁 + 索引重建模板，是 SQLite（不支持 DROP COLUMN 老版本）改约束的标准套路，可以直接抄。
- 每条索引都显式命名，迁移与 schema 能一一对上。

### 问题/坑点

- drizzle-kit 元数据停滞在 0001（见 4.5），`db:generate`/`db:check`/`db:studio` 三条命令事实上不可用。
- 运行时自建表：`src/routes/siteConfig.ts:21-25` 与 `src/routes/navigation.ts:22-27` 会在请求路径上执行 `CREATE TABLE IF NOT EXISTS`，`getPublicNavItems` 每次请求还会先 `ensure + seed`（一次额外 SELECT）。DDL 混进读路径 + 与迁移文件重复定义一套 schema（**三处真源**：`drizzle/0011`、`navigation.ts` 的 SQL 字符串、`db/schema.ts`）。
- `posts.slug`、`users.github_id`、`users.api_key` 都有"UNIQUE 索引 + 同名普通索引"的冗余，写入放大且无收益。
- 没有分类/标签实体表：`tags` 是 JSON 字符串，无法按标签建索引、无法统计、无法重命名；`category` 是裸文本，改分类要全表 UPDATE。`admin.ts:200-209` 的 `post-taxonomy` 是**全表拉取 + JS 去重**。
- `comments.parent_id` 无自引用外键，也没有任何接口能创建回复（`src/routes/comment.ts:19-24` 接受 `parentId` 但 `post.ts:186-197` 的插入路径不传），楼层回复的抽象只做了半截。
- `comments.post_id` 可空 + `admin.ts:561-563` 用 `innerJoin(posts, ...)`，**孤儿评论（post 已删或 postId 为空）在后台列表里直接消失**，管理端看不见就删不掉。
- 秒级时间戳导致同秒排序不稳，且 `pages` 没有 `published_at`，前台的"更新时间"全靠 `updated_at`。
- `index.ts:71` 与 `admin.ts` 各处都新建 `drizzle(c.env.DB, …)` 实例（`index.ts:71,80`），没有统一复用；Drizzle 实例本身轻量，但与 `routes/api.ts` 的注入方式不一致。

---

## 5. API 设计

### 5.1 逐文件端点清单

#### `src/routes/auth.ts` → 挂载于 `/api/auth`

| 方法 | 路径 | 用途 | 鉴权 |
|---|---|---|---|
| GET | `/github` | 返回 GitHub 授权 URL + state，并 Set-Cookie | 公开 |
| GET | `/github/callback` | code 换 token、拉用户、upsert、建会话、返回 sessionToken | 公开（校验 state cookie） |
| GET | `/me` | 返回当前用户信息（含 apiKey） | Bearer |
| POST | `/logout` | 删除当前 session 行 | Bearer |
| POST | `/regenerate-key` | 重新生成 `users.api_key` | Bearer |

#### `src/routes/post.ts` → `/api/posts`

| 方法 | 路径 | 用途 | 鉴权 |
|---|---|---|---|
| GET | `/` | 文章列表（page/pageSize≤50），返回 `total` 与 `totalViews` | 公开 |
| GET | `/:slug` | 文章详情，**每次调用 `view_count = view_count + 1`**（`post.ts:83-87`） | 公开 |
| GET | `/:id/comments` | 某文章的 visible 评论（join users） | 公开 |
| POST | `/:id/comments` | 发评论：先校验文章 published → **调 AI 审核** → 入库（flagged 则 `hidden`） | Bearer |

#### `src/routes/comment.ts` → `/api/comments`

| 方法 | 路径 | 用途 | 鉴权 |
|---|---|---|---|
| GET | `/` | 按 `targetType=post` + `targetSlug` 查 visible 评论 | 公开（两个 query 必填） |
| POST | `/` | 同 post.ts 的评论创建（按 slug 定位目标 + AI 审核） | Bearer |
| DELETE | `/:id` | 删评论，仅作者本人或 admin（`comment.ts:150`） | Bearer |

> 与 `post.ts` 的评论接口**功能重叠**：同一件事有两个入口、两套 query 约定（`/posts/:id/comments` 用 id，`/comments` 用 slug），前端 `Comments` 组件用的是后者（`frontend/src/components/Comments.tsx:13,26`）。

#### `src/routes/content.ts` → `/api`

| 方法 | 路径 | 用途 | 鉴权 |
|---|---|---|---|
| GET | `/moments` | published 瞬间列表 | 公开 |
| GET | `/pages/:slug` | 单个已发布页面的 Markdown | 公开 |
| GET | `/projects` | published 项目 | 公开 |
| GET | `/friend-links` | published 友链 | 公开 |
| GET | `/search` | **全站搜索**：posts/pages/moments/projects/friends 各拉一批到内存里过滤（`content.ts:158-189`） | 公开 |
| POST | `/friend-links/apply` | 友链申请，直接 insert `status: "draft"` | **公开写接口，无限流** |
| GET | `/activity` | 最近 20 篇文章 + 20 条瞬间合并排序 | 公开 |

#### `src/routes/siteConfig.ts` → `/api`

| 方法 | 路径 | 用途 | 鉴权 |
|---|---|---|---|
| GET | `/site-config` | 返回站点配置，**`toPublicSiteConfig` 抹掉 `aiConfig.apiKey`** | 公开 |

#### `src/routes/navigation.ts` → `/api`

| 方法 | 路径 | 用途 | 鉴权 |
|---|---|---|---|
| GET | `/navigation` | enabled 导航项（先 ensure + seed） | 公开 |

#### `src/routes/utility.ts` → `/api`

| 方法 | 路径 | 用途 | 鉴权 |
|---|---|---|---|
| GET | `/test` | 连通性测试，返回 `喵！我能通！` | 公开 |
| POST | `/chat` | 用站点 AI 配置做一次对话（消息 ≤20 条、单条 ≤4000 字符） | Bearer + **admin** |
| GET | `/weather` | 和风天气转发（city lookup + now），需要 `QWEATHER_KEY` | 公开 |

#### `src/routes/admin.ts` → `/api/admin`（全部 `authMiddleware + adminMiddleware`）

| 分组 | 方法 | 路径 |
|---|---|---|
| 统计 | GET | `/stats`（7 张表 count，`Promise.all`） |
| 站点配置 | GET / PUT | `/site-config` |
| 导航 | GET / POST | `/nav-items` |
| 导航 | PATCH | `/nav-items/reorder` |
| 导航 | PATCH / DELETE | `/nav-items/:id` |
| 文章 | GET / POST | `/posts`（列表固定 page/pageSize，插入时查 slug 唯一） |
| 文章 | GET | `/post-taxonomy`（分类/标签全量去重） |
| 文章 | PATCH / DELETE | `/posts/:id` |
| 瞬间 | GET / POST | `/moments`；PATCH / DELETE `/moments/:id` |
| 项目 | GET / POST | `/projects`；PATCH / DELETE `/projects/:id` |
| 页面 | GET / POST | `/pages`；PATCH / DELETE `/pages/:id` |
| 友链 | GET / POST | `/friend-links`；PATCH / DELETE `/friend-links/:id` |
| 评论 | GET | `/comments`（join users + posts，分页） |
| 评论 | PATCH | `/comments/:id`（改 visible/hidden） |
| 用户 | GET | `/users`（分页） |
| 用户 | PATCH | `/users/:id/role`（不能移除自己 admin） |
| 用户 | PATCH | `/users/:id/status`（不能禁用自己） |

#### `src/routes/ai.ts` → `/api/ai`（全部 Bearer + admin）

| 方法 | 路径 | 用途 |
|---|---|---|
| POST | `/generate-summary` | 由 title+正文生成 80-150 字摘要 |
| POST | `/suggest-title` | 生成 1-5 个标题 |
| POST | `/chat` | 多轮对话，可带文章上下文 |
| POST | `/complete-post` | 一次补全 titles/slug/summary/category/tags（注入现有词库 + slug 唯一化） |
| POST | `/moderate-comment` | 评论审核判定（flagged/reason/suggestedStatus） |

**端点总数：59**（auth 5 + post 4 + comment 3 + content 7 + siteConfig 1 + navigation 1 + utility 3 + admin 30 + ai 5）。

### 5.2 `@hono/zod-openapi` 的实际用法

- **只有 `src/routes/auth.ts` 用了 `createRoute` + `.openapi()`**：5 个端点全部有 `summary`/`description`/`responses`（例如 `auth.ts:42-75` 的 `loginRoute`、`:121-145` 的 `meRoute`），`meRoute`/`logoutRoute`/`regenerateKeyRoute` 还声明了 `security: [{ BearerAuth: [] }]`。
- **另外 54 个端点全部是 `app.get/app.post/...` 普通注册**，没有 `request`/`responses` 声明。因此 `/api/doc`（`src/index.ts:43-49`）里能看到的只有 auth 那 5 个端点，`/doc` Swagger UI 展示的是一份**严重不完整的 API 文档**。
- 声明了 `BearerAuth` 却没有 `app.openapi` 注册同名 securityScheme，Swagger UI 上的锁图标是悬空引用。
- `OpenAPIHono` 主要被当成"路由容器 + `c.set` 类型携带"来用（`routes/api.ts:16-18` 的 Variables 声明），而不是文档工具。

### 5.3 `common/validators` 共享 schema 如何被前后端复用

| 文件 | 被谁用 | 复用效果 |
|---|---|---|
| `common/validators/auth.schema.ts` | 后端 `src/routes/auth.ts:4-10`（响应 schema + query schema）；前端 `frontend/src/pages/AuthCallbackPage.tsx:5,34,37`（直接 import 校验回调响应与用户信息） | **唯一真正端到端复用的地方**，前端还用 `z.infer` 取类型 |
| `common/validators/ai.schema.ts` | 后端 `src/routes/ai.ts:3-9`、`src/services/ai.ts:1-6`；前端**不复用**（`frontend/src/admin/adminApi.ts:41-63` 手抄了一套 `AiChatMessage`/`AiPostContext`/`AiCompletionField`/`AiCompletePostResponse`） | 半复用：类型重复定义 |
| `common/validators/blog.schema.ts` | 后端只用了 `CreateCommentSchema`（`src/routes/post.ts:6`）；`PostSchema`/`PostListResponseSchema`/`CommentSchema`/`PaginationQuerySchema` 等**无人使用**（死代码） | 复用率低 |
| `common/validators/admin.schema.ts` | 后端 `src/routes/admin.ts:6-24` 大量使用；前端**零复用**，`adminApi.ts` 的 `AdminPost`/`AdminMoment`/… 全是手写类型 | 半复用，且类型两边各自维护 |

三份文件里都各有一个同名的 `ErrorSchema`（`auth.schema.ts:3`、`blog.schema.ts:80`、`ai.schema.ts:79`），互不相关。

### 5.4 错误响应格式（三套并存）

| 格式 | 出现位置 | 例 |
|---|---|---|
| `{ code: number, message: string }` | 大多数业务路由 | `admin.ts:220`、`post.ts:80`、`comment.ts:35`、`ai.ts:63` |
| `{ success: boolean, message: string[, data] }` | auth 与部分写操作 | `auth.ts:258-265,400-419`、`comment.ts:156`、`admin.ts:147` |
| 纯文本 | Hono 默认 404（未注册路径）、`/api/test` 与 robots 等 text 响应 | `utility.ts:19` |

同一个 `GET /api/auth/me` 声明返回 `UserInfoSchema`，实际在失败分支返回 `{ code, message }`（`auth.ts:438,451,459`），**声明与实现不一致**。

### 可复用要点

- 用 `OpenAPIHono` + `createRoute` 时，"文档即测试用例"的价值很高（`auth.test.ts` 正是围绕这两个路由写的）；把 `security` 声明在路由上、把 response schema 复用给前端 `z.infer`，是天然的契约层。
- `common/validators` 目录的存在形态是对的：前后端各自 import 同一份 Zod schema，避免"前端校验一套、后端校验另一套"。
- 用 `safeParse` + 统一 400 文案（`ai.ts:62-63`）在业务层兜住非法输入，比全局中间件更易定位。
- 公开读接口全部只返回 published 数据（`content.ts:48,59,79,96`），状态过滤在 SQL 层完成，这一点比在 JS 里过滤更稳。

### 问题/坑点

- 54/59 的端点没有 OpenAPI 声明，`/doc` 严重失真——文档化收益几乎为零，却背了 `@hono/zod-openapi` 的复杂度。
- `BearerAuth` securityScheme 未注册。
- 三套错误格式 + 声明与实际不符的 `/me`，任何客户端都得为每个接口写特例。
- `GET /api/posts/:slug` 在读接口里写库（`post.ts:83-87`），无法缓存、写配额放大、且 ETag 场景下"304 也计数"。
- `POST /api/friend-links/apply` 是唯一匿名写接口，无验证码、无频率限制、无 IP 记录（`content.ts:256-270`），可被脚本刷满 `friend_links`（虽然落地为 `draft`）。
- `POST /api/comments` 在请求线程里同步调外部 LLM（`comment.ts:101-102`、`post.ts:182-183`），Worker 有 CPU/墙钟限制，且匿名刷评论会放大成对上游 LLM 的调用。
- `/api/search` 把 5 张表各拉 80~200 行到 Worker 内存里 `String.includes` 过滤（`content.ts:158-189`），没有 D1 FTS5、没有全文索引，数据量一涨就是 O(N) 全表扫 + 内存压力。
- `adminApi.post(id)`（`frontend/src/admin/adminApi.ts:157-162`）为了取一篇文章，先拉 100 条列表再本地 `find`——典型的"缺 GET /:id"导致的浪费。
- 路由前缀复用靠字符串 `"/"`（`src/routes/api.ts:31-35` 连挂 5 个子应用），冲突只能在运行时暴露。

---

## 6. 认证与权限

### 6.1 GitHub OAuth 完整流程（`src/routes/auth.ts`）

1. **前端发起**：`useAuth.login()` → `loginMutation`（`frontend/src/hooks/useAuth.ts:118-126`）→ `GET /api/auth/github`（无鉴权）。
2. **服务端生成 state**：`auth.ts:227` `const state = createId()`；`redirectUri = ${APP_BASE_URL}/auth/callback`（`:228`）；拼 `scope=user:email`（`:233`）；响应里返回 `authUrl + state`，并附带 `Set-Cookie: github_oauth_state=<state>; HttpOnly; Path=/; SameSite=Lax; Max-Age=600[; Secure]`（`:247`，`cookieOptions` 见 `:26-28`）。
3. **前端存 state 到 localStorage**（`useAuth.ts:35`）并跳转 GitHub（`:123`）。
4. GitHub 带 `code` + `state` 回调到 `redirect_uri`，即 **SPA 路由** `/auth/callback`（`frontend/src/routes.tsx:41` → `AuthCallbackPage`）。
5. **客户端先校验一次**：比对 URL state 与 localStorage（`AuthCallbackPage.tsx:24-30`），随后 `fetch('/api/auth/github/callback?code=…&state=…')`（`:33`，浏览器自动带上 state cookie）。
6. **服务端校验 state**：从 Cookie 读 `github_oauth_state` 与 query 比对，不等则 400 并清 cookie（`auth.ts:254-267`）。
7. **换 token**：`POST https://github.com/login/oauth/access_token`，body 带 `client_id/client_secret/code`，`Accept: application/json`（`:271-282`）；失败/无 `access_token` 一律 400（`:284-311`）。
8. **取用户**：`GET https://api.github.com/user`，`Authorization: token <access_token>`、`User-Agent: nekro-edge-template`（`:314-320`）；无 `id` 则 400。
9. **upsert 用户**：按 `github_id` 查（`:354`）；存在则更新 `username/email/avatarUrl/updatedAt`（`:360-371`）；不存在则 insert（`apiKey: generateUserApiKey()`，`:374-385`）。**首次注册的用户 role 是默认值 `user`**，不是 admin。
10. **建会话**：`sessionToken = createId()`（`:389`），`expiresAt = now + 30 天`（`:390`），insert `user_sessions`（`:392-396`）。
11. **返回**：JSON 含 `user{…, apiKey, role, status}` 与明文 `sessionToken`（`:400-419`），并清 state cookie（`:420`）。
12. **前端落地**：`localStorage.auth_token = sessionToken` + 直接 `queryClient.setQueryData(["auth","user"], user)`（`AuthCallbackPage.tsx:36-37`）。

### 6.2 会话凭证的存储与校验方式

**结论：不是 JWT，是"不透明随机串 + D1 会话表"。**

| 维度 | 实现 | 证据 |
|---|---|---|
| 凭证生成 | `createId()`（cuid2，24 字符，基于时间戳+指纹+SHA-3 派生，设计目标是 collision-resistant，**不是 CSPRNG、不可当密码学 token 使用**） | `auth.ts:389` |
| 服务端存储 | **明文**写入 `user_sessions.session_token`（无 hash、无盐） | `schema.ts:40`、`auth.ts:392-396` |
| 传输方式 | 响应体 JSON 返回 → 前端存 `localStorage` → 之后每个请求 `Authorization: Bearer <token>` | `auth.ts:415`、`useAuth.ts:41,80-84` |
| Cookie 用途 | **仅** OAuth state（600s，HttpOnly + SameSite=Lax + 生产 Secure） | `auth.ts:24-28,247` |
| 校验 | `and(eq(sessionToken), gt(expiresAt, new Date()))` → 查 users → `banned` 拒绝 → `c.set("user", user)` | `middleware/auth.ts:25-45` |
| 有效期 | 固定 30 天，无滑动续期、无上限、无轮换 | `auth.ts:390` |
| 撤销 | 只有 logout：`DELETE FROM user_sessions WHERE session_token = ?`（删当前一条）；无"退出全部设备"、无按用户批量撤销、无 admin 强制下线 | `auth.ts:479-491` |
| 绑定 | 不绑定 UA/IP/设备指纹；同一 token 可无限并发使用 | —— |

### 6.3 管理员判定与 `src/routes/admin.ts` 的守卫方式

- 判定只看一个字段：`user.role !== "admin"` → 403（`src/middleware/admin.ts:17-19`）。role 的值域是 `["user","admin"]`（`schema.ts:19`），默认 `user`。
- `admin.ts` 的守卫是**整个子应用一刀切**：`app.use("/*", authMiddleware, adminMiddleware)`（`admin.ts:37`）。没有例外清单，也没有资源级检查。
- 唯一的两处"自我保护"逻辑在用户管理里：不能把自己的 role 改成非 admin（`admin.ts:631-633`）、不能把自己 ban 掉（`admin.ts:658-660`）。**没有"最后一个 admin 不能被降级"的检查**——如果存在两个 admin，A 可以把 B 降级；如果只有一个 admin，他自己降不了（有上面的保护），所以不会把自己锁死，但也无法把权限交接给新账号后自我降级。
- **文章/页面/瞬间的写操作完全不看 `author_id`**（`admin.ts:250-292` 的 PATCH 直接按 id 更新，不校验 `existing.authorId === currentUser.id`）。当前只有一个 admin 所以无实际影响，但"作者"字段在这套权限下没有意义。
- 评论删除是**唯一**出现资源归属校验的地方：`comment.userId !== currentUser.id && currentUser.role !== "admin"` → 403（`comment.ts:150-152`）。

### 6.4 能力边界评价

| 能力 | 是否支持 | 说明 |
|---|---|---|
| 多用户注册 | 数据模型支持，产品上半支持 | `users` 无数量/白名单限制，任何 GitHub 账号登录都会建用户（`auth.ts:374-385`）；但登录后只能评论，非 admin 看不到后台（`frontend/src/pages/AdminPage.tsx:72-78` 只判 `user.role === "admin"`） |
| 多角色 / 细粒度权限 | **不支持** | 只有 `role` 二值，没有 permission 表、没有资源级 scope、没有"编辑 but 不能删"这类区分 |
| 多作者协作 | 不支持 | `posts.author_id` 存在且 NOT NULL，但后台任何 admin 都能改任意文章；没有草稿归属、没有审核流 |
| 权限审计 | 无 | 没有操作日志表、没有 `updated_by` 字段 |
| 凭证安全 | 弱 | token 明文入库、cuid2 当随机源、30 天固定有效、存在 localStorage（XSS 可窃取，MUI + `rehype-raw` 渲染 Markdown 的组合放大了 XSS 面，见第 12 节第 11 条） |
| API Key | **形同虚设** | `users.api_key` 全仓库只有三处使用：生成（`auth.ts:382`、`encryption.ts:10`）、读取返回（`auth.ts:410,471`）、再生成（`auth.ts:513-522`）。**没有任何中间件或路由用它做鉴权**，是死字段 + 泄露面（`/api/auth/me` 与登录响应里明文返回，且 `UserInfoSchema` 强制包含它，`auth.schema.ts:18`） |

一句话总结：这是一套**"单管理员自用"够用、"多人协作"必须重做**的鉴权模型。要升级到多角色，需要：role→permissions 映射表/位图、资源所有权字段与检查、token 哈希入库 + 轮换 + HttpOnly Cookie 会话、审计日志。

### 可复用要点

- OAuth `state` 用 **HttpOnly Cookie + 前端 localStorage 双重比对**（`auth.ts:254`、`AuthCallbackPage.tsx:24`），比只存在 localStorage 更抗 CSRF，成本几乎为零。
- state cookie 显式设置 `Max-Age=600` 并在成功/失败两条路径都清除（`auth.ts:265,420`），细节到位。
- 用户 upsert 用 `github_id` 做唯一键（`schema.ts:11`），天然幂等，重复登录不会建重复用户。
- 会话表独立于用户表，登出只删一行，比 JWT 无状态方案更容易做到"立即失效"。
- admin 守卫用"子应用级 `app.use('/*')`"，新增后台接口不会漏挂鉴权（除非作者另建子应用）。

### 问题/坑点

- `createId()`（cuid2）做 session token，不是加密安全随机数，长度 24 字符且含时间戳前缀——凭证空间弱于 `crypto.getRandomValues` 方案（对比：`encryption.ts:11-13` 的 apiKey 反而是正确做法，两处标准不统一）。
- token 明文入库：D1 数据一旦泄露（或被有读权限的协作者看到），所有会话可直接接管；应存 `sha256(token)`。
- 会话凭证存 `localStorage` 而非 HttpOnly Cookie，任何 XSS 都能直取 token；配合 `MarkdownView` 使用 `rehypeRaw`（`frontend/src/components/MarkdownView.tsx:55`），内容侧 XSS 的爆炸半径被放大。
- 30 天固定有效、无轮换、无批量撤销、无 `last_used_at`，无法做"异常会话清理"。
- `apiKey` 是未接入鉴权的死字段，却持续在 `/api/auth/me`、登录响应、`UserInfoSchema` 里暴露和传输。
- `github/callback` 把 `client_secret` 放在请求体里发给 GitHub（标准做法，但 `Accept: application/json` + `application/x-www-form-urlencoded` 的细节依赖 GitHub 容错），且**不校验 `tokenData.scope`**，`user:email` 被拒也照样登录（邮箱为 null）。
- 拉取邮箱只用 `github_user.email`（`auth.ts:365`），不调 `/user/emails`，隐私设置为私密邮箱的账号会永久拿到 `null`。
- 首个用户注册后 role 是 `user`，**没有任何"首位用户自动成为管理员"的引导**，部署完新库需要手工改库才能进后台（README 的部署步骤里也没写这一步）。
- `adminMiddleware` 不带认证能力，完全依赖挂载顺序；`auth.ts:434-478` 的 `/me` 甚至**自己复制了一遍 authMiddleware 的逻辑**而不是复用它 —— 两份实现将来必然漂移。

---

## 7. 内容模型

### 7.1 内容类型 → 表映射

| 业务概念 | 表 | 关键字段 | 归属/状态 |
|---|---|---|---|
| 文章 | `posts`（`schema.ts:52-86`） | title, slug(UNIQUE), summary, cover, tags(JSON), category, reading_time, view_count, frontmatter, content_md, status(draft/published), published_at, author_id | 有 `author_id` FK；草稿/已发布 |
| 页面 | `pages`（`:114-133`） | slug(UNIQUE), title, content_md, frontmatter, status(draft/published 默认 published) | **无作者、无发布时间** |
| 瞬间 | `moments`（`:88-112`） | slug(UNIQUE), content_md, location, images(JSON), frontmatter, status(默认 published), published_at | **无作者** |
| 项目 | `projects`（`:135-156`） | name, description, icon, github_url, tags(JSON), sort_order, status | 无作者 |
| 友链 | `friend_links`（`:158-178`） | name, description, url, avatar_url, sort_order, status | 无作者；`draft` 被复用为"待审核" |
| 评论 | `comments`（`:200-229`） | post_id, target_type(仅 post), target_slug, parent_id, user_id, content, status(visible/hidden) | 有 `user_id` FK；作者可自删 |
| 导航 | `nav_items`（`:180-198`） | label, path, sort_order, status(enabled/disabled) | 全局单实例数据 |
| 站点配置 | `site_settings`（`:231-237`） | key(PK), value(JSON 文本), updated_at | 全局单行 |
| （支撑）用户 | `users`（`:5-29`） | github_id, username, email, avatar_url, api_key, role, status | —— |
| （支撑）会话 | `user_sessions`（`:31-50`） | user_id FK, session_token, expires_at | —— |

### 7.2 关系与关联表

**外键一共只有 4 条**（全部 `ON DELETE CASCADE`，无 `ON UPDATE` 动作）：

| 从 | 到 | 位置 |
|---|---|---|
| `user_sessions.user_id` | `users.id` | `schema.ts:37-39` |
| `posts.author_id` | `users.id` | `:58-60` |
| `comments.post_id` | `posts.id` | `:206` |
| `comments.user_id` | `users.id` | `:210-212` |

- **没有** post↔tag 关联表、没有 `categories` 表、没有 post↔project 关系、没有 comment↔comment 自引用 FK。
- 标签与分类的落地方式：`posts.tags` 是 JSON 字符串（写入 `JSON.stringify`，读取 `parseJsonArray`，见 `admin.ts:39-51`、`content.ts:19-26`），`projects.tags`/`moments.images` 同理。**任何"标签"能力都是应用层字符串操作**：`admin.ts:200-209` 与 `src/routes/ai.ts:53-59` 各自实现了一遍"拉全表 → flatMap → Set 去重 → sort"。
- 评论的"多态目标"设计：`target_type`（应用层枚举，SQLite 无 CHECK）+ `target_slug`。`0004` 引入时支持 chatter/moment/post 三种，`0006`/`0007` 用 DELETE 把数据收敛到只剩 post，`schema.ts:207` 的 enum 也只剩 `["post"]`。**保留了多态的字段与索引，却只有一个取值**——为将来扩展留了位置，也留下了现在读不出来的历史语义。
- 级联删除的实际效果：删 `posts` 会级联删 `comments`（因为 `comments.post_id` FK），但**删 `moments`/`pages`/`projects` 不会清理任何东西**（`moments.images`/`pages.frontmatter` 是文本，无引用表）。

### 7.3 "站点配置"是怎么存的（重点）

**单行 KV 表 + 一个 JSON 列**，不是多列单行表，也不是多 key 分散存：

```
site_settings(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER)
唯一使用的 key = "siteConfig"           ← src/routes/siteConfig.ts:13
value = 整份 SiteConfig 对象的 JSON 序列化  ← admin.ts:89 (JSON.stringify(parsed.data))
```

- 读：`getSiteConfig(db)`（`siteConfig.ts:27-43`）→ 查 `key='siteConfig'` → `JSON.parse` → `normalizeSiteConfig`（逐字段兜底默认值，`frontend/src/config/siteConfig.ts:91-127`）。任何一层失败（表不存在 / 无行 / JSON 坏）都返回 `defaultSiteConfig`。
- 写：`PUT /api/admin/site-config`（`admin.ts:84-97`）→ `SiteConfigSchema.safeParse`（`common/validators/admin.schema.ts:125-157`）→ `ensureSiteSettingsTable`（运行时建表）→ `insert … onConflictDoUpdate`。
- 公开读：`GET /api/site-config` → `toPublicSiteConfig`（`frontend/src/config/siteConfig.ts:129-137`）把 `aiConfig.apiKey` 置空后返回。
- 配置内容（`SiteConfigSchema`）：站点文案（title/faviconUrl/authorName/bio/navTitle/navSuffix/navAfter/avatarUrl/bgImages[]/defaultPostCover）、social(7 个字段)、buildDate、footerBadges[]、icpConfig、friendLinkApplyFormat、**aiConfig(apiKey/baseUrl/model/systemPrompt/maxTokens/temperature)**。
- 同一张表还能装别的 key（设计上通用），但代码里只用了 1 个 key。
- 这套"配置即 JSON 单行"的副作用：`GET /api/admin/site-config` 返回**未脱敏的完整配置（含明文 apiKey）**给前端表单回填（`frontend/src/admin/SiteConfigManager.tsx:157`），而 AI key 就明文躺在这行 JSON 里。

### 可复用要点

- 内容表共享同一套"slug + status + 时间戳 + JSON 扩展列"骨架（pages/moments/projects/friend_links 肉眼几乎同构），新建内容类型时可以照抄模板，后台管理器（`frontend/src/admin/*Manager.tsx`）也高度同构，前端成本极低。
- `frontmatter` 列预留了"Halo 式元数据"的扩展位，导入外部内容时有用。
- 配置用单行 KV 的好处：加字段不需要迁移；`normalizeSiteConfig` 的"缺字段回退默认"让老配置能在新代码下继续跑。
- `toPublicSiteConfig` 把"内部配置"和"公开配置"显式分开，是一个值得保留的模式（只是实现上只抹了一个字段）。
- 评论的 `target_type + target_slug` 双字段（slug 冗余存一份）让评论查询不必 join 内容表，这是有意的反范式设计，读路径更快。

### 问题/坑点

- 没有分类/标签实体：无法做标签页 SEO、无法统计、无法批量改名；`posts.category` 是自由文本，改分类要全表 UPDATE；前台分类筛选靠前端 `posts(100)` 全量拉取后本地过滤（`frontend/src/pages/BlogListPage.tsx:23-45`）——**超过 100 篇内容后归档页会静默丢数据**。
- `moments`/`pages`/`projects` 无作者字段，将来做多人博客时无法归属。
- `pages` 没有 `published_at`，也没有 `excerpt`，sitemap 的 lastmod 只能退化用 `updated_at`（`src/utils/feed.ts:120`）。
- 配置的 JSON 单行：并发两个管理员同时 PUT 就是整体覆盖（last-write-wins），无版本号、无 diff、无审计；且**明文存 AI Key**（`site_settings.value`），与后台提示文案"仅在服务端加密保存"（`SiteConfigManager.tsx:157`）矛盾——仓库里没有任何加解密实现（`src/utils/encryption.ts` 只有 key 生成）。
- `draft` 状态被友链复用为"待审核"（`content.ts:266`），语义被混用；前台只显示 published（`content.ts:96`），后台需要人工切状态，没有"申请→审核"的流程字段（申请人/时间/理由）。
- `comments.target_type` 枚举只剩一个值、`parent_id` 没有创建入口、`target_slug` 与 `post_id` 双写（`post.ts:189-191` vs `comment.ts:105-109`）三者叠加，说明评论模型"设计成了多态、实现成了单态"。
- 级联删除不对称：删文章会连带删评论，删瞬间/页面不会清理任何引用数据。

---

## 8. AI 能力

### 8.1 配置从哪来

**来自站点配置表（D1），不是环境变量。**

- `env.example:17` 明确写着「AI 配置已迁移到后台「站点配置」页面」。
- 后端统一入口 `getSiteConfig(db)`（`src/routes/siteConfig.ts:27-43`）→ 取 `config.aiConfig`，所有 5 个 AI 接口与评论审核都是这么拿的（`ai.ts:66,81,96,111`、`utility.ts:22`、`post.ts:182`、`comment.ts:101`）。
- 配置字段与默认值（`frontend/src/config/siteConfig.ts:79-86`）：`baseUrl: https://api.openai.com/v1`、`model: gpt-4.1-mini`、`maxTokens: 150`、`temperature: 0.85`、`systemPrompt:` 一段"暹罗猫煤球"角色扮演提示词（`:35-36`）、`apiKey: ""`。
- 后台编辑界面：`frontend/src/admin/SiteConfigManager.tsx:157-162`（API Key 用 `type="password"`，但值会以明文从 `/api/admin/site-config` 回填）。
- 兜底：`moderateCommentWithConfig` 在 `apiKey` 为空时直接返回"不标记"（`services/ai.ts:253`）；`runChatWithConfig` 在缺 key 时抛 `AI 服务未配置 API Key`，路由层映射为 **503**（`ai.ts:34-41`）。

### 8.2 支持哪些 provider

**没有 provider 抽象，只有"OpenAI Chat Completions 兼容"一条路。**

- URL 拼接：`chatCompletionsUrl(baseUrl)` —— 去掉尾部斜杠，若已以 `/chat/completions` 结尾则原样使用，否则拼上（`services/ai.ts:34-37`）。
- 请求：`POST <url>`，`Authorization: Bearer <apiKey>`、`Content-Type: application/json`，body 为 `{model, max_tokens, temperature, messages}`（`:52-64`）。
- 响应解析：只认 `choices[0].message.content`（`:80`），非 JSON content-type 直接报错，错误体截断 500 字符（`:67-74`）。
- 因此：能接 **OpenAI / DeepSeek / Moonshot / 通义 / Ollama / vLLM / 任何 OpenAI 兼容网关**（改 baseUrl + model 即可）；**不支持** Anthropic Messages API、Gemini 原生、OpenAI Responses API、以及任何需要自定义鉴权头/额外参数的厂商。
- 没有流式（`stream: true` 从未出现），没有 function calling / JSON mode / structured outputs（结构化输出靠 prompt + 手工 `extractJson`）。
- 前端：`adminApi.aiChat` / `adminApi.completePost`（`frontend/src/admin/adminApi.ts:166-169`）都是普通 `fetch` + JSON，无 SSE、无打字机；`AdminPostEditorPage.tsx:167,180` 用 React Query mutation + `CircularProgress` 展示等待。

### 8.3 提示词如何组织

三种模式并存，**没有任何外部提示词文件或版本管理**：

| 模式 | 用在哪 | 内容 | 证据 |
|---|---|---|---|
| ① 站点配置提示词 + 上下文说明 | `chatWithConfig` | `system = [config.systemPrompt, context ? "你正在后台协助管理员撰写博客。回答应结合给定文章上下文；除非管理员明确要求，否则不要虚构事实。" : null].join("\n\n")`，再把文章上下文（标题/slug/摘要/分类/标签/正文）追加进 system | `services/ai.ts:88-110` |
| ② 硬编码编辑指令（要求纯 JSON） | `completePostWithConfig` | "你是专业中文博客编辑。只返回一个合法 JSON 对象…标题最多 3 个；摘要 80-150 中文字符；slug 必须是小写英文 ASCII 连字符；分类只给一个；标签最多 5 个。分类和标签优先复用现有词库" | `services/ai.ts:164-174` |
| ③ 硬编码单点指令 | `generateSummaryWithConfig`（"输出简洁摘要（80-150字），只返回摘要文本"）、`suggestTitlesWithConfig`（"输出 JSON 数组字符串"）、`moderateCommentWithConfig`（"返回 JSON：{flagged, reason}"） | `:203-220`、`:222-250`、`:252-273` |

- 上下文字符串直接模板拼接（`ChatMessage` 的 `system` 里塞整篇文章，最长 20000 字符由 Zod 限制，`common/validators/ai.schema.ts:5,28`）。
- 词库注入：`getTaxonomy(db)` 全表拉 `posts` 的 category/tags 去重排序（`ai.ts:53-59`），再截断为"分类前 100、标签前 200"塞进 user message（`services/ai.ts:170`）——这是这套 AI 里唯一的"业务知识注入"。
- 输出后处理：`extractJson` 支持 ```json 围栏或首尾大括号截取（`:112-117`）；`uniqueStrings` 去重+截断（`:119-124`）；`normalizeSlug` 做 NFKD 归一 + 非 ASCII 剔除（`:126-135`）；`makeUniqueSlug` 冲突时后缀 `-2…-9999`（`:137-151`）；字段缺失直接抛"AI 未生成有效字段：…"（`:192-199`）。

### 8.4 前端如何调用（流式 vs 非流式）

| 能力 | 前端调用点 | 方式 |
|---|---|---|
| 多轮问答 | `AdminPostEditorPage.tsx:180` → `adminApi.aiChat` → `POST /api/ai/chat` | 非流式，一次拿完整 `reply` |
| 字段补全 | `AdminPostEditorPage.tsx:167` → `adminApi.completePost` → `POST /api/ai/complete-post` | 非流式，返回 `{titles?,slug?,summary?,category?,tags?}`，客户端按勾选项回填 |
| 摘要 / 标题建议 | 后端有 `/api/ai/generate-summary`、`/api/ai/suggest-title` | **前端 adminApi 里没有对应封装**（`adminApi.ts` 只有 `aiChat`/`completePost`），属"接口存在但前端未接" |
| 评论审核 | 服务端自动：`post.ts:182-184`、`comment.ts:101-102`，用户侧不可见 | 同步阻塞在评论写入路径上 |
| 简易对话 | `POST /api/chat`（`utility.ts:21-47`，Bearer+admin） | 非流式；会做 `slice(-20)` 与长度校验，返回 `{reply, message}` 双字段（冗余） |

### 可复用要点

- "配置存 DB、接口只暴露脱敏版"（`getSiteConfig` + `toPublicSiteConfig`）让 AI key 不需要重新部署就能换，比环境变量更适合自建博客。
- 用 `baseUrl + model` 两个字段覆盖所有 OpenAI 兼容厂商，是成本最低的"多 provider"方案。
- `extractJson` + `uniqueStrings` + `normalizeSlug` + `makeUniqueSlug` 这套输出后处理链，是"让 LLM 返回结构化数据"时最实用的防御层：不信任模型、只信任自己的归一函数。
- `completePost` 只返回"请求的字段"并逐字段校验（`missing` 检查，`:192-199`），避免了"模型多写字段污染表单"。
- 审核能力降级放行（`:270-273`）而不是阻塞评论，是产品上正确的取舍。

### 问题/坑点

- **无流式**：长文本补全时用户只能看 loading；Worker 的墙钟限制也会成为硬约束。
- 提示词散在代码字符串里（`services/ai.ts:99,164-166,209,229,262`），改提示词要改代码重新部署；站点配置里的 `systemPrompt` 只影响 `chat`/`/api/chat` 两条路径，**`completePost`/`suggestTitle`/`moderate` 完全无视它**——管理员在后台改"系统提示词"会以为全局生效。
- AI key 明文存在 `site_settings.value`，且 `GET /api/admin/site-config` 全量回传（第 7 节）。
- `max_tokens` 默认 150（`siteConfig.ts:84`）对"整篇文章 + 5 个字段"的补全明显偏小，模型输出极易被截断，然后抛出"AI 未生成有效字段"这类误导性错误。
- 评论审核是**同步阻塞**且对匿名接口开放（`comment.ts:101`），可被恶意刷成"每个评论一次外部 LLM 调用"的成本放大器；`moderateCommentWithConfig` 的 catch 只是 `console.warn`（`:271`），失败静默放行，无指标无告警。
- `generateSummaryWithConfig`/`suggestTitlesWithConfig` 有接口无前端，`/api/chat` 与 `/api/ai/chat` 功能重叠（两套消息校验规则：`utility.ts:31-38` 与 `ai.schema.ts:17-34`）。
- 没有 token 用量统计/成本记账，没有超时与重试（`fetch` 无 `AbortSignal.timeout`，`:52-64`），上游挂起会一直占着 Worker。

---

## 9. 前端结构

### 9.1 `frontend/src` 各目录职责

| 路径 | 职责 | 关键文件 |
|---|---|---|
| `entry-client.tsx` | CSR 入口：`createRoot` + `QueryClient`(staleTime 5min/gcTime 10min) + `SiteConfigProvider` + `AppThemeProvider` + `BrowserRouter` + `AppRoutes`；含 react-router CJS interop hack | `entry-client.tsx:12-41` |
| `entry-server.tsx` | SSR 入口：`render(path)` → `renderToString`（`StaticRouter`），QueryClient `staleTime: Infinity`，**无数据预取** | `entry-server.tsx:15-39` |
| `routes.tsx` | **唯一**路由表（客户端与服务端共享），13 条路由，含 `:slug` 兜底 | `routes.tsx:27-44` |
| `App.tsx` | 全局外壳：header/主导航/移动抽屉/账户菜单/页脚/skip-link；`navigation` 查询；`document.title` 与 favicon 覆写；`body.admin-mode`；Cmd/Ctrl+K 跳搜索 | `App.tsx:31-233` |
| `pages/`（12 文件） | 前台页面 + 两个后台页面 | 见 9.2 |
| `admin/`（13 文件） | 后台全部模块与 API 封装 | 见 9.3 |
| `components/`（10 文件） | 展示组件：`Glass`(SectionPanel 玻璃卡片)、`Layout`(PublicPageLayout/CenteredStateLayout/AdminWorkspaceLayout)、`MarkdownView`、`Comments`、`Footer`、`SearchBar`、`HomeBento`、`BackgroundEffects`、`Loading`、`ToggleThemeButton` | `components/*.tsx` |
| `context/` | `SiteConfigProvider`（拉 `/api/site-config`，失败回退 `defaultSiteConfig`）、`ThemeContextProvider`（`localStorage.themeMode` + `document.documentElement.dataset.theme` + MUI ThemeProvider） | `context/SiteConfigProvider.tsx:12-31`、`context/ThemeContextProvider.tsx:20-61` |
| `hooks/` | `useAuth`（登录/登出/当前用户/`fetchWithAuth`/跨标签页同步），仓库里唯一的自定义 hook | `hooks/useAuth.ts:96-208`（末尾还有 3 行 `console.log` 调试残留，`:189-195`） |
| `services/` | 前台只读 API 封装 `contentApi` + 手写 `normalizeTags` + 全部领域类型 | `services/content.ts:131-142` |
| `theme/` | MUI 主题工厂（light/dark）+ 通过 module augmentation 扩展 4 个自定义 theme token | `theme/index.ts:8-230`、`theme/types.ts:3-29` |
| `config/` | `siteConfig.ts`（默认站点配置 + normalize + toPublic，**被后端 import**）、`navigation.ts`（前端硬编码的 `defaultNavItems`，与后端 `routes/navigation.ts:12-20` 重复） | `config/siteConfig.ts`、`config/navigation.ts` |
| `utils/` | `storage.ts`：`safeLocalStorage`（SSR 安全）+ `isBrowser` | `utils/storage.ts:1-42` |
| `assets/logos/` | 内联 SVG logo 组件集合 | `assets/logos/index.tsx`(6.2KB) |
| `frontend/src/prototype.css` | **92.5KB** 全局类名样式体系（`page-shell`/`feature-card`/`admin-shell`/`chip`/`note-row`…），与 MUI 主题、UnoCSS 三套并存 | `prototype.css` |

### 9.2 后台有哪些页面模块（`frontend/src/admin` 逐个）

| 文件 | 导出/职责 | 说明 |
|---|---|---|
| `adminApi.ts` (8.2KB) | `adminApi` 全部后台 HTTP 方法（40+ 个）+ 所有 `Admin*` 类型 + `splitLines`/`joinLines` | 后台唯一网络层；`post(id)` 靠拉 100 条本地 find |
| `AdminLayout.tsx` | `AdminSection` 联合类型、`adminSections`（10 个模块的 key/title/icon）、侧边栏 + 顶栏布局 | `AdminLayout.tsx:5-28` |
| `AdminDashboard.tsx` | 仪表盘：7 个统计卡（来自 `/api/admin/stats`）+ **硬编码的活动流假数据**（`AdminDashboard.tsx:20-25`，`"12 分钟前"` 等写死在代码里） | |
| `AdminPrimitives.tsx` | 复用原件：`PublishStatusField`、`MarkdownEditor`（编辑/预览切换）、`EntityDialog`、`AdminToolbar`、`StatusChip`、`StateBlock`（loading/error/empty 三态） | 后台一致性的关键文件 |
| `PostManager.tsx` | 文章列表 + 搜索 + 删除；新建/编辑跳到 `AdminPostEditorPage` | 用 `Link` 跳独立页面而非弹窗 |
| `MomentManager.tsx` | 瞬间 CRUD（弹窗），slug 自动生成，images 用 textarea 按行拆 | 调用 `createMomentSlug()` |
| `momentSlug.ts` / `momentSlug.test.ts` | `moment-${createId().slice(0,8)}` 与其单测 | 前端唯一被单测覆盖的工具函数 |
| `PageManager.tsx` | 独立页面 CRUD（slug/title/contentMd/status） | |
| `ProjectManager.tsx` | 项目 CRUD（tags textarea、sortOrder、icon、githubUrl） | |
| `FriendLinkManager.tsx` | 友链 CRUD | |
| `NavigationManager.tsx` | 导航 CRUD + **`@dnd-kit` 拖拽排序**（`DndContext`/`SortableContext`/`useSortable`）→ `PATCH /nav-items/reorder` | 后台最复杂的交互 |
| `ReviewManagers.tsx` | `CommentManager`（visible/hidden 切换）+ `UserManager`（role/status 修改） | 两个模块合在一个文件 |
| `SiteConfigManager.tsx` | 站点配置表单：文案、社交、背景图（按行）、footer badges（JSON 文本域）、备案、友链申请模板、**AI 配置 6 个字段** | `SiteConfigManager.tsx:157-162` |

后台还有一个位于 `pages/` 的模块：`frontend/src/pages/AdminPostEditorPage.tsx`（**24.8KB，全仓库最大的组件**：文章表单 + 封面 + AI 问答面板 + 字段补全 + Markdown 预览 + 状态切换），以及 `frontend/src/pages/AdminPage.tsx`（后台壳：`isLoading` → 校验 `user?.role !== "admin"` → 渲染 `AdminLayout` + `renderSection`）。

### 9.3 RSR 与 SSR 的取舍（entry-client / entry-server）

仓库里叫"SSR"，实现上是 **renderToString 的"外壳 SSR"**：

| 维度 | 现状 | 证据 |
|---|---|---|
| 服务端做了什么 | 只 `renderToString(<Providers><StaticRouter><AppRoutes/></StaticRouter></Providers>)` | `entry-server.tsx:25-37` |
| 数据预取 | **没有**。QueryClient 每次新建且空，`staleTime: Infinity` 只是防止重复请求，没有 `prefetchQuery`、没有 `dehydrate/hydrate` | `entry-server.tsx:16-23`，`entry-client.tsx:16-23` 也没有 `hydrate` |
| 站点配置 | SSR 时 `SiteConfigProvider` 的 `useState(defaultSiteConfig)` 生效（`useEffect` 在服务端不跑），所以**SSR HTML 里的标题/头像/社交链接全是硬编码默认值**，hydrate 后才被 `/api/site-config` 覆盖 | `context/SiteConfigProvider.tsx:13-27` |
| 主题 | SSR 固定 `dark`（`useState` 初始化时 `!isBrowser → "dark"`），客户端按 localStorage 切换，会造成一次主题闪烁 | `ThemeContextProvider.tsx:21-33` |
| 文档标题 | SSR 用 `src/config/seo.ts` 的静态映射；客户端 `App.tsx:55-64` 用 `useEffect` 覆写成 `siteConfig.title`，**两套标题来源** | `App.tsx:55-64` |
| 交互/浏览器 API | `useEffect` 全部不在服务端执行，所以 `document.*`、`localStorage` 的调用天然安全（`App.tsx:56-63`、`storage.ts:2`） |  |

取舍建议（面向重做）：当前形态是"付了 SSR 的成本（`dist/server` 构建、`ssr.noExternal` 配置、CJS interop hack、Worker 里动态 import、失败兜底 HTML），只换到"外壳 HTML"的收益"。两条可行路线——(a) **退回纯 SPA**：删掉 `entry-server`/`dist/server`/`build:server`，`index.ts` 的 catch-all 只返回 `dist/client/index.html`，省掉全部复杂度；(b) **做真 SSR**：在 Worker 侧用 drizzle 直取数据、`prefetchQuery` + `dehydrate` 注入 `window.__DATA__`，并让 `generateHtmlTemplate` 接受 per-page 的 title/description/og:image。当前这套既不是 (a) 也不是 (b)。

### 9.4 MUI 主题定制点（`frontend/src/theme/index.ts`）

| 定制层 | 内容 |
|---|---|
| `palette` | mode；primary（main/light/dark/contrastText，dark 用 `#aab6ff`、light 用 `#5f6fdd`）；secondary（`#ff8fae`/`#d94778`）；background.default（`#08101f`/`#dbe8ff`）与 paper（rgba 半透明，配合玻璃拟态）；text.primary/secondary；divider；success/warning/error/info 四个状态色按模式分套 |
| 自定义 token（module augmentation） | `pageBackground`、`appBar.background`、`glass.background`、`hero.background`（`theme/types.ts:4-28` 扩展 Theme/ThemeOptions） |
| `shape.borderRadius` | 18 |
| `typography` | `displayFont`（SF Pro Rounded/Outfit/PingFang SC）与 `bodyFont`（Plus Jakarta Sans/PingFang SC）双字体栈；h1-h6 各自字重 800-900 与负字距（-0.045em ~ -0.015em）；body1/body2 行高 1.78/1.68；overline 大写字距 0.14em；button `textTransform: none` + 字重 800 |
| `components`（9 个槽） | `MuiCssBaseline`（smooth scroll、body 底色、`::selection`、细滚动条样式、`prefers-reduced-motion` 降级）、`MuiPaper`/`MuiCard`（禁用渐变背景）、`MuiButton`（disableElevation + 12px 圆角 + 渐变主按钮）、`MuiIconButton`（1px 边框 + 玻璃模糊）、`MuiOutlinedInput`（13px 圆角 + focus 光环）、`MuiChip`（999 圆角 + 字重 750）、`MuiDialog`（24px 圆角 + 32px blur）、`MuiTableCell`（表头大写小字）、`MuiAlert` |

另外：`frontend/uno.config.ts` 用 `presetUno + presetIcons`，并 `blocklist: ["sr-only"]`（注释说明 UnoCSS 的 a11y 属性与 MUI 冲突，`uno.config.ts:11-14`）；`@unocss/reset` 作为依赖存在但入口里未 import（`entry-client.tsx:5-6` 只 import 了 `uno.css` 与 `prototype.css`）。

### 可复用要点

- **单一路由表 + 两个入口**（`routes.tsx` 被 client/server 共享）是 RSR 的最小可行结构，加路由只改一处。
- 移动端与桌面端共用一套 DOM（CSS 控制显隐），`App.tsx` 里的抽屉/导航逻辑一次成型，没有维护两套导航。
- 后台模块高度同构：每张表都是"React Query query + 3 个 mutation + `invalidateQueries` + `EntityDialog` 表单"（`FriendLinkManager.tsx:19-24` 等），新增实体几乎零学习成本；`Status`/`PublishStatusField` 把 draft/published 的 UI 统一了。
- 用 `@dnd-kit` 做排序并只提交 id 数组（`ReorderNavItemsSchema`），交互与接口都很干净。
- MUI 的 `components` 层集中定制（9 个槽）+ 4 个自定义 token，让"玻璃拟态 + 霓虹渐变"的视觉语言能跨页面一致。
- `safeLocalStorage` + `isBrowser` 这一对工具函数（`utils/storage.ts`）让同一个组件在 SSR 与 CSR 下都安全，是 RSR 项目的必备件。

### 问题/坑点

- SSR 数据不预取而 `SiteConfigProvider` 在服务端只能用默认值 → **SSR HTML 里的站点名/头像/链接是硬编码的 `运阳的小窝`**，任何换站名的部署都会在首屏闪一次旧文案；同时"服务端渲染标题、客户端覆盖标题"两套来源互相打架。
- `useAuth` 里保留 `console.log`（`useAuth.ts:148,189-195`），生产控制台噪声。
- 样式三源并存：`prototype.css`(92.5KB 全局类) + MUI 主题 + UnoCSS，命名与优先级不可控，`!important` 与类名冲突会随页面增长而累积。
- `AdminPage` 的权限判断只在客户端（`AdminPage.tsx:72-78`），且 `/admin` 路由本身在 SSR 里也会渲染——未登录时服务端返回的是"正在验证管理员身份…"，HTTP 200，无任何服务端拦截。
- `App.tsx` 的导航项做了一次硬编码过滤：`configured?.label === "归档" ? "文章" : ...`（`App.tsx:50`），并且 `navItems` 从 `prototypeNavigation`（6 项写死）派生（`:22-29`、`:46-53`）——**后端可配置导航在这里被按 path 白名单裁剪**，后台新增的导航项（只要 path 不在那 6 个之内）在前台永远不出现。这与"导航栏可配置"的产品目标直接冲突。
- `navigation.ts`（前端默认值）与 `routes/navigation.ts`（后端默认值）两份 `defaultNavItems` 内容还不完全一致（前端 7 项 vs 后端 7 项但字段集不同），改一处漏一处。
- `AdminDashboard` 的活动流是假数据（`AdminDashboard.tsx:20-25`），趋势数字（`+12%`）也是硬编码（`:14-16`），容易误导。
- 归档页固定 `contentApi.posts(100)`（`BlogListPage.tsx:23`），第 101 篇起静默消失。
- `AuthCallbackPage` 的失败分支完全静默（`AuthCallbackPage.tsx:40-42` 空 catch），登录失败没有任何提示。

---

## 10. 图片与静态资源

### 10.1 结论

**没有任何上传能力。没有 R2、没有媒体库、没有图床代理；所有"图片"字段都是 `text` 列里的 URL 字符串，指向外部地址或 `frontend/public` 里的静态文件。**

### 10.2 证据链

| 检查项 | 结果 | 证据 |
|---|---|---|
| R2 绑定 | **不存在** | `wrangler.jsonc` 只有 `assets` 与 `d1_databases`，无 `r2_buckets`/`kv_namespaces` |
| 上传接口 | **不存在** | `src/routes/*.ts` 里没有任何 `POST` 接收文件的端点；全仓库 grep `multipart`/`FormData`/`upload`/`BUCKET`/`图床`/`媒体库` 在 `src/`、`frontend/` 内**零命中**（唯一命中是 `pnpm-lock.yaml` 里的 base64 哈希串） |
| 文件类型声明 | 无 | `src/types.ts:1-10` 只有 `DB`/`ASSETS`/两个 OAuth 变量/`APP_BASE_URL`/`QWEATHER_KEY` |
| 图片字段的列类型 | 全部 `text` | `posts.cover`（`schema.ts:64`）、`users.avatar_url`（`:14`）、`moments.images`（`:97`，JSON 数组文本）、`friend_links.avatar_url`（`:167`）、`projects.icon`（`:143`）、`site_settings.value` 里的 `faviconUrl`/`avatarUrl`/`bgImages[]`/`defaultPostCover` |
| 校验规则 | 只做字符串长度 | `cover: z.string().trim().max(1000)`（`admin.schema.ts:32`）、`images: z.array(z.string().trim().min(1).max(1000)).max(20)`（`:54`） |
| 前端录入方式 | 纯文本输入框 | 封面是受控 `TextField`（`frontend/src/pages/AdminPostEditorPage.tsx:562`，预览用 `<img src={form.cover}>` at `:374-379`）；瞬间图片是 textarea 按行拆分（`adminApi.splitLines`，`MomentManager.tsx:15` 的 `imagesText`） |
| 默认图片来源 | 外部随机图 API | `bgImages: ["https://dmoe.cc/random.php"]`、`defaultPostCover: "https://dmoe.cc/random.php"`（`frontend/src/config/siteConfig.ts:50-54`）；头像用 GitHub CDN（`:48`） |
| 本地图片资源 | 仅 `frontend/public/` 4 个文件 | `luyblog-icon.svg`(1.2KB)、`logo.png`(773KB)、`moment-lustopia.jpg`(4.8KB)、`anime-night-studio.png`(2.19MB)；引用点如 `HomePage.tsx:29` 的 `"/anime-night-studio.png"` 与 `htmlTemplate.ts:87` 的 `/luyblog-icon.svg` |
| 图床/媒体库页面 | 不存在 | 后台 10 个模块（`AdminLayout.tsx:17-28`）里没有"媒体/图库" |

### 10.3 后果与正确做法

后果：
- 外链图床一旦防盗链/改域名/下线，全站封面与背景同时失效，且没有本地备份；
- `dmoe.cc/random.php` 每次请求返回不同图片，导致**同一张卡片刷新后换图**，无法 CDN 缓存、无法预加载、SEO/OG 图片不稳定；
- 2.19MB 的 `anime-night-studio.png` 与 773KB 的 `logo.png` 直接进构建产物，且路径是 `/anime-night-studio.png` 这种**无 hash、非 `/assets/`** 的形式，绕过了 Vite 的缓存指纹策略，每次部署都要靠 `max-age` 短的默认缓存重新拉取；
- 用户上传诉求（例如给瞬间配图）只能靠手填外链，体验与合规都不受控。

正确做法：加 R2 桶 + 一个 `media` 表（`id/key/mime/size/width/height/uploader/created_at`），上传走"签名的 R2 直传 URL"或 Worker 内 `putObject`（注意 Workers 请求体大小限制，大图建议直传），内容表只存 `mediaId`，读取时拼 CDN 域名；同时启用 Cloudflare Image Resizing 做 `?width=` 变体，并在 R2 前挂 Cache Rule。

### 可复用要点

- 用"URL 字段"存图片的好处是零存储成本、外部图床随便换，适合纯个人博客初期（本项目就是这个阶段）；
- 把 `frontend/public/` 当"少量品牌资源仓"（logo、favicon、默认背景）是合理用法，配合 `assets.directory` 可直接被平台托管；
- `images` 用 JSON 数组文本 + `splitLines/joinLines` 的编辑方式（多行文本 ↔ 数组），在"没有上传组件"时是最省事的折中。

### 问题/坑点

- 完全没有上传链路（第 10.2 节全表），任何"给瞬间配图"的操作都要去别处拿外链。
- 随机图 API 当默认封面/背景（`siteConfig.ts:51,54`）破坏缓存与视觉稳定性，且是外部依赖单点。
- 大体积 PNG 直接落在无 hash 的根路径（`frontend/public/anime-night-studio.png` 2.19MB），不会被 `assets/` 的 immutable 缓存策略覆盖。
- 图片字段没有 URL 协议白名单校验（`max(1000)` 而已），`javascript:`/`data:` 之类不会被拒绝；虽然 React 会转义属性，但后台预览 `<img src={form.cover}>`、Markdown 里 `rehypeRaw` 渲染的 `<img>` 都不做过滤。
- 没有图片尺寸/体积约束（前端 `<img>` 无 `width/height`，`MarkdownView` 只给 `maxWidth: 100%`），CLS 与流量全靠运气。

---

## 11. SEO 与订阅

### 11.1 `generateHtmlTemplate` 生成的 HTML 模板包含什么

`src/utils/htmlTemplate.ts:26-98`，逐项：

| 类别 | 内容 |
|---|---|
| 基础 | `<!DOCTYPE html>`、`lang`（由 `seoConfig.language` 的 `_`→`-` 得到，即 `zh-CN`）、`<meta charset>`、`<meta name="viewport">` |
| 标题/描述 | `<title>`、`description`、`keywords`、`author`、`robots=index, follow`、`language` —— 全部由 `src/config/seo.ts:79-99` 按 **path** 生成 |
| Open Graph | `og:type=website`、`og:url`、`og:title`、`og:description`、`og:image`（= `siteUrl + ogImage`，而 `ogImage` 是空串 → **退化成站点根 URL**）、`og:image:width=1200`、`og:image:height=630`、`og:site_name`、`og:locale` |
| Twitter | `twitter:card=summary_large_image`、`twitter:url/title/description/image`、`twitter:site`（仅当配置了 handle，本仓库未配，`seo.ts` 无 `twitterHandle` 字段值） |
| 其他 | `<link rel="canonical">`、`<link rel="alternate" type="application/rss+xml" href="{siteUrl}/rss.xml">`、`theme-color`、`application-name`、`apple-mobile-web-app-title`、`msapplication-TileColor` |
| 结构化数据 | 一段 JSON-LD：`@type: WebSite` + `potentialAction: SearchAction`（`urlTemplate: {siteUrl}/search?q={search_term_string}`） |
| 图标 | `<link rel="icon" type="image/svg+xml" href="/luyblog-icon.svg">` |
| 注入点 | `cssFiles` → `<link rel="stylesheet" crossorigin>`；`<div id="root">${content}</div>`；`jsFiles` → `<script type="module" crossorigin>`（`htmlTemplate.ts:90-96`） |

注意模板是**纯字符串拼接**，没有对 `title`/`description` 做 HTML 转义（内容来自 `src/config/seo.ts` 的静态常量，目前无注入风险，但 `keywords` 一旦改为来自 DB 就会变成 XSS 面）。

### 11.2 订阅与爬虫文件的实现状况

| 能力 | 是否实现 | 位置与细节 |
|---|---|---|
| `robots.txt` | **已实现**（动态） | `src/index.ts:60-66` 调 `generateRobotsTxt()`（`htmlTemplate.ts:104-128`）：`Allow: /` + `Sitemap: {siteUrl}/sitemap.xml` + Googlebot/Bingbot/Slurp 白名单 + `Disallow: /api/ /_worker.js /dist/` + `Crawl-delay: 1`；`Cache-Control: max-age=86400` |
| `sitemap.xml` | **已实现**（动态、查库） | `src/index.ts:69-76` → `src/utils/feed.ts:69-158`：静态页来自 `seoConfig.pages`（只有 `/` 与 `/blog` 两条）＋ `posts`(published, ≤1000) ＋ `pages`(published, ≤300) ＋ `moments`(published, 只取 1 条，产出单条 `/moments`)，`loc` 去重后输出 `urlset`；`Cache-Control: max-age=86400` |
| RSS/Atom feed | **已实现**（动态） | `src/index.ts:78-88`，`/rss.xml` 与 `/feed.xml` 双入口 → `feed.ts:187-215`：RSS 2.0 + `atom:link rel=self`，条目取 `posts`(published) 前 50，含 `title/link/guid(isPermaLink)/description/pubDate/category[]`，description 是 `summary || contentMd` 经 `stripMarkdown` 后截 220 字符；`Cache-Control: max-age=3600` |
| HTML 里的 feed 声明 | **已实现** | `htmlTemplate.ts:61` 的 `rel="alternate" type="application/rss+xml"` |
| 文章级动态 meta（title/description/og:image） | **没有实现** | `generateHtmlTemplate` 只按 path 查 `seoConfig.pages`（`seo.ts:58-73` 只定义了 `/` 与 `/blog`），`src/index.ts:151-156` 传入的只有 `pathname/content/cssFiles/jsFiles`，**没有把文章数据传进模板** |
| 文章级 JSON-LD（Article/BlogPosting/BreadcrumbList） | **没有实现** | 只有 `htmlTemplate.ts:68-84` 的 `WebSite` 一段 |
| 分页 `rel=prev/next`、canonical 到真实分页 | **没有实现** | —— |
| sitemap index / 分片、`lastmod` 用真实更新时间 | 部分实现 | `feed.ts:104-109` 的静态页 `lastmod: new Date()`（每次生成都是"今天"）；posts/pages 用真实时间（`:114,120`） |
| `generateSitemapXml()`（`htmlTemplate.ts:133-159`） | **死代码** | 与 `feed.ts:135` 的 `generateDynamicSitemapXml` 功能重叠，`src/index.ts:70` 只用后者；前者仅遍历静态页，是历史遗留 |
| robots/sitemap 排除后台 | 部分 | robots 只 `Disallow: /api/`，`/admin` 未排除（但 `/admin` 在 SSR 下返回 200 + "正在验证管理员身份"，会被爬虫索引） |

### 11.3 关键缺口及其机制性原因

1. **`/blog/:slug` 的 meta 与 sitemap 不匹配**：sitemap 里正确列出了每篇文章 URL（`feed.ts:112-117`），但页面 HTML 的 `<title>`/`description` 来自静态映射，`/blog/:slug` 匹配不到 → 回退成 `seoConfig.title | siteName`（`seo.ts:81`），所有文章页 SEO 标题完全相同。
2. **客户端覆盖标题**：`App.tsx:55-64` 的 `useEffect` 把 `document.title` 设成 `siteConfig.title`，连 SSR 给的静态标题都会被抹成站点名。
3. **OG image 失效**：`ogImage: ""`（`seo.ts:54`）→ `og:image` = `https://blog.lyuy.top`（`htmlTemplate.ts:45`），分享卡片无图。
4. **`/moments` 无个体 URL**：瞬间没有独立可抓取页面（`feed.ts:124-129` 只产出 `/moments` 一条），搜索里 moment 的 `url` 也是 `/moments`（`content.ts:223`）。

### 可复用要点

- 把 SEO 集中到一个纯数据文件（`src/config/seo.ts`）+ 一个纯函数模板（`src/utils/htmlTemplate.ts`），构建期（`scripts/generateHtml.ts`）与运行期（`src/index.ts:146`）共用，避免模板分叉——这个结构值得照抄。
- 订阅三件套（robots/sitemap/rss）全部是**查库动态生成**并带 `Cache-Control`（86400/86400/3600），比静态文件更贴合 CMS（发新文即出现在 sitemap，无需重新部署）。
- `feed.ts` 里的 `xmlEscape`/`stripMarkdown`/`excerpt`/`safeJson` 四个小工具（`:30-63`）是生成 RSS 时必备的清洗链，直接可用。
- sitemap 用 `Set` 对 `loc` 去重（`feed.ts:137-143`），避免静态页与动态页撞车。

### 问题/坑点

- 文章级 meta 完全缺失（第 11.3 节第 1-2 条），对一个"内容站"来说这是最贵的一处缺口；修复点在 `src/index.ts:134-156`（把渲染 + 数据查询合并）与 `src/config/seo.ts`（改为接受动态页信息）。
- `og:image` 恒等于站点根 URL；`og:title/description` 对所有文章相同。
- `generateSitemapXml` 死代码与 `generateDynamicSitemapXml` 并存，容易被误改成错误的那一个。
- 静态页 `lastmod` 用 `new Date()`（`feed.ts:106`），每次请求都被"更新"，会让爬虫低估实际更新频率。
- 模板未做 HTML 转义（`htmlTemplate.ts:33-35`），当前数据源可信，一旦接 DB 就是注入点。
- `/admin` 未被 robots 排除，且返回 200 的"正在验证管理员身份"页（`AdminPage.tsx:62-70`）。

---

## 12. 问题清单（面向"重做一套更完整的 CMS"）

共 16 条。每条给出「文件证据 → 后果 → 正确做法」。排序不严格代表严重度，但前 6 条建议优先处理。

### 1. 迁移账本与 schema 不一致，drizzle-kit 链路已坏

- **证据**：`drizzle/meta/` 只有 `_journal.json`(668B)、`0000_snapshot.json`、`0001_snapshot.json`；`_journal.json:6-33` 只登记 0000-0003；`0001_snapshot.json` 里仍含 `features` 表；而 `drizzle/` 下有 15 个 SQL（0000-0014）；`package.json:18,22,21` 的 `db:generate`/`db:check`/`db:studio` 都依赖这份元数据。
- **后果**：`pnpm db:generate` 会以 0001 的快照为基线 diff 当前 `src/db/schema.ts`，产出重复建表/重复索引的迁移；`db:check`/`db:studio` 展示的结构与实际库不符。wrangler 那条路（按目录字母序）正常，因此"本地能跑、生成器坏了"这种状态很难被发现。
- **正确做法**：移除"手工编号迁移"的旁路，回到 `drizzle-kit generate` 单一入口；对现有 14 个历史迁移做一次基线重建（用当前 schema 生成一份 squash 迁移 + 一份全新 snapshot 与 journal），并在 CI 里跑 `drizzle-kit check` 卡住不一致。

### 2. 运行时 DDL 兜底与迁移文件三处重复定义

- **证据**：`src/routes/siteConfig.ts:21-25` 的 `ensureSiteSettingsTable`（`CREATE TABLE IF NOT EXISTS site_settings …`）、`src/routes/navigation.ts:22-27` 的 `ensureNavItemsTable` + `:26` 的 `CREATE INDEX IF NOT EXISTS`，同时 `drizzle/0009_site_settings.sql`、`drizzle/0011_nav_items.sql` 和 `src/db/schema.ts:231-237,180-198` 各定义了一遍；`getPublicNavItems`（`navigation.ts:44-58`）每次请求都先 `seedDefaultNavItems`。
- **后果**：schema 有 3 份真源，改一处必漏两处；把 DDL 放到请求路径上会在并发首访时产生额外开销与潜在竞争；`seedDefaultNavItems` 每请求多一次 SELECT。
- **正确做法**：迁移是唯一 DDL 出处；启动/部署时用 migration 保证表存在；确需容错则只在部署脚本或 Cron 触发，不在读路径；默认数据用 `INSERT OR IGNORE` 的迁移（`0011` 已经这么写了）而非运行时 seed。

### 3. 鉴权模型过弱：单角色 + 明文 token + 死 apiKey

- **证据**：`src/middleware/admin.ts:17` 仅判 `role !== "admin"`；`src/db/schema.ts:19` role 只有二值；`src/routes/auth.ts:389` 用 `createId()`（cuid2）当 session token、`:392-396` **明文**写库；`frontend/src/hooks/useAuth.ts:36` 把 token 存 localStorage；`users.api_key`（`schema.ts:15-18`）只被生成与返回（`auth.ts:382,410,471,517`），**无任何接口用它鉴权**。
- **后果**：无法做多作者/多角色/资源级权限；token 泄露即会话接管；apiKey 是纯泄露面（`/api/auth/me` 与登录响应明文回传，`common/validators/auth.schema.ts:18` 强制要求该字段）。
- **正确做法**：token 用 `crypto.getRandomValues` 生成 32 字节、入库前 `SHA-256`、会话表加 `last_used_at`/`user_agent` 并支持按用户批量撤销；会话凭证改 HttpOnly + Secure + SameSite Cookie（或必须保留 Bearer 时禁存 localStorage）；权限改 role→permission 表 + 资源所有权字段；删掉 apiKey 或真正接成一类 API 凭证（哈希存储 + scope + 限速）。

### 4. `viewCount` 在 GET 里自增：读接口有副作用、无法缓存

- **证据**：`src/routes/post.ts:83-87`（`GET /api/posts/:slug` 每次都 `UPDATE posts SET view_count = view_count + 1`）；全局 `etag()` 在 `src/index.ts:26`；前台每次打开文章都会打这个接口（`frontend/src/pages/BlogDetailPage.tsx:11`）。
- **后果**：写配额被读流量吃掉（D1 有写上限）；无法对文章详情做 CDN/HTTP 缓存；ETag 命中返回 304，但计数照增，统计口径混乱（刷新一次 +1，且 SSR/客户端可能各打一次）。
- **正确做法**：详情 GET 只读；计数拆成 `POST /api/posts/:slug/view`（可用 `waitUntil` 异步、按 IP+UA+时间窗去重，或批量落一张 `post_views(post_id, date, count)` 聚合表）；详情响应可加 `Cache-Control + stale-while-revalidate`。

### 5. 无事务/批处理：多行写操作非原子

- **证据**：`src/routes/admin.ts:131-148` 的 `PATCH /nav-items/reorder` 用 `Promise.all(ids.map(... db.update ...))` 发 N 条独立 UPDATE；`admin.ts:59-67` 的 stats 是 7 次 count；`admin.ts:138-145` 无回滚。
- **后果**：排序中途失败会留下半更新的顺序（`sortOrder` 出现重复或空洞）；D1 每次 `update` 都是独立往返，N 项 = N 次写，且没有 `db.batch()`/`transaction()` 保护。
- **正确做法**：改为 `db.batch([...])`（D1 支持批处理，单次往返、原子提交）；对"必须先读后写"的业务（slug 唯一、状态切换）用 `db.transaction()`；统计用一个 `SELECT` 聚合（UNION 或子查询）替代 7 次 count。

### 6. 搜索/归档/后台全是"拉全量到内存过滤"

- **证据**：`src/routes/content.ts:158-189` 的 `/api/search` 一次拉 5 张表（posts≤200、pages≤80、moments≤120、projects≤80、friends≤120）后在 JS 里 `String.includes` 过滤并排序；`frontend/src/pages/BlogListPage.tsx:23` 固定 `contentApi.posts(100)` 再前端过滤/分组；`frontend/src/admin/adminApi.ts:155,191,193` 后台列表固定 `pageSize=100`，`:157-162` 的 `post(id)` 拉 100 条本地 `find`；`src/routes/admin.ts:200-209`、`src/routes/ai.ts:53-59` 各写一份"全表拉取去重"的 taxonomy。
- **后果**：内容量线性放大内存与 CPU；超过 100 篇后归档页静默丢内容；搜索命中不到全量数据（"搜不到老文章"）；后台列表超过 100 条不可见；taxonomy 在大表上会拖慢 AI 补全。
- **正确做法**：搜索改用 D1 的 FTS5 虚表（或至少 `LIKE` + 分页 + 索引）；分类/标签建实体表 + 关联表，taxonomy 用一条 `GROUP BY` 查询；后台列表分页 + 单条 `GET /:id`；归档页改成服务端分页/按年月增量拉取。

### 7. 无统一错误处理与统一响应格式

- **证据**：`src/index.ts` 无 `app.onError`、无 `app.notFound`；错误体三种格式并存（`{code,message}`：`admin.ts:220`、`ai.ts:63`；`{success,message}`：`auth.ts:258`、`comment.ts:156`；纯文本 404：Hono 默认）；`GET /api/auth/me` 声明 `UserInfoSchema` 但失败时返回 `{code,message}`（`auth.ts:438,451,459` 对比 `:121-145` 的声明）；`src/routes/ai.ts:134-145` 的 `/moderate-comment` 甚至没有 try/catch 包裹 `getSiteConfig`。
- **后果**：客户端必须为每个接口写特例（`frontend/src/services/content.ts:98-118` 与 `adminApi.ts:134-141` 各写一套）；未捕获异常返回 500 且无结构；前端拿不到稳定的错误码。
- **正确做法**：定义 `AppError(code, message, httpStatus)`；`app.onError` 统一转 JSON（生产隐藏 stack）；`app.notFound` 返回结构化 404；用 `@hono/zod-openapi` 的 `defaultHook` 把校验失败统一成 400 结构；把响应 schema 作为唯一契约（前端 `z.infer` 复用）。

### 8. 类型安全边界断裂：54/59 端点不在 OpenAPI 里，前后端类型各自手写

- **证据**：只有 `src/routes/auth.ts` 用 `createRoute`（`:42,78,121,148,170`）；`admin.ts`/`ai.ts`/`content.ts`/`post.ts`/`comment.ts`/`navigation.ts`/`siteConfig.ts`/`utility.ts` 全部是 `app.get/post/...` 普通注册；`src/index.ts:43-49` 的 `/api/doc` 因此只暴露 5 个端点；`auth.ts:126` 声明 `security: [{BearerAuth:[]}]` 但从未注册该 securityScheme；前端 `adminApi.ts:21-132` 手写 `AdminPost`/`AdminMoment`/…，与 `common/validators/admin.schema.ts` 无关联；`@/*` 别名在根/前端两份 tsconfig 里指向不同目录（`tsconfig.json:20-21` vs `frontend/tsconfig.json:5-6`）。
- **后果**：后台接口等于"无类型契约"，字段改名只有运行时才发现；`/doc` 提供虚假的安全感；`AdminPost` 与后端返回体（例如 `admin.ts:189-195` 把 `tags` 反序列化成数组、时间转 ISO 字符串）靠人肉对齐。
- **正确做法**：所有路由迁移到 `createRoute` + `openapi()`，response schema 与 `common/validators` 共用；前端只从共享 schema `z.infer` 出类型，禁止在 `adminApi.ts` 手写 DTO；注册 securityScheme；消除 `@/*` 的二义性（拆成 `@server/*` 与 `@frontend/*`）。

### 9. 内容模型缺草稿版本、缺审核流、缺作者归属

- **证据**：`posts` 只有 `status(draft|published)` + `published_at`（`schema.ts:71-72`），无 revision 表、无 `updated_by`、无 `version` 字段；PATCH 直接覆盖（`admin.ts:274-289`）；`pages`/`moments`/`projects` 连作者字段都没有（`schema.ts:114,88,135`）；友链申请复用 `status: "draft"` 当审核态（`content.ts:266`）。
- **后果**：误改无法回滚；两个管理员同时编辑 = 后写全量覆盖（无冲突检测）；无法做"编辑/作者/审核"角色分工；友链申请的"待审核"没有任何申请人/时间/理由记录。
- **正确做法**：加 `entity_revisions(entity, entity_id, snapshot_json, author, created_at)` 或至少 `posts.version` + `If-Match` 乐观锁；加 `pages/moments/projects.author_id`；友链单独 `friend_link_requests` 表（含 `applicant/contact/applied_at/reviewed_by/status`）。

### 10. 测试覆盖极薄，且测的不是危险路径

- **证据**：`src/index.test.ts`（48 行，只测生产 CORS 允许/拒绝）、`src/routes/auth.test.ts`（50 行，只测 state cookie 与 state 不匹配）、`src/routes/ai.test.ts`（118 行，测 401/403/503 与消息顺序、字段筛选，DB 全靠手写 mock）、`src/services/ai.test.ts`（94 行，测 schema 与 slug 归一）、`frontend/src/admin/momentSlug.test.ts`（460B）。仓库里**没有** `vitest.config.*`，虽然 `package.json:31` 装了 `@cloudflare/vitest-pool-workers`。
- **后果**：`admin.ts`（675 行、30 个端点）零测试；`content.ts` 的搜索/分页零测试；迁移与 schema 零测试；SSR 渲染零测试；`createDb()` 这类手写 mock（`ai.test.ts:9-36`）与真实 Drizzle 行为会漂移，测试给出虚假信心。
- **正确做法**：配置 `vitest` + `@cloudflare/vitest-pool-workers` + 本地 D1（`wrangler d1 migrations apply --local` 后跑集成测试），覆盖：鉴权矩阵（匿名/user/admin × 所有写端点）、CRUD 幂等与 slug 冲突、评论权限、迁移前后 schema 快照比对、`/api/search` 与分页边界、SSR 对 `/blog/:slug` 的输出断言。

### 11. Markdown 渲染开启 `rehype-raw` 且不做消毒

- **证据**：`frontend/src/components/MarkdownView.tsx:55`（`<ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>`），内容来自 D1（`contentMd`），写入方是后台管理员（`admin.ts:240`），展示方包括评论之外的所有内容页；`MarkdownView` 还被 `AdminPrimitives` 的预览复用（`AdminPrimitives.tsx:14`）。
- **后果**：`rehype-raw` 允许 HTML 透传，即 Markdown 内容里的 `<script>`/`<img onerror>` 会成为真实的 DOM（React 不会为 rehype 生成的 raw HTML 做二次转义）；配合"token 存 localStorage"（第 3 条），一次内容注入即可拿到会话 token。
- **正确做法**：引入 `rehype-sanitize`（或改用 `remark-rehype` + 白名单），只允许安全标签/属性；把外部链接加 `rel="noopener noreferrer"`；会话凭证改 HttpOnly Cookie 让 XSS 无法直接读 token；对用户可提交的内容（评论）应该走纯文本渲染而不是 Markdown。

### 12. 匿名写接口无限流、无验证码、无审计

- **证据**：`src/routes/content.ts:256-270` 的 `POST /api/friend-links/apply` 无任何鉴权与频率控制；`src/routes/comment.ts:27,96-115` 的评论创建虽有 `authMiddleware`，但 GitHub 账号申请成本极低，且每次都会触发 LLM 审核（`:101-102`）；全仓库无 rate limit 中间件、无 Turnstile、无请求日志表。
- **后果**：友链表可被脚本灌满（虽为 `draft`，但后台列表会淹没，且没有分页/批量删除）；评论接口可被用来放大外部 LLM 调用成本；没有任何审计线索（IP/UA/时间）可用于事后清理。
- **正确做法**：接入 Cloudflare Turnstile + Workers Rate Limiting binding（或 KV/Durable Object 计数器）；写接口记录 `ip_hash/user_agent/created_at`；友链申请独立表 + 后台分页 + 一键拒绝；评论审核改为异步（`waitUntil` 或队列），不阻塞用户请求。

### 13. AI 配置明文入库，后台文案与实现不符

- **证据**：`site_settings.value` 存整份配置 JSON（`admin.ts:89-94`），其中含 `aiConfig.apiKey`（`common/validators/admin.schema.ts:150`）；`frontend/src/admin/SiteConfigManager.tsx:157` 的提示文案写"仅在服务端加密保存"；`src/utils/encryption.ts` 只有 key 生成，**没有任何加解密函数**；`GET /api/admin/site-config`（`admin.ts:79-82`）返回未脱敏的完整配置（与公开接口 `siteConfig.ts:47` 的脱敏形成对比）。
- **后果**：AI Key 以明文躺在 D1；任何能读库/读日志/拿到 admin 会话的人可直取；后台提示是误导（合规与信任问题）。
- **正确做法**：密钥用 Cloudflare Secrets（或 Worker 侧 AES-GCM 加密，密钥来自 secret）保存，DB 只存密文/引用；后台读接口默认返回 `apiKey: ""` 或 `sk-****`，只在显式"显示"动作下 `POST /api/admin/site-config/reveal` 返回；删除那条不实文案。

### 14. 导航配置在前端被硬编码白名单截断

- **证据**：`frontend/src/App.tsx:22-29` 的 `prototypeNavigation` 写死 6 项（`/`、`/blog`、`/moments`、`/projects`、`/friends`、`/about`），`:46-53` 用它 map 后去 `navQuery.data` 里按 path 找 label；`:50` 还把"归档"改成"文章"；后端 `GET /api/navigation` 返回的 enabled 项（`src/routes/navigation.ts:44-58`）只能被这 6 条消费。
- **后果**：后台"导航栏"模块（README 明确列为功能）新增的入口（例如 `/search`、任意外链）**在前台永远不会出现**；改标题只在 6 个 path 上生效。功能声称与实现不符。
- **正确做法**：前台直接渲染 `navQuery.data`（后端返回的完整 enabled 列表），排序/启停完全由后端 `sort_order` + `status` 决定；仅保留一个"后端不可用时"的 `defaultNavItems` 兜底；把 `isActiveNav` 的博客特判（`:18`）改为基于路由匹配的通用逻辑。

### 15. 前端"取单条"与"列表"接口缺失/低效

- **证据**：`frontend/src/admin/adminApi.ts:157-162`（`post(id)` 拉 100 条本地 `find`）；`admin.ts:174-198`（后台列表只支持 page/pageSize，**没有 `GET /admin/posts/:id`**）；`AdminPostEditorPage.tsx` 依赖 `adminApi.post(params.id)`；`admin.ts:307-319`（moments 列表无分页，一次全量）。
- **后果**：单篇编辑要多传 ~100 倍数据；超过 100 篇时编辑器直接抛"文章不存在"（`:160`）——功能边界随数据量崩塌；移动网络下后台首屏变慢。
- **正确做法**：补 `GET /admin/posts/:id`（以及 moments/pages/projects/friend-links 的同名接口）返回单条完整实体；列表统一分页 + 服务端搜索；前端用 `useQuery(["admin","post",id])` 直取。

### 16. 环境/配置真源分散，文档与代码不同步

- **证据**：`env.example` 只有 3 个变量（缺 `NODE_ENV`/`VITE_PORT`/`QWEATHER_KEY`/`VITE_API_*`）；`wrangler.jsonc:21-25,41-45` 又定义了一份 `APP_BASE_URL`；`src/types.ts:1-10` 手写 Bindings；`worker-configuration.d.ts` 只有 4 个绑定且注释停留在 "Generated by Wrangler on Tue Jul 30 2024"；`package.json:25` 的 `db:import:halo:prod` 指向不存在的 `drizzle/halo-import.sql`；`README.md` 的部署步骤没写"首位用户需要手工改成 admin"。
- **后果**：新环境按 `env.example` 配置会缺变量（`NODE_ENV` 缺失会让 `index.ts:92` 走生产分支，dev 反代/SSR 行为全错）；类型检查看着有 `Bindings` 却与实际 env 不一致；`wrangler types` 产物过期无人重跑。
- **正确做法**：`wrangler.jsonc` 的 `vars` 作为唯一真源 + `pnpm cf-typegen` 进 CI，`src/types.ts` 直接 `import type { Env } from "../worker-configuration"`；`env.example` 补齐全部变量并标注哪些是 secret；删除不存在的脚本或补上对应文件；README 增加"初始化管理员"步骤（或代码里支持 `ADMIN_GITHUB_ID` 环境变量首登提权）。

### 可复用要点（重做时的优先级）

1. **先修数据层地基**：迁移单一入口 + 事务/批处理 + 索引与 FTS（第 1、2、5、6 条），这一层不修，上层功能越做越危险。
2. **再做鉴权与安全**：token 哈希 + HttpOnly Cookie + 权限表 + 限流 + 消毒（第 3、11、12、13 条）。这是唯一无法靠"以后再说"拖延的部分。
3. **然后补内容模型的完整性**：revision + 作者归属 + 审核流 + 分类标签实体表（第 9、6 条），以及"文章级 SEO/OG"（第 11 节缺口）。
4. **保留的既有资产**：`htmlTemplate.ts` + `seo.ts` 的模板集中化、`feed.ts` 的动态 robots/sitemap/rss、`utils/storage.ts` 的 SSR 安全工具、`AdminPrimitives.tsx` 的后台同构组件、`services/ai.ts` 的"LLM 输出后处理链"，这五处可以原样搬到新项目。
5. **可以放心砍掉的**：`generateSitemapXml`（死代码）、`tsconfig.node.json`（无人使用）、`common/validators/blog.schema.ts` 里未使用的 schema、`users.api_key`（或接成真凭证）、`target_type/target_slug/parent_id`（若确定不做多态评论）、以及 dev 双入口里的一条。

### 问题/坑点（最危险的三条，若只修三个）

1. **第 3 条（鉴权）**：token 明文 + cuid2 + localStorage + 死 apiKey，任一环节出问题都是"后台被完全接管"。
2. **第 11 条（rehype-raw）**：与第 3 条组合成"内容注入 → 偷 token → 接管后台"的完整利用链。
3. **第 4 条（GET 写库）**：看似小问题，但它决定了整个读路径能不能缓存，进而决定这套架构在流量上是否可持续。

---

## 附：关键文件索引（按主题）

| 主题 | 文件 |
|---|---|
| Worker 入口与分流 | `src/index.ts`（`:26` 全局中间件、`:40` API 挂载、`:60-88` SEO 路由、`:91-173` SPA/SSR 兜底） |
| 路由装配 | `src/routes/api.ts`（`:22-37` DB 注入 + 8 个 `.route`） |
| 鉴权 | `src/middleware/auth.ts`、`src/middleware/admin.ts`、`src/routes/auth.ts`（`:210` protected 挂载、`:250-432` 回调、`:479-491` 登出） |
| 数据模型 | `src/db/schema.ts`（10 张表）、`drizzle/0000-0014.sql`、`drizzle/meta/_journal.json` |
| 配置中心 | `src/routes/siteConfig.ts`（`:13` key、`:21-25` 建表、`:27-43` 读取）、`frontend/src/config/siteConfig.ts`（默认值 + normalize + toPublic） |
| AI | `src/services/ai.ts`、`src/routes/ai.ts`、`common/validators/ai.schema.ts`、`frontend/src/admin/adminApi.ts:166-169` |
| SEO/订阅 | `src/utils/htmlTemplate.ts`、`src/config/seo.ts`、`src/utils/feed.ts`、`scripts/generateHtml.ts` |
| 前端骨架 | `frontend/src/entry-client.tsx`、`entry-server.tsx`、`routes.tsx`、`App.tsx` |
| 后台 | `frontend/src/admin/*`（13 文件）、`frontend/src/pages/AdminPage.tsx`、`AdminPostEditorPage.tsx` |
| 主题 | `frontend/src/theme/index.ts`、`frontend/src/theme/types.ts`、`frontend/src/prototype.css`、`frontend/uno.config.ts` |
| 测试 | `src/index.test.ts`、`src/routes/auth.test.ts`、`src/routes/ai.test.ts`、`src/services/ai.test.ts`、`frontend/src/admin/momentSlug.test.ts` |
