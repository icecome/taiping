# 代码复用阶梯评估报告

> **评估对象：** taiping_blog（边缘运行时轻量博客管理系统）
> **评估日期：** 2026-09-21
> **评估框架：** Code Reuse Ladder（7 步决策阶梯）
> **评估范围：** 全量源码目录
> **评估性质：** 只读分析，未修改任何代码

---

## 评估方法说明

本次评估遵循技能定义的**全局执行策略**：

1. **零成本前置检查优先**：先执行 Step 3（标准库）与 Step 4（原生 API），因其几乎不消耗上下文且无需扫描代码库；
2. **命中即停**：任一步骤产生匹配立即停止并输出结论；
3. **证据驱动**：所有复用建议必须给出明确的文件路径、API 名称或官方文档依据。

**反模式规避声明**：本次评估未跳过任何步骤，未直接跳至 Step 7（从零实现）；所有结论均先执行了 Step 3/4 零成本前置检查。对于「仅一处使用且不足 5 行」的场景，优先 Step 6（内联）而非 Step 2（代码库抽取），避免过度工程化的复用。

---

## 一、评估结果汇总

| 代码单元 | 位置 | 阶梯结论 | 优先级 |
|---------|------|---------|--------|
| 手写 hex 编解码 | `apps/edge/src/lib/crypto.ts:74-87` | Step 6 — INLINE_ONE_LINE（保留当前实现） | LOW |
| 手写 timingSafeEqual | `apps/edge/src/lib/crypto.ts:89-96` | Step 4 — USE_NATIVE_API（**有改进空间**） | MEDIUM |
| 手动 Cookie 解析 | `apps/edge/src/services/auth.ts:72-86`<br>`apps/edge/src/routes/public.ts:329-334` | Step 2 — PARTIAL_REUSE（**应当合并**） | HIGH |
| 频率限制（评论提交间隔） | `apps/edge/src/services/comments.ts:101-114` | Step 2 — REUSE_EXISTING（已复用，但实现有缺陷） | HIGH |
| 「动态 WHERE + COUNT + 分页」三段式 | `services/posts.ts:59-101`<br>`services/comments.ts:173-205`<br>`services/media.ts:83-120` | Step 6 — INLINE（暂不抽取） | LOW |
| 日期格式化 | `packages/shared-utils/src/date.ts:5-30` | Step 3 — USE_STDLIB（**存在正确性缺陷**） | HIGH |
| 阅读时长分级 | `packages/shared-utils/src/reading-time.ts` | Step 2 — REUSE_EXISTING（正确） | — |
| slug 生成 | `packages/shared-utils/src/slug.ts`（架空）<br>`services/posts.ts:154-157`<br>`services/terms.ts:26-32` | Step 2 — PARTIAL_REUSE（**三份实现，公共实现仅被测试引用**） | MEDIUM |
| markdown 渲染 + 净化 | `packages/renderer/src/markdown.ts` | Step 5 — USE_THIRD_PARTY_FULL（正确） | — |
| 唯一 ID 生成 | `lib/cache.ts:42-44`、`lib/mirror.ts:10` | Step 4 — USE_NATIVE_API（部分复用） | MEDIUM |
| URL 校验（评论 website） | `packages/content-model/src/comment.ts:33-37` | Step 4 — USE_NATIVE_API（**配置不当**） | HIGH |
| 主题静态资源双份副本 | `apps/studio/public/theme/**`<br>`themes/zhuosu/src/**` | Step 2 — REUSE_EXISTING_DEPRECATE | MEDIUM |

---

## 二、逐单元详细评估

### 1. 手写 hex 编解码

**Location:** `apps/edge/src/lib/crypto.ts:74-87`

**Current implementation:** `bytesToHex` / `hexToBytes` 各约 7 行手写循环

**Ladder result:** Step 3 前置检查 → 未命中（JavaScript 标准库无 `Uint8Array` 与 hex 字符串的互转方法，`TextEncoder` 只处理 UTF-8 文本）→ Step 4 检查 → 未命中（Web Crypto 的 `crypto.subtle` 输出 `ArrayBuffer`，不做 hex 编码）→ Step 6 — `INLINE_ONE_LINE`

**Reuse evidence:** 无第三方来源。当前实现正确且短（含空行 14 行），无副作用。

**Migration cost:** S（< 1 小时）

**Breaking change:** No

**Test coverage:** `apps/edge/src/lib/crypto.test.ts` 存在，间接覆盖（PBKDF2 哈希往返）

**Recommendation:**
- **保留当前实现**。该单元已在项目内部被 `crypto.ts` 与 `auth.ts` 复用，属 Step 2 意义上的「已存在于代码库」，但因其为最底层工具且仅有两处派生需要，抽取为独立包无收益。
- 唯一建议：`hexToBytes` 对奇数长度抛错（第 81 行），但对**非 hex 字符**（如 `"zz"`）会静默解析为 `NaN` 并写入 `Uint8Array`（第 84 行 `Number.parseInt` 返回 `NaN` 时 `Uint8Array` 元素为 0）。该函数的输入来源是内部存储的哈希字符串（`verifyPassword` 第 29-30 行解析自数据库），非外部直接输入，风险可接受。

**Priority:** LOW

---

### 2. 手写 timingSafeEqual

**Location:** `apps/edge/src/lib/crypto.ts:89-96`

**Current implementation:** 逐字符 XOR 累加以避免早期返回

**Ladder result:** Step 3 前置检查 → 未命中（JS 标准库无恒定时间比较原语，`String.prototype` 的一切比较都是短路语义）→ Step 4 — `USE_NATIVE_API`

**Reuse evidence:** 运行时已提供原生恒定时间比较原语 `crypto.subtle.timingSafeEqual`（Web Crypto 扩展 API，Workers 运行时支持）。参考 [Cloudflare Workers Web Crypto 文档](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)。

当前实现的问题：

```ts
// crypto.ts:89-96
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false   // ← 长度比较本身是短路的
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}
```

第 90 行的长度提前返回泄露了**签名长度**信息。对 HMAC-SHA256 的 hex 输出（恒为 64 字符）而言这不构成实际泄露，因为长度恒定；但函数被设计为通用工具，未来若用于非定长输入（如密码）即产生时序泄露。

**Migration cost:** S（< 1 小时）

**Breaking change:** No（函数签名不变，仅内部实现替换）

**Test coverage:** `crypto.test.ts` 覆盖 PBKDF2 往返；`auth.test.ts:61-67` 覆盖「篡改 cookie 被拒绝」，可验证替换后行为不变

**Recommendation:**
- 替换为原生 API，消除手写密码学原语：

```ts
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder()
  const [ab, bb] = [enc.encode(a), enc.encode(b)]
  if (ab.byteLength !== bb.byteLength) return false
  return crypto.subtle.timingSafeEqual(ab, bb)
}
```

- **注意连带改动**：该函数当前被 `verifyPassword`（第 49 行）与 `hmacVerify`（第 66 行）同步调用，改造后二者需 `await`。`verifyPassword` 与 `hmacVerify` 本身已是 `async`，但其**调用点**需核对：`hmacVerify` 被 `validateSession`（`services/auth.ts:59`，已在 async 上下文）与 `verifyUnlockToken`（`services/auth.ts:124`，已在 async 上下文）调用，均无需改动。
- 若不愿异步化，保留当前实现亦可接受——因为在 HMAC 场景下输入长度恒定，无实际泄露。**这是一个可选的改进而非缺陷修复**。

**Priority:** MEDIUM

---

### 3. 手动 Cookie 解析 — 应当合并

**Location:** `apps/edge/src/services/auth.ts:72-86`（`parseSessionCookie`）+ `apps/edge/src/routes/public.ts:329-334`（`parseCookie`）

**Current implementation:** 两处独立实现「按 `;` 分割 → trim → 前缀匹配 → 取值」

**Ladder result:** Step 2 — `PARTIAL_REUSE`

**Reuse evidence:** 同一代码库内已有两个同构实现：

```ts
// services/auth.ts:76-79
const parts = cookieHeader.split(';').map((p) => p.trim())
const raw = parts.find((p) => p.startsWith(`${COOKIE_NAME}=`))
if (!raw) return null
const value = raw.slice(COOKIE_NAME.length + 1)

// routes/public.ts:331-333
const parts = header.split(';').map((p) => p.trim())
const hit = parts.find((p) => p.startsWith(`${name}=`))
return hit ? hit.slice(name.length + 1) : undefined
```

二者语义等价（差异仅在未命中时返回 `null` vs `undefined` 及是否进一步解析三段结构），属技能定义的「**语义等价匹配**」——尽管函数名不同，输入输出映射与边界处理一致。

**测试覆盖门槛检查**：`parseSessionCookie` 被 `auth.test.ts` 间接覆盖（第 49-51 行 login→validate 往返、第 61-67 行篡改拒绝）；`public.ts` 的 `parseCookie` **无直接测试**。按技能规则，候选复用目标测试覆盖率不足时不应直接推荐复用——因此建议**以 `auth.ts` 版本为基准抽取**（有测试），而非以 `public.ts` 版本为基准。

**Migration cost:** S（< 1 小时）

**Breaking change:** No

**Test coverage:** 候选（`parseSessionCookie`）覆盖良好；`public.ts:parseCookie` 为 0

**Recommendation:**
- 在 `apps/edge/src/lib/cookie.ts` 抽取通用 `readCookie(header, name): string | undefined`，两个调用点改为引用。
- 采用**绞杀者模式**：先新增 `lib/cookie.ts` 并让新代码使用，两个旧函数标注为内部实现细节，待确认无其他调用点后删除。
- **连带改动清单**：`parseSessionCookie` 的调用点在 `services/auth.ts` 内（第 44、57 行）；`parseCookie` 的调用点在 `routes/public.ts:93`（加密文章解锁校验）。合并后需确认 `parseSessionCookie` 额外的「三段结构校验」（第 80-84 行）保留在新函数的上层而非下沉到通用读值函数中——否则会给 `public.ts` 的调用点引入意外的 `null` 语义。

**Priority:** HIGH（消除重复且涉及鉴权路径，及早统一可降低后续分歧风险）

---

### 4. 频率限制 — 已复用但实现有缺陷

**Location:** `apps/edge/src/services/comments.ts:101-114`

**Current implementation:** 查询该 IP 最近一条评论时间，与 `postInterval` 比较

**Ladder result:** Step 2 — `REUSE_EXISTING`（正确复用了既有评论表，未引入额外存储）

**Reuse evidence:** `resolveCommentStatus` 复用 `comments` 表的 `ip_hash` 列做限流查询（第 104 行），未引入 Redis/KV 等额外存储——这符合技能「先复用已有」的原则，且与设计文档第 194 行「建议先只上 D1」的轻量取向一致。

**缺陷提示**（属代码审查范畴，此处仅作复用决策的输入）：该实现的限流键依赖 `ip_hash`，而 `ip_hash` 派生自可能被伪造的 IP 头（见代码审查报告 M-S2）。**不建议为此引入第三方限流库**（Step 5 评估：`rate-limiter-flexible` 等库体积与 Workers 运行时适配成本高于收益），而应保留现有 D1 方案并修复 IP 取值。

**Migration cost:** S（< 1 小时，仅改 IP 取值行）

**Breaking change:** No

**Test coverage:** 无直接测试（需补）

**Recommendation:**
- **保留 D1 限流方案**，不引入第三方库。修复 `routes/api.ts:49` 的 IP 取值优先级（优先信任 `CF-Connecting-IP`，`X-Forwarded-For` 仅在明确处于可信代理后时使用）。
- 补充竞态测试：当前实现存在 TOCTOU（两次并发提交可能同时读到同一条「最近评论」），修复方案是在插入后复查而非插入前检查，或接受该竞态（对博客评论场景影响有限）。

**Priority:** HIGH

---

### 5. 「动态 WHERE + COUNT + 分页」三段式 — 暂不抽取

**Location:** `services/posts.ts:59-101`、`services/comments.ts:173-205`、`services/media.ts:83-120`

**Current implementation:** 三处各自实现「构建 WHERE 数组 → join → COUNT 查询 → SELECT LIMIT/OFFSET」

**Ladder result:** Step 2 检查 → 存在同构实现；Step 6 评估 → **`INLINE`（暂不抽取）**

**Reuse evidence:** 三处骨架确实同构：

```ts
// posts.ts:63-91 / comments.ts:177-198 / media.ts:84-92 的共同结构
const where: string[] = []
const binds: unknown[] = []
if (cond) { where.push('col = ?'); binds.push(val) }
const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
// → COUNT(...) + SELECT ... LIMIT ? OFFSET ?
```

**但不建议抽取**，理由：

1. **反模式「过度工程化复用」**：三处当前完全同构，但差异点已经存在——`posts.ts` 需要 JOIN 语义外的 `getPostTerms` 逐行补充（第 94-98 行），`comments.ts` 附加 `featuredSql`（第 213 行），`media.ts` 的 LIKE 条件（第 84 行）与其他两处形态不同。
2. **抽象成本高于收益**：抽出的 `buildListQuery` 需要接收表名、列清单、条件构造器、绑定数组，参数数量本身已构成复杂度；且 SQL 片段拼接一旦抽象过度，会遮蔽各查询的索引利用情况（如 `posts.ts` 的 `COALESCE(published_at, created_at) DESC` 排序依赖特定索引）。
3. **技能的 5 行原则**：这段骨架抽取后的通用函数必然远超 5 行，属 Step 6 不适用的场景，但也**不满足 Step 2 的「强匹配」标准**——它是部分匹配，而 `PARTIAL_REUSE` 的价值在提取公共子集，此处公共子集过小（仅 `where.join(' AND ')` 一行）。

**Migration cost:** L（> 1 人/天，含全量回归）

**Breaking change:** Yes（若改变返回类型）

**Test coverage:** 三处均无直接测试

**Recommendation:**
- **暂不抽取**。待出现**第二次**差异化需求（例如某列表需要游标分页而非 offset 分页）时再评估，届时抽象边界会更清晰。
- 更优先的动作是**为三处补充分页边界测试**（空结果、超出末页、pageSize 上限），这比抽取本身更能防止回归。

**Priority:** LOW

---

### 6. 日期格式化 — 存在正确性缺陷

**Location:** `packages/shared-utils/src/date.ts:5-30`

**Current implementation:** `formatDate` 用 `getFullYear/getMonth/getDate/getHours/getMinutes` 组装

**Ladder result:** Step 3 — `USE_STDLIB`（存在的 **`Intl.DateTimeFormat`** 未被使用）

**Reuse evidence:** 运行时已提供 `Intl.DateTimeFormat`，可原生处理时区：

```ts
new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(iso))
```

当前实现的问题是**隐式使用宿主机本地时区**（第 11-15 行全部为本地 getter）。同一文件的第 47-58 行 `shanghaiParts` 却显式做了 `+8h` 偏移并读取 `getUTC*`——**同一文件内混用两种时区哲学**。

在 UTC 机器（CI、海外服务器）与 +8 机器上，`formatDate` 会产出不同的墙钟时间。已实测验证：

```
TZ=UTC, new Date('2026-09-21T01:00:00.000Z').getHours() → 1     (本地 UTC)
同上，正确应为 Asia/Shanghai 的 9 时
```

**Migration cost:** S（< 1 小时）

**Breaking change:** Yes（输出值在非 +8 环境下会变化——这正是修复目的，但需评估现有调用点的期望）

**Test coverage:** `packages/shared-utils/src/date.shanghai.test.ts` 有 4 个测试，但**只覆盖 `shanghaiParts`/`shanghaiDateKey`，未覆盖 `formatDate`**——这是缺陷得以存在的原因

**Recommendation:**
- 优先方案：`formatDate` 改为基于 `shanghaiParts` 实现（复现同一文件内已有的、经过测试的实现），而非引入 `Intl`——因为它已在 `date.ts:47` 实现且被测试覆盖，属 Step 2 的 `REUSE_EXISTING`，比 Step 3 引入新 API 更保守。
- 若需支持多时区展示，再用 `Intl.DateTimeFormat` 替换。
- **连带改动清单**：`formatDate` 的调用点需 grep 全仓确认。已知调用点包括 `themes/zhuosu/src/pages.ts:65`（文章日期）、`packages/shared-utils/src/date.ts:28-29`（`monthOf` 内部）、后台组件的日期展示。改动会使非 +8 环境下的显示日期发生偏移——**这正是修复目标**，但需确认无依赖旧行为的逻辑（如按 `monthOf` 做分组键，`public.ts:149` 归档分组依赖 `monthOf`，若分组键变化会改变归档页归类）。
- 补充 `formatDate` 的时区测试：在测试中显式设置 `process.env.TZ = 'UTC'` 并断言输出为上海时间。

**Priority:** HIGH（静默的显示正确性问题，且修复成本低）

---

### 7. 阅读时长分级

**Location:** `packages/shared-utils/src/reading-time.ts`（30 行）

**Current implementation:** 按中文字数分级映射到「弹指可览 / 片刻即毕 / 阅需一刻 / 半炷香时 / 一炷香时 / 细品慢读」

**Ladder result:** Step 1 检查（功能必要性）→ **需要**（设计文档第 90 行明确列为复刻项）→ Step 2 — `REUSE_EXISTING`（项目内已实现且被复用）

**Reuse evidence:** 被 `renderer/src/markdown.ts:53-54` 的 `deriveReadingTime` 与 `renderer/src/derive.ts:29` 复用，形成单一实现点。

**Migration cost:** —

**Breaking change:** No

**Test coverage:** `packages/shared-utils/src/reading-time.test.ts`，4 个测试

**Recommendation:** **无需改动**。这是本次评估中复用结构最健康的单元：单一实现、单一职责、有测试覆盖、有明确复用链路。

**Priority:** LOW

---

### 8. slug 生成 — 三份实现，公共实现被架空

**Location:**
1. `packages/shared-utils/src/slug.ts:1-9`（`slugify`，**公共实现**）
2. `apps/edge/src/services/posts.ts:154-157`（内联副本 A，标签）
3. `apps/edge/src/services/terms.ts:26-32`（内联副本 B，分类/标签）

**Current implementation:** 三份语义相同的 slug 化逻辑

**Ladder result:** Step 2 — `PARTIAL_REUSE`（且是本次评估中最严重的复用失效）

**Reuse evidence — 三份实现逐行比对：**

```ts
// ① packages/shared-utils/src/slug.ts:1-9 —— 公共实现，带 .slice(0,80) 截断
export function slugify(input: string): string {
  const base = input
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return base || `post-${Date.now().toString(36)}`
}

// ② apps/edge/src/services/posts.ts:154-157 —— 内联副本 A（无 .trim()、无截断）
const slug = trimmed
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, '-')
  .replace(/^-+|-+$/g, '') || `tag-${Date.now().toString(36)}`

// ③ apps/edge/src/services/terms.ts:28-32 —— 内联副本 B（无 .trim()、无截断）
input.name
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, '-')
  .replace(/^-+|-+$/g, '') || `term-${Date.now().toString(36)}`
```

三者的**核心转换链完全一致**（`toLowerCase` → `[^\p{L}\p{N}]+` 替换为 `-` → 去首尾连字符），差异仅在三处：`trim()` 有无、`slice(0,80)` 截断有无、回退前缀不同。

**关键证据 — 公共实现被架空：**

```
grep "slugify" 全仓命中 3 处：
  packages/shared-utils/src/slug.ts:1        （定义）
  packages/shared-utils/src/reading-time.test.ts:3,20  （仅被测试引用）
```

`slugify` **没有任何生产代码调用**。这是一个「已建好正确抽象但无人使用」的典型失效——比单纯的重复更值得警惕，因为它说明共享包的引入未配套迁移既有内联实现。

**语义差异的潜在影响**：公共实现有 `.slice(0, 80)`，而两个内联副本没有长度上限。`postSchema.slug` 的校验规则是 `max(200)` + 正则（`packages/content-model/src/post.ts:12-15`），但 `terms` 表的 slug 无长度约束（见 `migrations/0001_init.sql:46-52`）。超长中文标签名经内联副本生成的 slug 可能超出预期长度，而以 `slugify` 的规则会被截断至 80——**统一前需先确认应以哪个长度为准**，否则会改变既有数据的 slug 形态。

**Migration cost:** M（< 1 人/天，含三处替换 + 现有数据兼容性评估）

**Breaking change:** Yes（若统一采用 `slugify` 的 `slice(0,80)`，超长名称的 slug 形态会变化；若历史数据已入库，需评估是否需要数据迁移）

**Test coverage:** `slugify` 有间接覆盖（`reading-time.test.ts:20` 断言 `slugify('Hello World 你好')` 匹配 `/hello-world/`，但该用例放在错误的测试文件中）；两个内联副本覆盖率为 0

**Recommendation:**
- **先决策长度语义**：确认 terms 的 slug 是否需要 80 字符上限。建议统一采用 `slugify` 规则（有上限更安全，避免索引膨胀）。
- 将 `posts.ts:151-172` 的 `resolveOrCreateTerms` 与 `terms.ts:26-32` 的 slug 生成统一替换为 `slugify` 调用，需 `import { slugify } from '@taiping/shared-utils/slug'`。
- 回退前缀差异（`tag-` / `term-` / `post-`）建议由调用方传入，例如 `slugify(name, { fallbackPrefix: 'tag' })`——当前的三套前缀本身就是「不该分散」的信号。
- **连带改动清单**：
  - `packages/shared-utils/src/reading-time.test.ts:3,20` 的 slugify 用例应迁移到新建的 `slug.test.ts`；
  - 需 grep 确认无其他内联 slug 逻辑（本次已覆盖 `apps/edge`，未覆盖 `apps/studio`）；
  - **存量数据**：数据库中已生成的 term slug 不会因代码统一而改变，但**再次编辑同名 term 时**可能因截断规则差异产生新 slug——需确认 `terms.ts:60` 的 update 路径（`input.slug?.trim() || existing.slug`）是否会触发意外的 slug 变更。
- 补 `slug.test.ts`，覆盖：中文、中英混合、连续分隔符、首尾分隔符、全分隔符（触发回退）、超 80 字符（触发截断）六类边界。

**Priority:** MEDIUM（提升理由：涉及三份实现且公共抽象被架空，是结构性复用问题而非单点重复）

---

### 9. markdown 渲染 + 净化

**Location:** `packages/renderer/src/markdown.ts`

**Current implementation:** `markdown-it` + `sanitize-html` 组合

**Ladder result:** Step 5.1 — `USE_EXISTING_DEP`（**健康**）

**Reuse evidence:**

```json
// packages/renderer/package.json
"markdown-it": "...",
"sanitize-html": "..."
```

二者均为成熟库，且项目正确采用了**「markdown-it 开 `html:true` + sanitize-html 严格白名单」**这一业界标准安全模式。白名单配置（第 20-42 行）经核对不含 `script`/`iframe`/`style`，`on*` 事件属性不在允许列表，`allowedSchemes` 限定为 `['http','https','mailto']`（阻断了 `javascript:`）。

**依赖健康度检查**（Step 5.1 测试门槛）：

| 维度 | 检查结果 |
|------|---------|
| 兼容性 | 通过——两者均为纯 JS，无原生依赖，Workers 兼容 |
| 体积 | 通过——`markdown-it` 与 `sanitize-html` 体积适中，已在生产使用 |
| 维护性 | 通过——两者均为长期活跃维护的成熟库 |

**Migration cost:** —

**Breaking change:** No

**Test coverage:** `packages/renderer/src/markdown.test.ts`，5 个测试（含「strips script tags」XSS 用例）

**Recommendation:** **无需改动**。这是 Step 5 正确决策的范例：没有手写 markdown 解析器或 HTML 净化器（那将是严重的安全负债），而是复用成熟第三方库并采用保守配置。

补充建议（非复用范畴）：白名单中 `input`（第 29、35 行）与 `div` 的 `data-*`（第 38 行）可考虑收紧——详见代码审查报告 m-04。

**Priority:** LOW

---

### 10. 唯一 ID 生成 — 部分复用

**Location:** `apps/edge/src/lib/cache.ts:42-44`（`newId` 包装 `createId`）、`apps/edge/src/lib/mirror.ts:10`（内联 `crypto.randomUUID`）、`services/auth.ts:23`（内联 `crypto.randomUUID`）

**Ladder result:** Step 4 — `USE_NATIVE_API`（`crypto.randomUUID` 正确复用）；Step 2 — `PARTIAL_REUSE`（包装层未被一致使用）

**Reuse evidence:** 项目已正确复用运行时原生 `crypto.randomUUID()`（Step 4 命中），且 `lib/cache.ts:42` 提供了 `newId(prefix)` 包装以生成带前缀的可读 ID。但 `lib/mirror.ts:10` 与 `services/auth.ts:23` **绕过包装层直接调用原生 API**：

```ts
// lib/mirror.ts:10 —— 未走 newId
const id = `mq_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
// services/auth.ts:23 —— 未走 newId
const sessionId = crypto.randomUUID().replace(/-/g, '')
```

**Migration cost:** S（< 1 小时）

**Breaking change:** No

**Test coverage:** 无直接测试

**Recommendation:**
- 评估 `newId` 的语义是否覆盖 mirror/session 的需求（它们需要去连字符与截断，而 `newId` 可能不满足），若满足则统一复用；若不满足，**应扩展 `newId` 而非继续内联**，例如增加 `newId(prefix, { stripDashes: true, length: 16 })` 选项。
- 注意 session ID 的截断长度影响熵：`auth.ts:23` 保留完整 32 hex 字符（128 bit），而 `mirror.ts:10` 截断至 16 字符（64 bit）——**session ID 不应被截断**，当前实现是正确的，扩展 `newId` 时需保留该差异。

**Priority:** MEDIUM

---

### 11. URL 校验（评论 website）— 配置不当

**Location:** `packages/content-model/src/comment.ts:33-37`

**Current implementation:** `z.string().url().optional().or(z.literal(''))`

**Ladder result:** Step 4 — `USE_NATIVE_API`（已用 zod 的 URL 校验，但**语义不符需求**）

**Reuse evidence:** zod 的 `.url()` 内部实现为 `new URL()` 校验。`new URL('javascript:alert(1)')` **不抛错**，因此该字段接受 `javascript:` 协议。该值最终被渲染进 `<a href>`（`themes/zhuosu/src/components.ts:209-210`），构成存储型 XSS 面（详见代码审查报告 M-S1）。

对比：同一代码库的 `markdown.ts:41` 已明确将 `allowedSchemes` 限定为 `['http','https','mailto']`——**同一项目内对 URL 协议安全已有正确认知，但该认知未应用到评论字段的校验上**。

**Migration cost:** S（< 1 小时）

**Breaking change:** Yes（拒绝原本被接受的 `javascript:` 等协议值——这是修复目标，无正当用途受影响）

**Test coverage:** 无（`comment.ts` 无独立测试）

**Recommendation:**
- 将 `.url()` 替换为显式协议白名单，复用项目既有的协议集合：

```ts
website: z.string()
  .refine((s) => !s || /^https?:\/\//i.test(s), '仅支持 http/https 链接')
  .optional()
  .or(z.literal(''))
```

- 或在渲染侧复用 `sanitize-html` 的 `naughtyHref` 机制做二次防护（纵深防御）。
- **连带改动清单**：`commentCreateSchema` 的调用点在 `apps/edge/src/routes/api.ts:45`。收紧校验后，存量数据库中的历史评论若含 `javascript:` 链接，渲染时仍会输出——建议在 `themes/zhuosu/src/components.ts:209` 渲染处增加协议检查以覆盖存量数据，而非仅依赖入库校验。
- 补充 `comment.test.ts`，覆盖 `javascript:`、`data:`、空字符串、正常 https 四类输入。

**Priority:** HIGH

---

### 12. 主题静态资源双份副本

**Location:** `apps/studio/public/theme/**` 与 `themes/zhuosu/src/**`

**Current implementation:** 大量同名同内容文件

**Ladder result:** Step 2 — `REUSE_EXISTING_DEPRECATE`

**Reuse evidence:** 逐对比对确认存在镜像副本：

| 文件 | `themes/zhuosu/src` | `apps/studio/public/theme` |
|------|--------------------|---------------------------|
| `styles/style.css` | 1199 行 | 1199 行 |
| `styles/lightbox.css` | 488 行 | 488 行 |
| `styles/guestbook.css` | 433 行 | 433 行 |
| `styles/code-toolbar.css` | 240 行 | 240 行 |
| `scripts/lightbox-core.js` | 410 行 | 410 行 |
| `scripts/lightbox-gallery.js` | 346 行 | 346 行 |
| `scripts/code-toolbar.js` | 207 行 | 207 行 |

合计约 4650 行重复。

**判断（已核对 vite 配置）**：

`apps/studio/vite.config.ts`（全文 47 行）**没有任何**从 `themes/zhuosu` 拷贝资源的插件或别名配置——`resolve.alias` 只映射了 `@taiping/content-model`、`@taiping/shared-utils` 与 `@/`（第 9-32 行），`build` 段只有 `outDir`/`sourcemap`（第 43-46 行）。Vite 会把 `public/` 目录原样复制到产物，但**不会自动从 `themes/zhuosu` 拉取资源**。

因此判定修正为：**这两份是手工维护的双份源码**（或由已 gitignore 的 `scripts/` 中某个外部脚本同步，该脚本不可读，无法确证）。无论哪种情况，`apps/studio/public/theme/**` 当前都是被 git 跟踪的实体文件，构成真实技术债。

若后续确认为外部脚本产物 → 应加入 `.gitignore` 并纳入构建流程。
若确认为手工双份 → 需建立单向同步。

**Migration cost:** M（需建立单向同步机制 + 校验）

**Breaking change:** No

**Test coverage:** 无

**Recommendation:**
- **第一步是确认来源**，而非直接动手。检查 `apps/studio/vite.config.ts` 是否配置了从 `themes/zhuosu` 拷贝资源的插件，并检查是否有 `prebuild` 脚本。
- 若确认为构建产物：将 `apps/studio/public/theme/` 加入 `.gitignore`，并在构建脚本中生成。
- 若为手工维护：采用绞杀者模式——以 `themes/zhuosu/src` 为唯一真源，`apps/studio/public/theme` 仅作为构建输出，新增 CI 校验（比对两者哈希，不一致则构建失败）。

**Priority:** MEDIUM

---

## 三、复用健康度小结

**做得好的部分**

项目在**最关键的复用决策上做出了正确选择**：markdown 解析与 HTML 净化复用成熟第三方库而非手写（`markdown-it` + `sanitize-html`），这避免了博客系统最常见、后果最严重的安全负债；PBKDF2 口令哈希复用 Web Crypto 原生实现而非自己实现密码学；评论限流复用既有 D1 表而非引入额外存储中间件。这三项是 Step 4/5 决策的正面范例。

`packages/shared-utils` 与 `packages/renderer` 作为独立包的存在，说明项目的复用意识是结构化的——阅读时长、日期、slug 等纯函数已被正确提取到共享层。

**主要缺口**

复用缺口集中在**服务层内部的短函数**上：Cookie 解析有两份、slug 生成有两份、ID 生成有三处（其中一处复用包装层、两处绕过）。这些重复单个危害有限，但共同反映出一个模式——**`lib/` 层缺少明确的「该放什么」约定**，导致同类工具在需要时被就近内联而非上移。

建议在 `apps/edge/src/lib/` 建立目录约定并在 README 或 `docs/` 中记录：`lib/` 仅存放被两个以上服务复用的无业务语义工具；单服务专用工具留在该服务文件内。这比事后抽取更能从根本上减少重复。

---

## 四、执行记录

本次评估未对任何既有复用目标做迁移（属评估阶段，按技能要求「只读」）。按技能规定，以下 `HIGH` 优先级结论建议纳入下一个迭代：

| 优先级 | 项 | 关联问题 |
|--------|-----|---------|
| HIGH | Cookie 解析合并至 `lib/cookie.ts` | 单元 3 |
| HIGH | 评论限流 IP 取值修复 | 单元 4 |
| HIGH | `formatDate` 时区修正 | 单元 6 |
| HIGH | 评论 `website` 协议校验收紧 | 单元 11 |
| MEDIUM | `timingSafeEqual` 换用原生 API | 单元 2 |
| MEDIUM | slug 生成统一 | 单元 8 |
| MEDIUM | ID 生成统一至 `newId` | 单元 10 |
| MEDIUM | 主题资源副本来源确认 | 单元 12 |
| LOW | hex 编解码、分页骨架、阅读时长 | 单元 1、5、7 |

**未评估项声明**

| 范围 | 未评估原因 |
|------|-----------|
| `apps/studio` 前端组件的复用机会 | 本次聚焦后端与共享包；前端组件复用评估需单独的组件树分析 |
| `vendor/` 目录内容 | 第三方代码，不在复用评估范围 |
| 构建脚本与 CI 配置 | `scripts/` 已被 gitignore，不可读；`.github/` 未发现有效 CI 配置 |
| 第三方依赖的许可证合规性 | 需专门的许可证扫描工具，超出技能范围 |
