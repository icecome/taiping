# 架构一致性审查报告

> **审查对象：** taiping_blog（边缘运行时轻量博客管理系统）
> **审查日期：** 2026-09-21
> **审查范围：** 全量源码目录（排除 `node_modules` / `vendor` / `dist` / `.wrangler` / `.history`）
> **审查性质：** 只读分析，未修改任何代码或配置文件
> **设计基线来源：** `docs/architecture-design.md` v2.0（Level 1 理想情况，文档齐全）

---

## 附：审查方法与可追溯性声明

**项目规模与抽样策略**

| 指标 | 数值 | 说明 |
|------|------|------|
| 包数量 | 6 | `content-model` / `renderer` / `shared-utils` / `theme-zhuosu` / `edge` / `studio` |
| 源码文件数 | 131 | 排除 `apps/studio/public/theme/**`（与 `themes/zhuosu/src` 重复的镜像副本） |
| SLOC | 约 17570 行 | **近似值**，含空行与注释（`wc -l` 兜底，本机无 `cloc`），置信度中 |
| 未启用抽样 | — | 规模远低于 3000 文件 / 50 万行阈值，执行了**全量**审查 |

**技术栈判定依据**：`package.json` + `pnpm-workspace.yaml` + 各子包 `package.json`（构建文件优先于目录名）。

**核对命令与结果**

```
pnpm -r test        → 25 tests passed（content-model 8 / shared-utils 8 / renderer 5 / edge 4 / studio 0）
pnpm typecheck      → 6/6 包通过（tsc --noEmit 全绿）
git check-ignore    → .dev.vars、.wrangler 均已忽略，无密钥入库
```

**审查边界声明**：并发行为、Workers 运行时 CPU 耗时、D1 实际查询延迟未实测（见第四部分）。

---

## 📋 第一部分：结论摘要

- **项目概览：** TypeScript + Hono + Cloudflare Workers（D1 主存储，请求期 TSX 渲染，React SPA 后台）| 源码文件 131 个 | SLOC 约 17570 行（近似值）
- **综合健康度评分：** **76/100（🟡 一般）**
- **最终裁决：** **分阶段演进**

计算过程：

```
P0（致命）：1 个 × 15 = 15
P1（严重）：1 个 × 5  =  5
P2（一般）：2 个 × 2  =  4
合计扣分：24 → 100 - 24 = 76
```

**核心发现**

这个项目最大的优势是**设计文档与代码实现的一致性远超预期**。v2.0 设计文档中「单一 schema 派生」「服务端校验后渲染」「依赖方向严格单向」三条核心约定都在代码中得到了真实落地：`packages/renderer/src/markdown.ts:45` 的 `renderMarkdownSafe` 确实执行了「先渲染后净化」的顺序且净化白名单严格（`allowedSchemes: ['http','https','mailto']` 阻断了 `javascript:`），`themes/zhuosu/src/pages.ts:53` 的 `ctx.unlocked` 分支真实阻断了加密文章正文下发——设计文档第 101-112 行自陈的「明文降级缺口」在 v2.0 中确实被修复了。

最严重的问题是**加密文章摘要经 RSS 泄露**：`apps/edge/src/routes/public.ts:282` 的 RSS 路由对全部已发布文章无差别输出，而 `packages/renderer/src/derive.ts:28` 在无显式摘要时会回退到 `deriveExcerpt(post.contentMd)` 从正文派生。结果是加密文章的正文片段被推送进公开的 RSS feed——这与同一代码库中搜索索引（`packages/renderer/src/search.ts:26` 显式过滤 `!p.encrypt`）和文章卡片（`themes/zhuosu/src/components.ts:167` 对加密文章遮蔽摘要）的处理形成明确矛盾，属于**同一约束在三处实现、两处正确一处遗漏**的一致性缺口。这个问题被判为 P0 的理由不是危害面广，而是它直接违背了设计文档第 42 行「数据主权可保障」之外的另一条底线——加密语义的完整性。

另一个值得单独指出的架构级问题：分类/标签列表页存在**静默的功能性失效**。`apps/edge/src/services/terms.ts:96` 返回未经映射的 snake_case 数据库原始行，却在 `apps/edge/src/routes/public.ts:265` 被 `as unknown as Post[]` 强转为 camelCase 类型。由于 `Post` 接口的字段名是 camelCase（`publishedAt`、`contentMd`），而实际数据是 `published_at`、`content_md`，所有属性读取都返回 `undefined`——分类页和标签页的文章卡片将丢失日期、封面与摘要。这个 bug 的特征是**编译期完全静默**（双重强转绕过了类型系统），且现有测试（25 个）没有覆盖该路径。

---

## 🚨 第二部分：问题清单（按风险等级降序排列）

| 问题类型 | 具体描述 | 风险等级 | 具体依据（文件:行号） | 影响范围 |
|---------|---------|---------|---------------------|---------|
| 一致性缺口（加密语义泄露） | RSS 路由对全部已发布文章无差别输出，未过滤 `encrypt`；`buildExcerptAndReading` 在无显式摘要时回退 `deriveExcerpt(post.contentMd)` 从正文派生，导致加密文章正文片段进入公开 RSS | **P0** | `apps/edge/src/routes/public.ts:282`<br>`packages/renderer/src/derive.ts:28` | 加密文章正文经 RSS 公开泄露，违背设计文档第 153 行「未解锁请求不接触正文」 |
| 架构偏离（类型契约失效） | `listPostsByTermSlug` 返回 untyped snake_case 原始行（`SELECT p.*` 无行映射），在路由层被 `as unknown as Post[]` 强转为 camelCase 的 `Post` 类型；字段名不匹配导致所有属性读取返回 `undefined` | **P0** | `apps/edge/src/services/terms.ts:96`<br>`apps/edge/src/routes/public.ts:265` | 分类页 / 标签页文章卡片丢失日期、封面、摘要；编译期静默 |
| 职责不清（层间职责渗透） | `apps/edge/src/routes/public.ts` 336 行，同时承担路由分发、业务聚合（分组、排序、分页）、markdown 渲染、派生数据计算与 RSS/Sitemap XML 手写拼接 | **P1** | `apps/edge/src/routes/public.ts:280-327` | 路由层承载业务逻辑，与设计文档第 202 行「L3 路由层」职责定义不符；难测试 |
| 一致性缺口（鉴权未失败闭合） | `assertEnv` 仅在 Cron `scheduled` 路径调用，`fetch` 请求路径完全未校验；`SESSION_SECRET` 缺失时 `hmacSign` 会以空密钥产出可预测签名 | **P1** | `apps/edge/src/index.ts:42-44`<br>`apps/edge/src/env.ts:27-37` | 会话与解锁令牌完整性被静默削弱，而非启动即失败 |
| 复用性（服务层重复逻辑） | `listPosts`（posts.ts）、`listComments`（comments.ts）、`listMedia`（media.ts）各自独立实现了「动态 WHERE 拼接 + COUNT 查询 + LIMIT/OFFSET 分页」三段式骨架，逻辑同构 | **P2** | `apps/edge/src/services/posts.ts:59-101`<br>`apps/edge/src/services/comments.ts:173-205`<br>`apps/edge/src/services/media.ts:83-120` | 分页语义变更需同步修改 3 处，易漏改 |
| 重复实现（构建产物镜像） | `apps/studio/public/theme/**` 与 `themes/zhuosu/src/**` 存在大量同名同内容的镜像副本（`style.css` 各 1199 行、`lightbox.css` 各 488 行、`guestbook.css` 各 433 行等），合计约 4650 行重复 | **P2** | `apps/studio/public/theme/styles/style.css`<br>`themes/zhuosu/src/styles/style.css` | 双份维护，主题样式修改需手工同步 |

### 按维度分布

| 维度 | 问题数 | 具体项 |
|------|-------|--------|
| 模块边界与分层 | 1 | 路由层职责过载（P1） |
| 数据流与事务 | 1 | RSS 加密语义泄露（P0） |
| 技术债 | 1 | `assertEnv` 未在请求路径失败闭合（P1） |
| 复用性 | 2 | 分页骨架重复（P2）、主题资源镜像副本（P2） |
| 类型契约 | 1 | taxonomy 强转导致字段失效（P0） |

### 变更热点分析

本项目**尚无任何 git 提交**（`git log` 返回 `fatal: your current branch 'main' does not have any commits yet`），全部文件处于 untracked 状态。因此**无法使用「近 3 个月变更频次 Top 5」做热点分析**，此项在本轮审查中不适用。

从静态结构推断的复杂度热点（供参考，非变更频次）：

| 文件 | 行数 | 复杂度特征 |
|------|------|-----------|
| `apps/studio/src/pages/MomentListPage.tsx` | 1181 | 后台说说的全部交互集中单文件 |
| `apps/studio/src/styles/index.css` | 1383 | 后台样式总表 |
| `apps/edge/src/services/posts.ts` | 349 | 文章 CRUD 与事务编排集中 |
| `apps/studio/src/pages/PostEditPage.tsx` | 478 | 文章编辑器表单与副作用集中 |

---

## 🛠️ 第三部分：改进建议（含优先级与可执行步骤）

### 针对 [P0级问题一：RSS 加密语义泄露]

**操作步骤**

Step 1 — 在 RSS 生成处补充加密过滤，与搜索索引保持同一判据：

```ts
// apps/edge/src/routes/public.ts:282 附近
const posts = await getPublishedPosts(c.env.DB, 'post')
const visible = posts.filter((p) => !p.encrypt)   // 与 search.ts:26 的判据一致
const items = visible.slice(0, 20).map(...)
```

Step 2 — 同步核对 sitemap 与归档页。sitemap（`public.ts:311-327`）只输出 URL 不含摘要，泄露面较小，但建议一并纳入统一过滤，避免后续有人给 sitemap 加 `changefreq`/摘要时重新引入。

Step 3 — 补充回归测试。当前 `packages/renderer` 无 RSS 相关测试，建议至少断言「加密文章不出现在 RSS items 中」。

**预估工作量：** 0.5 人/天（含测试）

**回滚策略：** 该改动为纯过滤条件新增，采用特性开关（`settings.rssIncludeEncrypted`，默认 false）即可灰度；如出现预期外的「加密文章应出现在订阅中」需求，关闭开关即回滚，无需回退代码。

**连带改动清单：** 若同时把过滤逻辑下沉到 `getPublishedPosts`，将影响 `public.ts` 首页（第 60 行）、归档（第 142 行）、RSS（第 282 行）、sitemap（第 314 行）四处调用点——**推荐先只改 RSS 一处**，观察后再决定是否下沉。

---

### 针对 [P0级问题二：taxonomy 类型契约失效]

**操作步骤**

Step 1 — 消除强转，补上行映射。`apps/edge/src/services/terms.ts:85-97` 应返回映射后的 `Post[]`：

```ts
// 复用 posts.ts 中已有的 PostRow + rowToPost（当前为模块私有，需导出）
export async function listPostsByTermSlug(db, type, slug): Promise<Post[]> {
  const rows = await db.prepare(`SELECT p.* FROM posts p ...`).bind(type, slug).all<PostRow>()
  return rows.results.map(rowToPost)
}
```

Step 2 — 移除 `apps/edge/src/routes/public.ts:265` 的 `as unknown as Post[]`。类型对齐后该强转不再需要；若 TypeScript 仍报错，说明映射仍有缺口，此时应修映射而非加强转。

Step 3 — 补测试。在 `packages/content-model` 或 `apps/edge` 增加一条 taxonomy 列表用例，断言返回对象含 `publishedAt` 与 `contentMd`。

**预估工作量：** 1 人/天

**回滚策略：** 该修复改变函数返回类型，是**签名变更**，建议采用抽象分支（在 `terms.ts` 内新增 `listPostsByTermSlugMapped`，旧函数标注 `@deprecated`，迁移完成后删除），避免一次性改动阻塞其他工作。

**连带改动清单：** `listPostsByTermSlug` 的调用点仅 2 处，均在 `apps/edge/src/routes/public.ts`（第 216 行分类计数、第 239 行标签计数、第 264 行详情页）——需 grep 确认后逐处核对 `posts.length` 与 `loadCards` 的用法不再依赖原始行形状。`PostRow` 与 `rowToPost` 当前为 `posts.ts` 模块私有（第 11、34 行），导出它们会扩大 `posts.ts` 的公开面，建议评估是否移入 `content-model` 作为共享映射层。

---

### 针对 [P1级问题一：路由层职责过载]

**操作步骤**

Step 1 — 将 RSS 与 Sitemap 的 XML 组装从路由层抽出为 `apps/edge/src/lib/feeds.ts`，路由只负责取数并调用。

Step 2 — 将 `loadCards`（第 45-52 行）这类聚合逻辑上移至 `services/posts.ts`，路由层保留「解析请求 → 调用服务 → 返回响应」三段式。

Step 3 — 评估第 140-172 行的归档分组逻辑，`monthOf` 分组与排序可下沉为 `renderer` 的纯函数并补单测。

**预估工作量：** 1.5 人/天

**回滚策略：** 采用抽象分支，先新增模块并让路由调用新模块，确认行为一致（对比改造前后对同一 URL 的响应体）后再删除旧代码路径。

---

### 针对 [P1级问题二：鉴权未失败闭合]

**操作步骤**

Step 1 — 在 `apps/edge/src/index.ts` 的 `fetch` 入口最前调用 `assertEnv`：

```ts
export default {
  fetch: async (req, env, ctx) => {
    assertEnv(env)   // 缺失关键环境变量时立即抛出，而非静默以降级密钥运行
    return app.fetch(req, env, ctx)
  },
  scheduled: ...,
}
```

Step 2 — 补充 `SESSION_SECRET` 的强度校验（当前仅要求长度 ≥16，`env.ts:34`）。建议至少拒绝明显的占位值（如 `please-change-me`、`change-me`）以防 `.dev.vars.example` 的默认值被误用于生产。

**预估工作量：** 0.5 人/天

**回滚策略：** 该改动是失败闭合（fail-closed）语义变更，风险在于「生产环境本就缺少某个变量但此前一直能跑」。建议**先以告警模式上线**（`console.error` 记录缺失项而不抛出），观察一个发布周期确认无告警后再切换为抛出。

**连带改动清单：** `assertEnv` 抛出的错误会经由 `errorHandler`（`middleware/error.ts:18`）转为通用 500，**不会**泄露缺失项名称——这是正确的行为，但需确认运维侧能从日志获取足够信息定位问题（`errorHandler` 第 18 行的 `console.error('[edge]', err)` 已包含原始错误，满足要求）。

---

### 针对 [P2级问题：分页骨架重复与主题资源镜像]

分页骨架重复的建议：待三处逻辑出现**第二次**差异需求时再抽取（当前三处完全同构，抽取收益尚未超过抽象成本）。若抽取，建议形式为 `lib/pagination.ts` 导出的 `buildListQuery({ table, where, binds, page, pageSize })`，而非继承或泛型基类。

主题资源镜像的建议：确认 `apps/studio/public/theme/**` 是否为构建期的拷贝产物。若是，应在构建脚本中生成并纳入 `.gitignore`（当前 `.gitignore` 未包含该路径）；若确为手工维护的双份，则属于真实技术债，建议在 themes 包增加同步脚本并在 CI 校验一致性。

**预估工作量：** 各 0.5 人/天

---

## 附：验证证据汇总

| 结论 | 验证方式 | 结果 |
|------|---------|------|
| 设计文档存在且为 Level 1 | 读取 `docs/architecture-design.md` 全文 574 行 | 版本 v2.0，含分层、模块、数据模型、机制、演进路线 |
| 「先渲染后净化」设计约定真实落地 | 读取 `packages/renderer/src/markdown.ts:18-47` | 确认 `sanitizeRenderedHtml(renderMarkdown(source))` 顺序正确 |
| 净化白名单严格 | 读取 `markdown.ts:20-42` | `allowedSchemes: ['http','https','mailto']`；默认标签集不含 script/iframe/style |
| 加密文章正文仅在解锁时注入 | 读取 `themes/zhuosu/src/pages.ts:53-55` | `ctx.unlocked` 三元分支确认 |
| 设计文档自陈的「明文降级缺口」已修复 | 对比 `architecture-design.md:101-112` 与当前实现 | 当前无明文降级分支 |
| RSS 未过滤加密文章 | 读取 `public.ts:280-309` + grep `encrypt` 命中 `search.ts:26` | 确认 RSS 无该过滤，搜索有 |
| taxonomy 强转失效 | 读取 `terms.ts:85-97` + `posts.ts:11-32` + `public.ts:265` | 确认 snake_case 原始行被强转为 camelCase 类型 |
| `assertEnv` 未在 fetch 路径调用 | 读取 `index.ts:40-49` + grep `assertEnv` | 仅 `scheduled` 内调用 |
| 无密钥入库 | `git check-ignore -v apps/edge/.dev.vars` | 命中 `.gitignore:4` |
| 测试与类型检查基线 | `pnpm -r test` / `pnpm typecheck` | 25 tests passed / 6 包全绿 |

**未验证项声明**

| 维度 / 范围 | 未验证原因 |
|------------|-----------|
| 变更热点分析 | 仓库无任何 git 提交，无历史可分析（已在上文显式声明不适用） |
| Workers 运行时 CPU 与渲染耗时 | 需真实边缘环境部署，当前环境无法实测；设计文档第 562 行亦将此项列为待验证 |
| D1 实际查询延迟 | 需填充真实数据量，当前仅有本地占位库 |
| 并发与事务边界 | 仅做静态分析，未运行并发压力测试；`resolveCommentStatus` 的 TOCTOU 竞态已在代码审查报告中记录 |
| `apps/studio/public/theme/**` 的真实来源 | 未能确认是构建产物还是手工副本（构建脚本 `scripts/` 已被 gitignore，不可读） |
| SLOC 精确值 | 本机无 `cloc`，使用 `wc -l` 兜底，含空行与注释，置信度中 |
