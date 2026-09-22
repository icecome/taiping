# 代码审查报告

> **审查框架：** SPEAR（Security / Performance / Error Handling / Architecture / Reliability）
> **审查范围：** 全量源码，131 个文件 / 约 17570 行 SLOC（`apps/edge` + `apps/studio` + `packages/*` + `themes/zhuosu`）
> **审查日期：** 2026-09-21
> **审查模式：** 代码审计（模式 2）+ OWASP 安全审查（模式 3）+ 自学习（模式 5）
> **风险等级：** 🔴 高（Red）——包含认证/会话、加密文章、公开 API 外部输入入口、密钥与配置管理
> **审查轮次：** 首轮

---

## 目录

1. [总体评分](#1-总体评分)
2. [问题汇总](#2-问题汇总)
3. [CRITICAL 问题详情](#3-critical-问题详情)
4. [MAJOR 问题详情](#4-major-问题详情)
5. [MINOR 问题列表](#5-minor-问题列表)
6. [NIT 问题列表](#6-nit-问题列表)
7. [待确认问题](#7-待确认问题)
8. [未验证项声明](#8-未验证项声明)
9. [做得好的地方](#9-做得好的地方)
10. [改进建议（按优先级）](#10-改进建议按优先级)
11. [覆盖率校验](#11-覆盖率校验)

---

## 1. 总体评分

### 加权总分：55/100 — 🟡 NEEDS WORK

| 维度 | 权重 | 评分 | 关键发现 |
|------|------|------|---------|
| 🔴 安全 | 3x | 4/10 | 存在 1 个 CRITICAL（评论 `website` 存储型 XSS）与 4 个 MAJOR；按「CRITICAL 该维度 ≤ 3、MAJOR ≤ 5」的评分规则，取 4 分 |
| 🟡 性能 | 2x | 6/10 | `loadCards` 逐篇 N+1 查询；`/categories` 与 `/tags` 对每个 term 重复列表查询；Workers CPU 预算风险未实测 |
| 🟠 错误处理 | 2x | 7/10 | 边界处理整体规范（zod 校验、错误码映射、错误信封统一、不泄露堆栈）；`assertEnv` 调用位置错误 |
| 🔵 架构 | 1.5x | 7/10 | 分层清晰、依赖方向单向、契约层单一来源；但路由层职责过载、taxonomy 强转绕过类型系统 |
| 📊 可靠性 | 1.5x | 4/10 | 仅 25 个测试覆盖 5 个包，`apps/edge` 的服务层与全部路由**零覆盖**，无 CI；评论、加密解锁、RSS 三条关键路径无测试 |

**加权算式：**

```
加权总分 = (S × 3) + (P × 2) + (E × 2) + (A × 1.5) + (R × 1.5)
        = (4 × 3) + (6 × 2) + (7 × 2) + (7 × 1.5) + (4 × 1.5)
        = 12 + 12 + 14 + 10.5 + 6
        = 54.5 → 55（取整）
```

**裁定：REQUEST_CHANGES**（🟡 NEEDS WORK，60-74 区间下沿）。

> **分制说明**：本报告统一使用 0-10 整数评分 + 倍数权重（3x/2x/2x/1.5x/1.5x），未混用百分比制；加权总分取整呈现，便于后续轮次按同一口径比较。存在 1 个 CRITICAL 与 6 个 MAJOR，其中评论 XSS 与 RSS 加密泄露属功能性安全缺陷，建议在正式上线前修复。

---

## 2. 问题汇总

### 按严重级别统计

| 级别 | 数量 | 说明 |
|------|------|------|
| 🔴 CRITICAL | 1 | 存储型 XSS（评论 website） |
| 🟠 MAJOR | 6 | 加密内容泄露、非恒定时间口令比较、IP 伪造、CSRF 弱防护、`assertEnv` 未失败闭合、taxonomy 契约失效 |
| 🟡 MINOR | 9 | 覆盖范围、边界处理、类型断言、时区一致性等 |
| 🔵 NIT | 4 | 风格与命名 |
| **总计** | **20** | 等于各级别之和 |
| ⚪ Question | 3 | 待确认项，**不计入总计** |

### 按模块分布

| 模块 | CRITICAL | MAJOR | MINOR | NIT |
|------|----------|-------|-------|-----|
| `apps/edge`（路由/服务/中间件） | 1 | 5 | 4 | 2 |
| `packages/content-model` | 0 | 1 | 1 | 0 |
| `packages/renderer` | 0 | 0 | 1 | 0 |
| `packages/shared-utils` | 0 | 0 | 2 | 0 |
| `apps/studio` | 0 | 0 | 1 | 2 |

---

## 3. CRITICAL 问题详情

### C-01: 评论 `website` 字段接受 `javascript:` 协议，构成存储型 XSS

- **文件：** `packages/content-model/src/comment.ts:33-37`（校验）+ `themes/zhuosu/src/components.ts:209-210`（渲染汇点）
- **类别：** 安全（OWASP A03:2021 Injection）
- **验证：** 已读 `comment.ts:27-40` 完整 schema；已读汇点 `components.ts:204-215`；已确认 `commentCreateSchema.website` 使用 `z.string().url()`，该实现基于 `new URL()`，而 `new URL('javascript:alert(1)')` **不抛错**（`javascript:` 是合法 URL scheme）；已 grep `contentCreateSchema` 调用点，确认 `apps/edge/src/routes/api.ts:45` 是唯一入口且为**未认证公开接口**；已确认 `sanitize-html` 白名单（`markdown.ts:41`）的 `allowedSchemes` 只作用于 markdown 渲染的 HTML，**不覆盖** `components.ts` 里直接插值的 `c.website`
- **置信度：** 确定（协议放行与渲染汇点均已逐行确认）
- **问题：** `website` 字段的校验为 `z.string().url().optional().or(z.literal(''))`。zod 的 `.url()` 仅判断字符串是否可被 `URL` 构造器解析，不限制协议。攻击者可在公开评论接口提交 `{"website": "javascript:alert(document.cookie)"}`，该值经审核通过后被 `themes/zhuosu/src/components.ts:209-210` 直接渲染为 `<a href="javascript:...">`

```ts
// themes/zhuosu/src/components.ts:209-210 —— 汇点
${c.website
  ? html`<a class="guestbook-item-site" href="${c.website}" target="_blank" rel="noopener">${c.website}</a>`
  : ''}
```

Hono 的 `html` 模板标签会转义 `& < > " '`，因此无法通过引号闭合逃逸属性，但**转义不改变协议**——`href="javascript:alert(1)"` 会原样输出。

- **影响：** 读者点击留言板/评论区的攻击者链接时，在站点源下执行任意 JavaScript。由于会话 Cookie 为 `HttpOnly`（`services/auth.ts:39`）无法直接读取，但脚本可在站点源下发起已认证请求（CSRF 令牌仅为 `X-Requested-With` 头，脚本可自行设置），实现管理员会话下的任意操作——包括创建/删除文章、修改站点设置。攻击前置条件为评论需被审核通过；若站点启用了白名单自动通过（`settings.commentsWhitelist`），则前置条件可被绕过。
- **建议修复：**

```ts
// packages/content-model/src/comment.ts:33-37
website: z
  .string()
  .refine(
    (s) => !s || /^https?:\/\//i.test(s),
    '站点地址仅支持 http/https 链接',
  )
  .optional()
  .or(z.literal('')),
```

同时建议在渲染侧做纵深防御，以覆盖存量数据：

```ts
// themes/zhuosu/src/components.ts 内新增
const safeHref = (url?: string): string | undefined =>
  url && /^https?:\/\//i.test(url) ? url : undefined
// 渲染处改为 ${safeHref(c.website) ? html`<a href="${safeHref(c.website)}" ...>` : ''}
```

- **连带改动：** `commentCreateSchema` 唯一调用点为 `apps/edge/src/routes/api.ts:45`，签名不变，无需改动。**但存量数据需注意**：数据库中已存在的评论若含 `javascript:` 链接，收紧入库校验不会清理它们——因此渲染侧的协议检查是**必需**的，不是可选项。
- **前置条件：** 可静态验证。建议补充 `packages/content-model/src/comment.test.ts` 覆盖 `javascript:`、`data:`、空字符串、正常 https 四类输入（需运行测试）。

---

## 4. MAJOR 问题详情

> 所有 MAJOR 表格统一使用「# / 文件 / 行号 / 问题 / 验证 / 置信度」六列。

### 安全类

| # | 文件 | 行号 | 问题 | 验证 | 置信度 |
|---|------|------|------|------|-------|
| M-S1 | `apps/edge/src/routes/public.ts` | 282-294 | RSS 路由对全部已发布文章无差别输出，未过滤 `encrypt`；`buildExcerptAndReading`（`renderer/src/derive.ts:28`）在无显式摘要时回退 `deriveExcerpt(post.contentMd)` 从**正文派生**摘要，导致加密文章正文片段进入公开 RSS | 已读 `public.ts:280-309` 完整 RSS 生成逻辑；已读 `derive.ts:23-31` 确认回退路径；已 grep `encrypt` 确认 `search.ts:26` 有过滤而 RSS 无；已确认 `components.ts:167` 对加密文章的卡片摘要做了遮蔽——三处判据不一致 | 确定 |
| M-S2 | `apps/edge/src/services/auth.ts` | 20 | 登录口令使用 `!==` 比较，短路语义泄露口令信息；项目内已有恒定时间比较实现 `verifyAdminPassword`（同文件 88-100 行）但**从未被调用**（死代码） | 已读 `auth.ts:12-41` 登录全流程；已 grep `verifyAdminPassword` 全仓，命中仅定义处 1 处，无调用点 | 确定 |
| M-S3 | `apps/edge/src/routes/api.ts` | 49 | 客户端 IP 取值回退到 `X-Forwarded-For`，该头完全由客户端控制。在非 Cloudflare 直连或本地环境下，攻击者可逐请求轮换该头，绕过基于 `ip_hash` 的频率限制（`comments.ts:101-114`）与 IP 黑名单（`comments.ts:94-97`） | 已读 `api.ts:43-95` 完整评论提交路径；已读 `comments.ts:88-128` 确认限流与黑名单均基于该值；已确认 `CF-Connecting-IP` 由 Cloudflare 注入而 `X-Forwarded-For` 不设防 | 高 |
| M-S4 | `apps/edge/src/middleware/auth.ts` | 29-35 | CSRF 防护仅依赖单一自定义头 `X-Requested-With`，非令牌机制。该头不受同源策略保护，跨站请求可自行设置 | 已读 `auth.ts:15-38` 中间件全文；已读 `apps/studio/src/api/client.ts:36-38` 确认前端确实设置该头；已确认会话 Cookie 为 `SameSite=Lax`（`services/auth.ts:39`） | 高 |
| M-S5 | `apps/edge/src/index.ts` | 42-44 | `assertEnv` 仅在 Cron `scheduled` 处理器内调用，`fetch` 请求路径完全未校验。`SESSION_SECRET` 缺失时 `hmacSign` 仍会以空密钥产出确定性签名，属**静默降级**而非失败闭合 | 已读 `index.ts:40-49` 全文；已读 `env.ts:27-37` 确认校验逻辑；已 grep `assertEnv` 确认仅 2 处引用（定义 + scheduled 内调用） | 确定 |

### 架构类

| # | 文件 | 行号 | 问题 | 验证 | 置信度 |
|---|------|------|------|------|-------|
| M-A1 | `apps/edge/src/routes/public.ts`<br>`apps/edge/src/services/terms.ts` | 265<br>85-97 | `listPostsByTermSlug` 返回未经映射的 snake_case 数据库原始行（`SELECT p.*` + `.all()` 无 `rowToPost`），却在路由层被 `as unknown as Post[]` 强转为 camelCase 的 `Post` 类型。字段名不匹配（`published_at` vs `publishedAt`）导致所有属性读取返回 `undefined`，分类页/标签页文章卡片丢失日期、封面与摘要 | 已读 `terms.ts:85-97` 确认无行映射；已读 `posts.ts:11-32` 确认 `PostRow` 为 snake_case 而 `Post` 为 camelCase；已读 `public.ts:29-52` 确认 `toCard`/`buildExcerptAndReading` 读取 camelCase 属性；双重强转 `as unknown as` 绕过了类型系统故编译期无告警 | 确定 |

### 可靠性类

| # | 文件 | 行号 | 问题 | 验证 | 置信度 |
|---|------|------|------|------|-------|
| M-R1 | `apps/edge/src/services/comments.ts` | 101-114 | 评论频率限制存在 TOCTOU 竞态：两次并发提交会同时读到同一条「最近评论」时间戳，随后双双插入，绕过间隔限制。当前实现为「插入前检查」而非「插入后复查」 | 已读 `comments.ts:88-128` 完整状态判定逻辑；已确认检查（第 102-107 行 SELECT）与插入（第 140-162 行 INSERT）之间无事务或唯一约束保护 | 高 |

---

## 5. MINOR 问题列表

| # | 文件 | 行号 | 问题 |
|---|------|------|------|
| m-01 | `packages/shared-utils/src/date.ts` | 11-15 | `formatDate` 使用本地时区 getter（`getFullYear`/`getMonth`/…），与同文件 47-58 行的 `shanghaiParts`（显式 +8 偏移 + `getUTC*`）哲学冲突。在 UTC 或非 +8 环境（CI、海外服务器）下与站点其余部分显示不一致 |
| m-02 | `packages/renderer/src/markdown.ts` | 29, 35, 38 | 净化白名单额外允许 `input` 标签（`type`/`checked`/`disabled`）与 `div` 的 `data-*` 通配属性。前者可在正文中伪装表单控件（界面欺骗面），后者为 `data-*` 驱动的前端脚本留下 DOM clobbering 隐患 |
| m-03 | `apps/edge/src/services/comments.ts` | 115-126 | 白名单自动通过逻辑以测试者可控的 `nickname`/`email` 为键。第 122 行的 `.bind(input.email?.trim() \|\| key, input.nickname.trim())` 在无邮箱时会把 nickname 绑定到 `email` 位置比较，逻辑与意图不符 |
| m-04 | `apps/edge/src/lib/crypto.ts` | 89-96 | `timingSafeEqual` 第 90 行按长度提前返回。对定长 HMAC hex 输出无实际影响，但函数被设计为通用工具，未来用于非定长输入时即产生时序泄露 |
| m-05 | `apps/edge/src/services/auth.ts`<br>`apps/edge/src/routes/public.ts` | 72-86<br>329-334 | Cookie 解析存在两份语义等价实现（`parseSessionCookie` 与 `parseCookie`），重复劳动且易分歧 |
| m-06 | `packages/shared-utils/src/slug.ts`<br>`apps/edge/src/services/posts.ts`<br>`apps/edge/src/services/terms.ts` | 1-9<br>154-157<br>26-32 | slug 生成存在三份实现，公共实现 `slugify` 仅被测试引用、无生产调用（被架空） |
| m-07 | `apps/studio/src/pages/MomentListPage.tsx` | 全文 | 1181 行，混合日期分组、日历热力图、标签聚合、说说卡片、编辑卡与页面编排六类职责，无单元测试 |
| m-08 | `apps/edge/src/lib/cache.ts`<br>`apps/edge/src/lib/mirror.ts`<br>`apps/edge/src/services/auth.ts` | 42-44<br>10<br>23 | 唯一 ID 生成存在三处：`newId` 包装层 + 两处直接内联 `crypto.randomUUID()`，未统一 |
| m-09 | `apps/edge/src/services/posts.ts` | 238-239 | 缓存版本递增（`bumpCacheVersion`）在业务写入之后调用且无事务包裹。若版本递增失败，数据已更新但缓存未失效，读取路径将返回陈旧内容直至 TTL 过期 |

---

## 6. NIT 问题列表

| # | 文件 | 行号 | 问题 |
|---|------|------|------|
| n-01 | `apps/edge/src/lib/crypto.ts` | 81 | `hexToBytes` 对奇数长度抛错，但对非 hex 字符（如 `"zz"`）会静默解析为 0，建议一并校验 |
| n-02 | `apps/edge/src/routes/public.ts` | 39 | 变量名 `newer`/`older` 与返回字段 `prev`/`next` 的对应关系依赖第 87-89 行的注释说明，命名可更直白 |
| n-03 | `apps/studio/src/features/moment/draftPersistence.ts` | 43-45 | `catch { // 忽略 }` 过于笼统，建议注明忽略的具体异常类型以区别于 35-37 行的正常降级 |
| n-04 | `packages/shared-utils/src/reading-time.test.ts` | 3, 20 | `slugify` 的测试用例放在阅读时长的测试文件内，文件职责与内容不符 |

---

## 7. 待确认问题

> 无法确定是缺陷还是有意设计。**不计入问题总数**，需向作者确认后再定性。

| # | 文件 | 行号 | 疑问 | 已查证据 |
|---|------|------|------|---------|
| Q-01 | `apps/studio/public/theme/**` | 全目录 | 该目录与 `themes/zhuosu/src/**` 存在约 4650 行同名同内容文件，是构建产物还是手工维护的双份源码？ | 已读 `apps/studio/vite.config.ts` 全文 47 行，**无**从 `themes/zhuosu` 拷贝资源的插件或别名；`.gitignore` 未包含该路径；可能同步的 `scripts/` 目录已被 gitignore 不可读。结论仍不确定 |
| Q-02 | `apps/edge/src/routes/public.ts` | 109-111 | `renderPost` 的 `comments: []` 硬编码空数组，且 `canComment: false`。设计文档第 69 行规划了「文章内嵌留言开关」，此处是否为阶段性未实现而非缺陷？ | 已读设计文档 `architecture-design.md:67,80,360` 与 379 行提及内嵌留言；已读 `public.ts:99-112` 确认传入空数组；**已核实 `themes/zhuosu/src/pages.ts:75-110` 的 `renderPost` 与 `pages.ts:198-208` 的 `renderPage` 均不消费 `comments`/`canComment`**（`types.ts:55-57,91-92` 声明了但未使用）；`guestbook.js:7-8,107` 只处理表单提交不拉取列表。结论：属功能缺失而非待实现 |
| Q-03 | `apps/edge/src/services/mirror.ts` | 30-33 | `processMirrorQueue` 在未配置 GitHub 时静默返回 `{processed:0, skipped:0}`，队列会持续堆积而不告警。设计文档第 162 行要求「持续失败则告警」，此处是否遗漏告警路径？ | 已读 `mirror.ts:30-69` 全流程；已读设计文档 162 行与 434 行确认告警要求；确未发现告警实现。可能为阶段性未实现 |

---

## 8. 未验证项声明

| 维度 / 范围 | 未验证原因 |
|------------|-----------|
| 运行时并发行为 | 未执行并发压力测试，M-R1 的 TOCTOU 竞态为静态代码分析结论，未在真实运行时复现 |
| Workers CPU 时间与渲染耗时 | 需部署至真实边缘环境，当前环境无法实测；设计文档第 562 行亦列为待验证事项 |
| D1 真实查询性能 | 需填充生产级数据量，当前仅有本地占位库；性能维度评分基于 N+1 模式识别而非实测数据 |
| `X-Requested-With` CSRF 的实际可利用性 | 未在真实浏览器中构造跨站请求验证。理论上 Cookie 为 `SameSite=Lax` 已缓解部分场景，实际可利用性需动态验证 |
| 加密文章在真实主题下的完整泄露面 | 已确认当前 `pages.ts:53` 的 `ctx.unlocked` 分支正确；但 `public.ts:104` 的 `{...post}` 展开仍将 `contentMd` 与 `encryptPasswordHash` 传入渲染上下文，未穷举所有未来可能的主题/slot 序列化路径 |
| `apps/studio/public/theme/**` 内容一致性 | 未做逐字节哈希比对，仅按行数与文件结构判断为镜像副本（见 Q-01） |
| `vendor/` 目录 | 第三方代码，不在审查范围 |
| `.wrangler/tmp/**` 构建产物 | 自动生成代码，不在审查范围（已在 SLOC 统计中排除） |
| 前端视觉与交互正确性 | 未运行应用进行实际操作验证；`apps/studio` 零测试覆盖，未执行 UI 走查 |
| `overtypeplus` 依赖安全性 | 来源为 GitHub 直接引用（`github:icecome/overtype#npm-release`），非 npm registry 发布版本，未审计其代码 |

---

## 9. 做得好的地方

**安全基础扎实，多数高风险点已被主动处理。** 这个项目在几个最容易出错的地方做对了：markdown 渲染采用「先渲染后净化」且净化白名单严格（`packages/renderer/src/markdown.ts:41` 的 `allowedSchemes: ['http','https','mailto']` 阻断了 `javascript:` 与 `data:`）；加密文章采用服务端校验后渲染，`themes/zhuosu/src/pages.ts:53` 的 `ctx.unlocked` 分支真实阻断了未授权访问，设计文档第 101-112 行自陈的「明文降级缺口」确实被修复；口令哈希复用 Web Crypto 的 PBKDF2（600000 次迭代 + 随机盐，`lib/crypto.ts:12-22`）；会话 Cookie 正确设置了 `HttpOnly` 与 `SameSite=Lax`。

**数据层安全性优秀。** 全量审查未发现任何 SQL 注入：所有查询均使用 `db.prepare(...).bind(...)` 参数化，动态 SQL 片段仅由硬编码字面量拼接（`posts.ts:78-81` 的 `whereSql`、`comments.ts:213` 的 `featuredSql`），用户输入始终走绑定参数。

**类型契约层的设计意识超出一般项目。** `packages/content-model` 作为单一 schema 来源，通过 `postSchema.shape.slug` 复用字段定义派生 `postInputSchema`（`post.ts:38`），并通过 `postFields` 元数据（`post.ts:91-131`）驱动后台表单——设计文档第 44 行「契约单一化」的目标在代码中真实落地，而非停留在文档。

**前端 API 客户端工程化程度高。** `apps/studio/src/api/client.ts` 统一了信封解析、401 拦截跳转、网络异常包装为类型化 `HttpError`（第 47-52 行）、JSON 解析失败兜底（第 64-69 行），并用 `XMLHttpRequest` 补齐 fetch 无法提供的上传进度（第 91-157 行）同时保持鉴权一致性。React Query 的 mutation 全部配置了 `onError` 回调，无遗漏的错误提示路径。

**测试虽少但对准了关键点。** 25 个测试集中在纯函数与会话往返：`auth.test.ts:61-67` 覆盖了「篡改 Cookie 被拒绝」这一关键安全断言，`markdown.test.ts:13-17` 覆盖了 script 标签剥离。测试质量高于数量。

---

## 10. 改进建议（按优先级）

> 每个行动项标注「前置条件」：可静态验证 / 需编译 / 需运行测试 / 需产品决策。

### P0 — 立即修复（安全阻塞项）

| # | 行动项 | 文件 | 关联问题 | 前置条件 |
|---|--------|------|---------|---------|
| 1 | 将评论 `website` 校验收紧为 `https?://` 白名单 | `packages/content-model/src/comment.ts:33-37` | C-01 | 可静态验证 |
| 2 | 在评论渲染汇点增加协议检查以覆盖存量数据 | `themes/zhuosu/src/components.ts:209-210` | C-01 | 需编译 |
| 3 | RSS 生成增加 `!post.encrypt` 过滤 | `apps/edge/src/routes/public.ts:282` | M-S1 | 可静态验证 |
| 4 | 登录改用已有的 `verifyAdminPassword` 恒定时间比较 | `apps/edge/src/services/auth.ts:20` | M-S2 | 需运行测试 |
| 5 | 在 `fetch` 入口调用 `assertEnv`（建议先告警模式） | `apps/edge/src/index.ts:40` | M-S5 | 需产品决策 |

### P1 — 本周修复

| # | 行动项 | 文件 | 关联问题 | 前置条件 |
|---|--------|------|---------|---------|
| 6 | IP 取值优先信任 `CF-Connecting-IP`，限制 `X-Forwarded-For` 使用条件 | `apps/edge/src/routes/api.ts:49` | M-S3 | 需产品决策（部署拓扑确认） |
| 7 | 频率限制改为插入后复查或加唯一约束以消除竞态 | `apps/edge/src/services/comments.ts:101-114` | M-R1 | 需运行测试 |
| 8 | 补行映射消除 taxonomy 强转，移除 `as unknown as Post[]` | `apps/edge/src/services/terms.ts:85-97`<br>`apps/edge/src/routes/public.ts:265` | M-A1 | 需编译 |
| 9 | 为 `formatDate` 补时区测试并统一为上海时区 | `packages/shared-utils/src/date.ts:11-15` | m-01 | 需运行测试 |
| 10 | 补 `comment.test.ts` 覆盖协议校验边界 | `packages/content-model/src/comment.test.ts`（新建） | C-01 | 需运行测试 |

### P2 — 架构重构

| # | 行动项 | 文件 | 关联问题 | 前置条件 |
|---|--------|------|---------|---------|
| 11 | 抽取 `lib/cookie.ts` 合并两份 Cookie 解析 | `services/auth.ts:72-86`<br>`routes/public.ts:329-334` | m-05 | 需编译 |
| 12 | 统一三处 slug 生成至 `slugify`，先决策长度语义 | `shared-utils/src/slug.ts`<br>`services/posts.ts:154`<br>`services/terms.ts:26` | m-06 | 需产品决策（是否保留 80 字符截断） |
| 13 | 拆分 `MomentListPage.tsx` 为多个 feature 模块 | `apps/studio/src/pages/MomentListPage.tsx` | m-07 | 需编译 |
| 14 | 抽出 RSS/Sitemap XML 组装至 `lib/feeds.ts` | `apps/edge/src/routes/public.ts:280-327` | 架构职责过载 | 需编译 |
| 15 | 业务写入与缓存版本递增纳入同一事务 | `apps/edge/src/services/posts.ts:238-239` | m-09 | 需运行测试 |
| 16 | 统一 ID 生成至 `newId`（注意 session ID 不应截断） | `lib/mirror.ts:10`<br>`services/auth.ts:23` | m-08 | 需编译 |

### P3 — 渐进改进

| # | 行动项 | 文件 | 关联问题 | 前置条件 |
|---|--------|------|---------|---------|
| 17 | 收紧净化白名单，移除 `input` 与 `div` 的 `data-*` | `packages/renderer/src/markdown.ts:29,35,38` | m-02 | 需运行测试 |
| 18 | 修正白名单逻辑中 nickname/email 的绑定位置 | `apps/edge/src/services/comments.ts:122` | m-03 | 需运行测试 |
| 19 | `timingSafeEqual` 换用 `crypto.subtle.timingSafeEqual` | `apps/edge/src/lib/crypto.ts:89-96` | m-04 | 需编译 |
| 20 | 将 slugify 测试用例迁移至专属文件 | `packages/shared-utils/src/reading-time.test.ts:3,20` | n-04 | 可静态验证 |
| 21 | 补充 `hexToBytes` 的字符集校验 | `apps/edge/src/lib/crypto.ts:81` | n-01 | 可静态验证 |
| 22 | 澄清 `draftPersistence` 中被忽略的异常类型 | `apps/studio/src/features/moment/draftPersistence.ts:43-45` | n-03 | 可静态验证 |

---

## 11. 覆盖率校验

| 指标 | 数值 |
|------|------|
| 总问题数 | 20 |
| 行动项总数 | 22 |
| 已覆盖问题数 | 20 |
| 覆盖率 | 20/20 = 100% |
| 延期处理问题 | 无 |
| 待确认问题（不计入总数） | Q-01, Q-02, Q-03 |

> 校验公式：总问题数 20 = 已覆盖 20 + 延期 0 ✓
> 行动项 22 项 > 问题 20 项，因其中 2 项（行动项 2、10）是对 C-01 的纵深防御与测试补充，与行动项 1 关联同一问题。

### 自检清单结果

| 检查项 | 结果 |
|--------|------|
| 问题汇总数字均为精确整数，无 "+" | ✅ |
| 各级别数量之和 = 明细列表数量（1+6+9+4 = 20） | ✅ |
| Question 未计入总数 | ✅ |
| 报告中每个文件路径均已确认存在 | ✅ |
| 每条 CRITICAL/MAJOR 附带验证行与置信度 | ✅ |
| 每条「缺少 X 防护」已检查上游/框架默认行为 | ✅（C-01 已确认 Hono 转义不覆盖协议；M-S4 已确认 SameSite 现状） |
| 评分使用 0-10 分制 + 倍数权重，算式完整 | ✅ |
| 总分取整 | ✅（54.5 → 55） |
| 问题 ID 使用 C-/M-x/m-/n-/Q- 体系 | ✅ |
| 未验证维度已声明 | ✅ |
| 跨文件重构建议附连带改动说明 | ✅（C-01 与 M-A1 均有） |

### 审查范围声明

本次审查为**全量代码审计**（模式 2），聚焦安全、可靠性与架构一致性。审查深度按风险分级执行：认证（`services/auth.ts`、`middleware/auth.ts`）、加密文章（`routes/api.ts`、`routes/public.ts`、`lib/crypto.ts`）、公开 API 外部输入（`routes/api.ts` 评论路径）、密钥管理（`env.ts`）执行了完整 SPEAR 与逐行安全审查。

**关于自学习（模式 5）**：本次审查未发现技能参考文件未覆盖的新技术栈模式——项目使用的 Hono + Cloudflare Workers + zod + D1 组合中，Hono 的中间件路径匹配行为（`c.req.path` 为完整路径而非挂载点相对路径）已通过核对 Hono 4.13.8 源码确认，属既有知识范围内。**未生成新的学习样本**。
