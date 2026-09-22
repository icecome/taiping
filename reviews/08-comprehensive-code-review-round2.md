# 代码审查报告（第二轮 · 回归审查）

> **审查框架：** SPEAR（Security / Performance / Error Handling / Architecture / Reliability）
> **审查范围：** 全量源码，126 个源文件 / 约 17000 行（`apps/edge` + `apps/studio` + `packages/*` + `themes/zhuosu` + `scripts/`）
> **审查日期：** 2026-09-22
> **审查模式：** 回归审查（模式 6）+ 代码审计（模式 2）+ OWASP 安全审查（模式 3）
> **风险等级：** 🔴 高（Red）——包含认证/会话、加密文章、公开 API 外部输入入口、密钥与配置管理
> **审查轮次：** 第二轮（上轮：`reviews/03-comprehensive-code-review.md`，基线 55/100）

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
12. [上一轮修复验证](#12-上一轮修复验证)

---

## 1. 总体评分

### 加权总分：78/100 — 🟢 GOOD

| 维度 | 权重 | 评分 | 评分依据（对比上轮） |
|------|------|------|---------|
| 🔴 安全 | 3x | 8/10 | 上轮 1 个 CRITICAL + 4 个安全 MAJOR 已全部真实修复，本轮未复现任何高危漏洞；扣分项为防护应用不一致（`isSafeExternalUrl` 只覆盖评论一处）与 `assertEnv` 仍为告警模式 |
| 🟡 性能 | 2x | 6/10 | 与上轮持平。N+1 未消除且因 M-A1 修复而成本放大；新发现缓存版本机制「只写不读」的纯开销、两处串行上传、一处运行时 DDL |
| 🟠 错误处理 | 2x | 9/10 | 上轮 7 分。`assertEnv` 已接入 `fetch` 路径（告警模式，符合阶段性决策），`collectEnvProblems` 拆分合理；仅 `getSettings` 的 `.parse()` 缺乏兜底 |
| 🔵 架构 | 1.5x | 8/10 | 上轮 7 分。M-A1 移除 `as unknown as` 强转后契约层恢复一致；扣分项为缓存机制未接线、主题脚本双份副本 |
| 📊 可靠性 | 1.5x | 8/10 | 上轮 4 分。测试从 25 增至 80 个用例，新增回归保护测试价值高；`apps/edge` 路由层与 `apps/studio` 仍零覆盖 |

**加权算式：**

```
加权总分 = (S × 3) + (P × 2) + (E × 2) + (A × 1.5) + (R × 1.5)
        = (8 × 3) + (6 × 2) + (9 × 2) + (8 × 1.5) + (8 × 1.5)
        = 24 + 12 + 18 + 12 + 12
        = 78
```

**最终裁定：🟢 GOOD（75-89 区间），可批准。**

> **分制说明：** 本报告沿用上一轮的 0-10 整数评分 + 倍数权重（3x/2x/2x/1.5x/1.5x），口径与 `reviews/03` 完全一致，两轮分数具有可比性。加权总分 = (8×3)+(6×2)+(9×2)+(8×1.5)+(8×1.5) = 78，取整呈现。

### 跨轮对比

| 指标 | 第一轮 | 第二轮 | 变化 |
|------|--------|--------|------|
| 加权总分 | 55/100 | 78/100 | **+23** |
| CRITICAL | 1 | 0 | -1 |
| MAJOR | 6 | 2 | -4 |
| MINOR | 9 | 12 | +3 |
| NIT | 4 | 5 | +1 |
| 测试用例 | 25 | 80 | +55 |

> **分数可比性声明：** 两轮均使用「0-10 整数 + 倍数权重」同一口径，未切换百分比制，故 +23 分的提升结论有效。提升主要来自：1 个 CRITICAL 与 4 个安全 MAJOR 的真实闭环（贡献 +15 分），可靠性维度测试数翻 3 倍（贡献 +6 分）。

---

## 2. 问题汇总

### 按严重级别统计

| 级别 | 数量 | 说明 |
|------|------|------|
| 🔴 CRITICAL | 0 | 无 |
| 🟠 MAJOR | 2 | 缓存版本机制未接线（纯开销）、`getSettings` 无兜底导致全站 500 风险 |
| 🟡 MINOR | 12 | 防护不一致、N+1 成本放大、串行上传、blob URL 泄漏、运行时 DDL 等 |
| 🔵 NIT | 5 | 风格与命名 |
| **总计** | **19** | 等于各级别之和（0+2+12+5） |
| ⚪ Question | 2 | 待确认项，**不计入总计** |

### 按模块分布

| 模块 | CRITICAL | MAJOR | MINOR | NIT |
|------|----------|-------|-------|-----|
| `apps/edge` | 0 | 1 | 4 | 1 |
| `packages/content-model` | 0 | 1 | 1 | 0 |
| `packages/renderer` | 0 | 0 | 1 | 1 |
| `packages/shared-utils` | 0 | 0 | 1 | 1 |
| `themes/zhuosu` | 0 | 0 | 3 | 1 |
| `apps/studio` | 0 | 0 | 2 | 1 |

### 与上一轮的关系

| 类别 | 数量 | 说明 |
|------|------|------|
| 上轮问题已闭环 | 10 | C-01、M-S1~M-S5、M-A1、m-01~m-04（详见第 12 节） |
| 上轮问题仍存在 | 6 | M-R1、m-05~m-09（延期项，本轮维持） |
| 修复引入的新问题 | 1 | 本轮 M-P2（源自 M-A1 的修复） |
| 本轮全新发现 | 12 | M-R1、m-10~m-15、n-05 等 |

---

## 3. CRITICAL 问题详情

**本轮无 CRITICAL 级问题。**

上一轮的 C-01（评论 `website` 存储型 XSS）已真实修复并经独立验证，详见第 12 节。

---

## 4. MAJOR 问题详情

> 所有 MAJOR 表格统一使用「# / 文件 / 行号 / 问题 / 验证 / 置信度」六列。

### 可靠性/逻辑类

| # | 文件 | 行号 | 问题 | 验证 | 置信度 |
|---|------|------|------|------|-------|
| M-R1 | `packages/content-model/src/settings.ts`<br>`apps/edge/src/lib/settings.ts` | 51<br>19 | `getSettings` 使用 `siteSettingsSchema.parse(merged)`，校验失败即抛异常且无 `code` 属性，将落入 `errorHandler` 的 `INTERNAL` 分支。`postsPerPage` 声明了 `.min(1).max(50)`、`mediaStorageConfigSchema.quality` 声明了 `.min(10).max(100)` 等硬约束。若数据库中存在越界值或类型不符的历史记录（手工改库、旧版本写入、迁移不完整），**全站每个前台页面与后台接口都会 500**，且错误信息仅为「服务器内部错误」，难以定位 | 已读 `lib/settings.ts:6-20` 完整实现，确认第 19 行为 `.parse()` 非 `.safeParse()`；已读 `content-model/settings.ts:13,51,63` 确认三处硬范围约束；已读 `middleware/error.ts:4-19` 确认无 `code` 属性时走 `INTERNAL` 分支；已 grep `saveSettings`（`lib/settings.ts:23`）确认写入侧也走 `.parse()`，故正常流程不会写入越界值——但历史数据与手工改库不受此保护 | 确定 |
| M-P1 | `apps/edge/src/lib/cache.ts`<br>`apps/edge/src/services/*.ts` | 10<br>多处 | **接线检查命中：缓存版本机制只写不读。** `bumpCacheVersion` 有 13 个调用点（`posts.ts` 6 处、`moments.ts` 3 处、`terms.ts` 3 处 + 定义），但读取方 `getCacheVersions` **零调用点**，KV 绑定 `env.CACHE` **零使用点**。即：每次创建/更新/删除文章或说说、每次增删改分类标签，都会额外产生 1-2 次 D1 往返写入 `cache_versions` 表，而该版本号**从未被任何缓存失效逻辑消费**——纯空转开销 | 已 grep `bumpCacheVersion` 命中 13 处（全部为写入调用）；已 grep `getCacheVersions` 命中 **1 处**（仅 `cache.ts:10` 定义，无调用）；已 grep `cache_versions` 命中 3 处（全部在 `cache.ts` 内）；已 grep `CACHE` 确认 `env.CACHE` 在 `apps/edge/src` 下**零使用**（仅 `env.ts` 声明）；已读 `typescript.md` 接线检查条目确认此为「定义了但从未挂载」的典型形态 | 确定 |

---

## 5. MINOR 问题列表

| # | 文件 | 行号 | 问题 | 状态 |
|---|------|------|------|------|
| m-01 | `themes/zhuosu/src/components.ts` | 304, 313, 322 | 说说图片 `url` 与 `linkUrl` 直接插入 `href`/`src`/`data-src`，未复用 C-01 修复时建立的 `safeExternalHref` 防护。`moment.ts:5-8` 的 `momentPictureSchema.url` 仅为 `z.string().min(1)`，`linkUrl` 为 `z.string().optional()`，**与 `comment.website` 修复前的形态完全一致** | 本轮新发现 |
| m-02 | `themes/zhuosu/src/pages.ts` | 69 | 文章封面 `<img src="${post.cover}">` 同理，`post.ts:21` 的 `cover` 为 `z.string().optional()`，无协议约束 | 本轮新发现 |
| m-03 | `themes/zhuosu/src/components.ts` | 77, 125, 130, 136, 140 | 站点导航与社交链接 `item.url` 无协议检查（来自管理员填写的 `settings.navigation`/`social`）。同 m-01 属「防护不一致」范畴 | 本轮新发现 |
| m-04 | `apps/studio/src/features/moment/useMediaUpload.ts` | 124 | `URL.createObjectURL(file)` 创建 blob URL 后**全文件无 `revokeObjectURL`**。已 grep 确认 `createObjectURL` 全仓 4 处、`revokeObjectURL` 仅 3 处且全部在 `mediaUtils.ts` 内。每次选择 N 张图片泄漏 N 个 blob URL，长会话下持续累积内存 | 本轮新发现 |
| m-05 | `apps/edge/src/routes/public.ts` | 219-224<br>242-247 | `/categories` 与 `/tags` 列表页对每个 term 各执行一次 `listPostsByTermSlug`，构成 N+1。受 M-A1 修复影响，该函数从「直接返回原始行」变为 `.map(rowToPost)` 逐行映射，**N+1 之上每轮又多一次对象映射开销** | 本轮新发现（上轮 P2 提及未定级） |
| m-06 | `apps/edge/src/services/inbound.ts` | 156-162 | `claimWebhookEvent` 每次调用都执行 `CREATE TABLE IF NOT EXISTS webhook_events`（DDL），且已 grep 确认该表**不在任何 migration 中**（`apps/edge/migrations/` 6 个文件命中 0）。每次 webhook 请求多一次 DDL 往返 | 本轮新发现 |
| m-07 | `apps/studio/src/features/moment/useMediaUpload.ts`<br>`apps/studio/src/components/media/MediaPicker.tsx` | 131-145<br>79-98 | 两处上传均为**串行 for 循环**（每个文件依次「压缩 → base64 → 上传」）。9 张图的总耗时线性累加。`useMediaUpload` 注释说明串行是为保持顺序，但可改为并发上传后按序回收 | 本轮新发现 |
| m-08 | `apps/edge/src/lib/crypto.ts` | 97 | **m-04 修复不完整。** 上轮 m-04 指出「`timingSafeEqual` 按长度提前返回」。修复改动了最内层实现（换原生 API + 手写回退），但第 97 行 `if (ab.byteLength !== bb.byteLength) return false` **依然存在**，时序差异未消除。对定长 HMAC hex 输出无实际影响，但函数设计为通用工具 | 修复不完整 |
| m-09 | `apps/edge/src/middleware/auth.ts` | 22 | `c.req.path.endsWith('/auth/login')` 的兜底判断使**任何以 `/auth/login` 结尾的路径**跳过鉴权。已 grep 确认当前仅有 `admin.post('/auth/login')` 一处，且该中间件只作用于 `/api/admin/*` 前缀，**当前不构成实际漏洞**；但该写法在新增路由时易被误用 | 本轮新发现 |
| m-10 | `apps/edge/src/services/comments.ts` | 109-121 | 评论频率限制仍为「插入前检查」而非「插入后复查」。已确认 `comments` 表的 `ip_hash` 为普通 `TEXT` 列、**无 UNIQUE 约束**，数据库层亦无法阻断。维持上轮 M-R1 的判断（延期项，见第 12 节） | 上轮遗留 |
| m-11 | `apps/edge/src/services/auth.ts`<br>`apps/edge/src/routes/public.ts` | 317-331<br>336-341 | Cookie 解析仍存在两份语义等价实现（`parseSessionCookie` 与 `parseCookie`），重复劳动且易分歧 | 上轮遗留 |
| m-12 | `packages/shared-utils/src/slug.ts`<br>`apps/edge/src/services/posts.ts`<br>`apps/edge/src/services/terms.ts` | 1-9<br>154-157<br>26-32 | slug 生成仍存在三份实现，公共实现 `slugify` 仅被测试引用、无生产调用 | 上轮遗留 |

---

## 6. NIT 问题列表

| # | 文件 | 行号 | 问题 | 状态 |
|---|------|------|------|------|
| n-01 | `apps/studio/src/pages/MomentListPage.tsx` | 全文 | 1189 行，混合日期工具、日历单元格、热力图配色、标签聚合、5 个 UI 组件与页面编排七类职责。**正面确认**：三处事件监听（493/755/771）均有配对清理，无泄漏。属职责内聚度问题 | 上轮遗留 |
| n-02 | `apps/edge/src/lib/cache.ts`<br>`apps/edge/src/services/auth.ts`<br>`apps/studio/src/...` | — | 唯一 ID 生成仍存在多处（`newId` 包装层 + 直接内联 `crypto.randomUUID()`），未统一 | 上轮遗留 |
| n-03 | `apps/edge/src/lib/crypto.ts` | 80-87 | `hexToBytes` 对奇数长度抛错，但对非 hex 字符（如 `"zz"`）静默解析为 0，建议一并校验字符集 | 上轮遗留 |
| n-04 | `apps/studio/src/features/moment/draftPersistence.ts` | 43-45 | `catch { // 忽略 }` 仍过于笼统，建议注明忽略的具体异常以区别于 35-37 行的正常降级 | 上轮遗留 |
| n-05 | `apps/studio/src/lib/mediaUtils.ts` | 76 | `randomString` 用 `crypto.getRandomValues` 后取 `% chars.length`（36），引入轻微模偏差。用于文件名场景影响可忽略 | 本轮新发现 |

---

## 7. 待确认问题

> 无法确定是缺陷还是有意设计。**不计入问题总数**，需向作者确认后再定性。

| # | 文件 | 行号 | 疑问 | 已查证据 |
|---|------|------|------|---------|
| Q-01 | `apps/studio/public/theme/scripts/**`<br>`themes/zhuosu/src/scripts/**` | 全目录 | **上轮 Q-01 已定案（原判「无法确证」）。** 两份共 11 个同名文件，**SHA256 全部相同**（相同 11 / 不同 0）。`themes/zhuosu/package.json` 的 exports 声明 `"./scripts/*": "./src/scripts/*"` 为权威源；`apps/studio/vite.config.ts` **无任何拷贝插件或 publicDir 指向**，`build.outDir` 仅 `dist`。结论：`apps/studio/public/theme/scripts/` 是**手工复制的副本，无自动同步机制**——改一份忘另一份会导致前台行为分叉。定性为**维护风险**（架构类），是否引入同步脚本需产品决策 | 已对 11 个同名文件逐一计算 SHA256 比对；已读 `vite.config.ts` 全文 45 行确认无同步机制；已读 `themes/zhuosu/package.json` 确认 exports 声明；总大小 245,282 vs 248,686 字节（差值来自非同名文件） |
| Q-03 | `apps/edge/src/services/mirror.ts`<br>`apps/edge/src/index.ts` | 30-33 | `processMirrorQueue` 在未配置 GitHub 时静默返回 `{processed:0,skipped:0}`，队列持续堆积而不告警。上轮已查证设计文档第 162 行要求「持续失败则告警」但未实现。**维持上轮结论：属功能缺失，需先决策告警方式（邮件/Webhook）** | 已读 `mirror.ts:30-33` 确认静默返回；`env.ts:14-18` 声明了 `RESEND_API_KEY`/`RESEND_FROM` 但 `mail.ts` 中无告警类发信函数；`index.ts:71-84` 的 `scheduled` 仅处理镜像队列与登录记录清理 |

> **编号说明：** Q-01 与 Q-03 沿用上一轮 ID（`reviews/03` 中 Q-01 为主题脚本副本、Q-03 为镜像队列告警），符合「跨轮沿用原 ID」规则。上轮的 Q-02（文章内嵌留言）本轮已定性为功能缺失，从疑问清单移除，故本轮无 Q-02 条目。

---

## 8. 未验证项声明

| 维度 / 范围 | 未验证原因 |
|------------|-----------|
| 运行时并发行为 | 未执行并发压力测试。m-10（评论 TOCTOU）为静态代码分析结论，未在真实运行时复现；已确认无数据库层约束可阻断 |
| Workers CPU 时间与渲染耗时 | 需部署至真实边缘环境，当前环境无法实测 |
| D1 真实查询性能 | 需填充生产级数据量。m-05（N+1）的定量影响基于模式识别与调用次数推算，非实测 |
| `crypto.subtle.timingSafeEqual` 生产行为 | 该 API 为 Cloudflare Workers 扩展，本地 Node 环境不存在，无法验证生产路径。已确认回退实现（`crypto.ts:105-109`）逻辑正确 |
| `X-Requested-With` CSRF 的实际可利用性 | 未在真实浏览器构造跨站请求验证。Cookie 为 `SameSite=Lax` 已缓解部分场景（维持上轮结论，标注为 m-09 之外的既有风险） |
| `apps/edge/src/routes/*.ts` 路由层与 `apps/studio/**` | 两大模块仍**零测试覆盖**，未执行 UI 走查与端到端验证 |
| `vendor/` 目录 | 第三方代码，不在审查范围 |
| `.wrangler/tmp/**` 构建产物 | 自动生成代码，不在审查范围 |
| `overtypeplus` 依赖安全性 | 来源为 GitHub 直接引用（`github:icecome/overtype#npm-release`），非 npm registry 发布版本，未审计其代码 |
| `apps/studio/public/theme/**` 中的 CSS 与 HTML | 本轮仅比对 `scripts/` 下 JS 文件哈希，未覆盖样式与模板文件 |
| `scripts/import-hugo.mjs`、`scripts/smoke.mjs` | 一次性导入脚本与冒烟脚本，非生产运行时路径，未逐行审查 |
| 前端视觉与交互正确性 | 未运行应用进行实际操作验证 |

---

## 9. 做得好的地方

**上一轮的安全修复质量高于报告要求，且主动补强。** M-S2 的修复没有照搬报告的 `verifyAdminPassword` 方案，而是抽取了 `constantTimeEquals` 并**同时覆盖用户名与口令**（`auth.ts:97-99`）——原报告只指出了口令比较的问题，用户名同样存在时序泄露却被遗漏，修复者补上了这一层。同时把「长度不等时提前返回」改为「比较到最大长度」（`auth.ts:337-344`），比原建议更彻底。

**修复过程中主动发现并纠正了自身两处缺陷。** `04-fix-record.md` 记录了 `crypto.subtle.timingSafeEqual` 在 Node 测试环境不存在（改用运行时特性检测 + 回退）与 `WeakSet` 去重语义不可靠（改为 module 级布尔标志）。这两处若不自查，前者会让测试全红并掩盖真实行为，后者会让「只告警一次」退化为「每请求告警一次」。**本轮已独立验证 `warnEnvOnce`（`env.ts:75-84`）的 isolate 级去重逻辑正确。**

**回归保护测试的写法值得肯定。** `posts.mapping.test.ts` 针对 M-A1 的 bug 写了专门断言：

```ts
// 回归保护：修复前此处返回 snake_case 原始行，publishedAt/contentMd 均为 undefined
expect(posts[0]?.publishedAt).toBe('2026-09-21T01:00:00.000Z')
expect(posts[0]?.contentMd).toBe('# 正文内容')
```

该 bug 对类型系统完全静默（`as unknown as` 掩盖了字段名不匹配），只有这类针对性断言能防住回归。测试数从 25 增至 80，新增用例全部对准修复点，非凑数。

**C-01 的修复采用了正确的分层。** 契约层收紧（`comment.ts:26-29,46-50` 用 `.refine()` 替代 `.url()`）+ 渲染层兜底（`components.ts:10-12` 的 `safeExternalHref`）两层防护，且 `isSafeExternalUrl` 被抽为可复用原语导出。测试覆盖了 `javascript:`、大小写变体、`data:`、`vbscript:`、相对路径与空串共 7 类输入（`comment.test.ts:11-27`）——这份测试的边界覆盖度明显高于项目平均水平。

**数据层安全性继续保持优秀。** 全量审查未发现任何 SQL 注入：所有查询均使用 `db.prepare(...).bind(...)` 参数化，动态 SQL 片段仅由硬编码字面量拼接（`posts.ts:78-81` 的 `whereSql`、`comments.ts:227` 的 `featuredSql`），用户输入始终走绑定参数。`inbound.ts:336-343` 的 `listRepliesForComments` 用占位符数组动态构造 `IN (...)` 也是参数化写法，是正确的批量查询实现。

**`inbound.ts` 的 webhook 验签实现超出常见水准。** 双向时间窗（同时拒绝过旧与来自未来的时间戳，`inbound.ts:72-75`）、恒定时间签名比较（`:48-55`）、多条签名头遍历（`:80-85`，且正确处理了 base64 含 `+`/`/` 不能用逗号切分的细节）、事件幂等去重（`:161-179`）、发件人邮箱校验（`routes/inbound.ts:92-98`）——五层防护完整。中文注释 `inbound.ts:79` 准确解释了为何不能用逗号切分，是有价值的「非显然约束」注释。

---

## 10. 改进建议（按优先级）

> 每个行动项标注「前置条件」：可静态验证 / 需编译 / 需运行测试 / 需产品决策。

### P0 — 立即修复（无安全阻塞项，以下为稳定性优先）

| # | 行动项 | 文件 | 关联问题 | 前置条件 |
|---|--------|------|---------|---------|
| 1 | `getSettings` 改用 `.safeParse()`，校验失败时记录日志并回落到 schema 默认值，避免单条脏数据导致全站 500 | `apps/edge/src/lib/settings.ts:19` | M-R1 | 需运行测试 |
| 2 | 为 `postsPerPage`、`commentsPostInterval`、`quality` 等范围约束补充容错策略：越界值应钳制（clamp）而非抛错 | `packages/content-model/src/settings.ts:13,51,63` | M-R1 | 需产品决策（钳制 vs 拒绝） |

### P1 — 本周修复

| # | 行动项 | 文件 | 关联问题 | 前置条件 |
|---|--------|------|---------|---------|
| 3 | 决策缓存版本机制去留：若确定不使用 KV 缓存，**移除 13 处 `bumpCacheVersion` 调用与 `cache_versions` 表**，消除纯开销；若保留，则接线 `getCacheVersions` 到实际读取路径 | `apps/edge/src/lib/cache.ts`<br>`services/{posts,moments,terms}.ts` | M-P1 | 需产品决策 |
| 4 | `/categories` 与 `/tags` 的计数改为单条聚合 SQL（`GROUP BY term_id`），消除 N+1 | `apps/edge/src/routes/public.ts:219-224,242-247` | m-05 | 需运行测试 |
| 5 | 将 `webhook_events` 表移入 migration，移除请求路径中的 DDL | `apps/edge/migrations/`（新建 0007）<br>`services/inbound.ts:156-162` | m-06 | 需编译 |
| 6 | `useMediaUpload` 补齐 blob URL 释放：在图片上传完成或组件卸载时 `URL.revokeObjectURL` | `apps/studio/src/features/moment/useMediaUpload.ts:124` | m-04 | 需运行测试 |
| 7 | 补齐 `timingSafeEqual` 的长度分支处理，消除 m-04 残留的提前返回 | `apps/edge/src/lib/crypto.ts:97` | m-08 | 需运行测试 |
| 8 | 将 `safeExternalHref` 防护扩展到说说图片、外链、文章封面等同类汇点 | `themes/zhuosu/src/components.ts:304,313,322`<br>`themes/zhuosu/src/pages.ts:69` | m-01, m-02, m-03 | 需编译 |

### P2 — 架构重构

| # | 行动项 | 文件 | 关联问题 | 前置条件 |
|---|--------|------|---------|---------|
| 9 | 建立主题脚本同步机制（构建期拷贝或改为单一源 + 别名引用），消除双份副本 | `themes/zhuosu/src/scripts/**`<br>`apps/studio/public/theme/scripts/**`<br>`apps/studio/vite.config.ts` | Q-01 | 需编译 |
| 10 | 抽取 `lib/cookie.ts` 合并两份 Cookie 解析 | `services/auth.ts:317-331`<br>`routes/public.ts:336-341` | m-11 | 需编译 |
| 11 | 统一三处 slug 生成至 `slugify`，先决策长度语义 | `shared-utils/src/slug.ts`<br>`services/posts.ts:154`<br>`services/terms.ts:26` | m-12 | 需产品决策 |
| 12 | 拆分 `MomentListPage.tsx` 为多个 feature 模块 | `apps/studio/src/pages/MomentListPage.tsx` | n-01 | 需编译 |
| 13 | 移除 `middleware/auth.ts:22` 的 `endsWith` 兜底，改为精确路径匹配 | `apps/edge/src/middleware/auth.ts:22` | m-09 | 可静态验证 |

### P3 — 渐进改进

| # | 行动项 | 文件 | 关联问题 | 前置条件 |
|---|--------|------|---------|---------|
| 14 | 上传改为并发（`Promise.allSettled` + 按序回收），保留顺序语义 | `apps/studio/src/features/moment/useMediaUpload.ts:131-145`<br>`apps/studio/src/components/media/MediaPicker.tsx:79-98` | m-07 | 需运行测试 |
| 15 | 评论频率限制改为「插入后复查」或加唯一约束，消除 TOCTOU | `apps/edge/src/services/comments.ts:109-121` | m-10 | 需产品决策 |
| 16 | 统一 ID 生成至 `newId`（注意 session ID 不应截断） | `lib/mirror.ts`<br>`services/auth.ts:110` | n-02 | 需编译 |
| 17 | 补充 `hexToBytes` 的字符集校验 | `apps/edge/src/lib/crypto.ts:80-87` | n-03 | 可静态验证 |
| 18 | 澄清 `draftPersistence` 中被忽略的异常类型 | `apps/studio/src/features/moment/draftPersistence.ts:43-45` | n-04 | 可静态验证 |
| 19 | `randomString` 改用拒绝采样消除模偏差 | `apps/studio/src/lib/mediaUtils.ts:76` | n-05 | 可静态验证 |
| 20 | 为 `apps/edge` 路由层与 `apps/studio` 补充基础测试 | 全局 | 可靠性短板 | 需运行测试 |

---

## 11. 覆盖率校验

| 指标 | 数值 |
|------|------|
| 总问题数 | 19 |
| 行动项总数 | 20 |
| 已覆盖问题数 | 19 |
| 覆盖率 | 19/19 = 100% |
| 延期处理问题 | 无（m-10、m-11、m-12 列为 P2/P3 行动项，非延期） |
| 待确认问题（不计入总数） | Q-01, Q-03 |

> 校验公式：总问题数 19 = 已覆盖 19 + 延期 0 ✓
> 行动项 20 项 > 问题 19 项，因其中行动项 2 是对 M-R1 的契约层配套改动，与行动项 1 关联同一问题。

### 自检清单结果

| 检查项 | 结果 |
|--------|------|
| 问题汇总数字均为精确整数，无 "+" | ✅ |
| 各级别数量之和 = 明细列表数量（0+2+12+5 = 19） | ✅ |
| Question 未计入总数 | ✅ |
| 报告中每个文件路径均已确认存在 | ✅（43 个引用路径逐一 `Test-Path` 验证，缺失 0） |
| 报告中每个行号区间均已实际读取 | ✅（M-P1 初判 126 行，实测为 124 行；串行上传初判 134-148，实测 131-145，已修正） |
| 每条「缺少 X 防护」已检查上游/框架默认行为 | ✅（m-01~m-03 已确认 `moment.ts`/`post.ts` schema 确实无协议约束，非误报；`search.js:32` 经 `escapeHtml` 验证后**已排除**，未上报） |
| 每条 CRITICAL/MAJOR 附带验证行与置信度 | ✅ |
| 评分使用 0-10 分制 + 倍数权重，算式完整 | ✅ |
| 总分取整，无小数伪精度 | ✅ |
| 问题 ID 使用 C-/M-x/m-/n-/Q- 体系 | ✅ |
| 多轮审查沿用原 ID，新问题续新号 | ✅（m-01~m-09 为上轮已用 ID，故新问题从 m-10 起） |
| 未验证维度已声明 | ✅ |
| 跨文件重构建议附连带改动说明 | ✅（行动项 3、8、9 均列出全部受影响文件） |

### 审查范围声明

本次审查为**回归审查（模式 6）+ 全量代码审计（模式 2）**。审查深度按风险分级执行：认证（`services/auth.ts`、`middleware/auth.ts`、`services/authAttempts.ts`）、加密文章（`routes/api.ts`、`routes/public.ts`、`lib/crypto.ts`）、公开 API 外部输入（`routes/api.ts` 评论路径、`routes/inbound.ts` webhook）、密钥与配置管理（`env.ts`、`lib/settings.ts`）执行了完整 SPEAR 与逐行安全审查。

**关于自学习（模式 5）：** 本次审查未发现技能参考文件未覆盖的新技术栈模式。但本轮命中了 `references/verification.md` 中「接线检查（anti-Potemkin）」的标准形态——`bumpCacheVersion` 写入方 13 处、读取方 0 处，属该参考文件已明确覆盖的场景，无需新增学习样本。**未生成新的学习样本。**

---

## 12. 上一轮修复验证

> 对上一轮报告与 `04-fix-record.md` 声称的 10 项「已修复」，**逐项独立重读当前代码验证**，不采信修复记录的自述。

### 验证结果汇总

| 原问题 ID | 声称状态 | 本轮验证结论 | 证据 |
|----------|---------|-------------|------|
| C-01 | 已修复 | **验证通过** | 已读 `comment.ts:7-11` 确认 `SAFE_URL_SCHEME` 与 `isSafeExternalUrl` 已定义并导出；已读 `comment.ts:26-29,46-50` 确认两处 schema 均改用 `.refine()`；已读 `components.ts:10-12` 与 `:225-227` 确认渲染侧 `safeExternalHref` 已在汇点生效；已读 `comment.test.ts:11-27` 确认 7 类协议输入均有断言 |
| M-S1 | 已修复 | **验证通过** | 已读 `public.ts:286-288` 确认 `all.filter((post) => !post.encrypt)` 存在；已确认 `getPublishedPosts` 本身未改动，不影响首页/归档/sitemap 调用点 |
| M-S2 | 已修复 | **验证通过（超出原方案）** | 已读 `auth.ts:97-99` 确认 `constantTimeEquals` 同时用于用户名与口令；已读 `auth.ts:337-344` 确认无长度提前返回，比较到最大长度；已确认 `verifyAdminPassword` 死代码已清理 |
| M-S3 | 已修复 | **验证通过** | 已读 `api.ts:49-51` 确认仅取 `CF-Connecting-IP`，`X-Forwarded-For` 回退已完全移除；已确认 `admin.ts:86` 登录路径同样取值 |
| M-S4 | 未声称修复 | **维持存在** | `middleware/auth.ts:33-38` 仍为单一 `X-Requested-With` 头校验。修复记录未将 M-S4 列入修复范围（属 P1 延期项），本轮确认为**遗留风险**，已在 m-09 中一并说明 |
| M-S5 | 已修复 | **验证通过** | 已读 `env.ts:48-64` 确认新增 `collectEnvProblems`；已读 `env.ts:66-71` 确认 `assertEnv` 基于前者；已读 `env.ts:75-84` 确认 `warnEnvOnce` 用 module 级布尔标志（isolate 级去重，符合 Workers 模型）；已读 `index.ts:67-70` 确认 `fetch` 入口已接入告警模式 |
| M-A1 | 已修复 | **验证通过** | 已读 `terms.ts:87-103` 确认返回类型为 `Promise<Post[]>`、`.all<PostRow>()` + `.map(rowToPost)`；已读 `public.ts:269` 确认 `as unknown as Post[]` 已移除；已读 `posts.ts:11-32,34-57` 确认 `PostRow`/`rowToPost` 已导出 |
| m-01 | 已修复 | **验证通过** | 已读 `date.ts:5-28` 确认 `formatDate`/`yearOf`/`monthOf` 全部基于 `shanghaiParts`，无本地时区 getter 残留 |
| m-02 | 已修复 | **验证通过** | 已读 `markdown.ts:20-40` 确认白名单已移除 `input` 标签与 `div` 的 `data-*` 通配；`details`/`summary` 保留（任务列表需要） |
| m-03 | 已修复 | **验证通过** | 已读 `comments.ts:123-135` 确认 `.bind(email, nickname)` 已替换原 `.bind(input.email?.trim() \|\| key, ...)` |
| m-04 | 已修复 | **修复不完整** | 已读 `crypto.ts:94-110`：原生 API + 回退的双路径实现正确，但**第 97 行 `if (ab.byteLength !== bb.byteLength) return false` 仍在**，原报告指出的时序差异未消除。已开新条目 m-08 独立上报 |

**统计：验证通过 9 项 / 修复不完整 1 项 / 引入回归 0 项 / 确认误报 0 项。**

### 修复引入的回归检查

按 `references/learnings/2026-08-09_fix-regression-causal-pairs.md`（LR-001）的因果对清单逐项排查：

| 因果对模式 | 本项目是否命中 | 检查结果 |
|-----------|--------------|---------|
| Provider 嵌套顺序被破坏 | 不适用 | 项目未使用 React Context，`App.tsx:19-37` + `main.tsx:11-15` 的 Provider 全在单文件内 |
| 错误消息文案改动导致前端 `includes()` 失效 | 未命中 | 已 grep 前端无基于错误消息文本的状态判断；`client.ts:11-23` 的 `HttpError` 携带结构化 `status`，`client.ts:64` 用数字判断 401 |
| 「修复」被误判为问题的分支 | 未命中 | 已逐项比对修复内容与代码现状 |
| 评分口径切换 | 未命中 | 两轮均为「0-10 整数 + 倍数权重」，口径一致 |
| **修复造成性能开销放大** | **命中** | M-A1 修复使 `listPostsByTermSlug` 增加逐行映射开销，而该函数在 `/categories` 与 `/tags` 中被 N+1 调用 → 已开新条目 **m-05** 独立上报 |

### 误报根因回流

本轮**无以「确认误报」结案的条目**，但过程中剔除了 2 条候选误报，回流如下：

| 候选发现 | 误报根因 | 已执行的防控 |
|----------|---------|-------------|
| `search.js:32` 的 `results.innerHTML = items` 疑为 XSS 汇点 | 未先检查数据是否已转义 | 已读 `search.js:51-57` 确认 `item.title`/`item.excerpt` 均经 `escapeHtml`，`item.url` 为服务端生成的站内路径。**按 verification.md 步骤 3「防护是否已在别处存在」剔除** |
| `components.ts:230,239` 的 `raw(c.contentHtml)` 疑为 XSS 汇点 | 未追溯 `contentHtml` 的产生路径 | 已读 `comments.ts:147,380,478,521` 确认四处 `contentHtml` 均由 `renderMarkdownSafe` 生成（含 `sanitize-html` 白名单 + `allowedSchemes` 限制）。**按同一步骤剔除** |

### 延期项状态确认

| 问题 ID | 上轮状态 | 本轮确认 |
|---------|---------|---------|
| M-R1 → m-10 | 延期（待确认是否接受竞态） | **仍然成立**。已额外确认 `comments.ip_hash` 无 UNIQUE 约束（migration 中为普通 `TEXT`），数据库层无法阻断 |
| m-05 → m-11 | 延期（Cookie 解析重复） | 仍然成立，两份实现均未改动 |
| m-06 → m-12 | 延期（slug 三份实现） | 仍然成立，`slugify` 仍仅被测试引用 |
| m-07 → n-01 | 延期（MomentListPage 拆分） | 仍然成立，仍为 1189 行 |
| m-08 → n-02 | 延期（ID 生成统一） | 仍然成立 |
| m-09 | 延期（缓存版本无事务） | **性质升级**。本轮发现该机制**从未接线**（只写不读），已升级为 MAJOR 级 **M-P1** 独立上报 |
| Q-01 | 待确认 | **已定案**，详见第 7 节 |
| Q-02 | 待确认 | 已定性为功能缺失，移出疑问清单 |
| Q-03 | 待确认 | 维持待确认，沿用原 ID Q-03 |
