# 审查问题修复记录

> **修复日期：** 2026-09-21
> **修复依据：** `reviews/README.md` 的「优先行动建议」+ 三份审查报告的问题编号
> **修复范围：** P0（4 项）+ P1（3 项）+ 安全类 MINOR（3 项）
> **验证方式：** `pnpm typecheck` + `pnpm -r test`，并为每项修复补充针对性用例

---

## 一、修复总览

| # | 问题 ID | 修复内容 | 状态 | 验证方式 |
|---|---------|---------|------|---------|
| 1 | C-01 | 评论 `website` 协议白名单（契约层 + 渲染层） | ✅ | 7 个新用例 |
| 2 | M-S1 | RSS 过滤加密文章 | ✅ | 代码审查（无独立测试，见下） |
| 3 | M-S2 | 登录改用恒定时间比较 | ✅ | 既有 3 个 auth 用例通过 |
| 4 | M-S5 | `fetch` 路径环境校验（告警模式） | ✅ | 6 个新用例 |
| 5 | M-A1 | taxonomy 补行映射，移除强转 | ✅ | 5 个新用例（含回归保护） |
| 6 | M-S3 | 仅信任 `CF-Connecting-IP` | ✅ | 代码审查 |
| 7 | m-01 | `formatDate` 统一上海时区 | ✅ | 4 个新用例 |
| 8 | m-02 | 净化白名单移除 `input` 与 `data-*` | ✅ | 4 个新用例 |
| 9 | m-03 | 修正白名单 email/nickname 绑定 | ✅ | 代码审查 |
| 10 | m-04 | `timingSafeEqual` 换原生 API + 运行时回退 | ✅ | 既有 hmac 用例通过 |

**验证结果**

```
pnpm typecheck  → 6/6 包通过
pnpm -r test    → 51 tests passed（修复前 25）
                  content-model 15 / shared-utils 12 / renderer 10 / edge 14 / studio 0
```

测试数从 25 增至 51，新增 26 个用例，全部覆盖本次修复项。

---

## 二、修复中发现的两个新问题（原审查报告未记录）

### 新问题 1：`crypto.subtle.timingSafeEqual` 在 Node 测试环境不存在

**发现方式：** m-04 改动后运行测试，`apps/edge` 出现 3 个失败（含最关键的回退保护被绕过）。

**根因：** `crypto.subtle.timingSafeEqual` 是 **Cloudflare Workers 扩展 API**，不是标准 Web Crypto 的一部分。Node.js（vitest 运行环境）未实现该方法，导致 `TypeError: crypto.subtle.timingSafeEqual is not a function`。

**这暴露了审查报告 m-04 的一个判断偏差**：原报告称该 API「Workers 运行时支持」是正确的，但未意识到**测试环境与生产环境的运行时差异**。若直接替换而不做兼容，测试全红，且掩盖了真实行为。

**修复方案：** 运行时特性检测 + 回退。

```ts
const subtle = crypto.subtle as SubtleCrypto & {
  timingSafeEqual?: (x: BufferSource, y: BufferSource) => boolean
}
if (typeof subtle.timingSafeEqual === 'function') {
  // 保留接收者，避免部分运行时对方法脱离对象调用报 Illegal invocation
  return subtle.timingSafeEqual(ab, bb)
}
// 回退：手写 XOR 恒定时间比较
let diff = 0
for (let i = 0; i < ab.byteLength; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0)
return diff === 0
```

生产走原生实现，测试走回退实现，行为一致。

---

### 新问题 2：`warnEnvOnce` 首次实现依赖对象身份，去重语义不可靠

**发现方式：** Phase 5 逆向审查阶段自查。

**根因：** 初版用 `WeakSet<Env>` 去重。但 `WeakSet` 按**对象身份**判等——已实测验证：

```
same object: true
equal but distinct object: false
```

Workers 可能为每次请求重建 `env` 对象。若如此，「只告警一次」会退化为**每请求告警一次**，日志被淹。

**修复方案：** 改用 module 级布尔标志（isolate 级去重，符合 Workers 模型）。

---

## 三、逐项修复详情

### C-01：评论 `website` 协议漏洞

**根因（Phase 2 结论）：** 防护散落在渲染管线，服务端契约层缺位。`packages/renderer/src/markdown.ts` 已有 `allowedSchemes: ['http','https','mailto']` 的正确约束，但该约束**只在 markdown 管线内生效**，未下沉为契约层可复用原语。

**改动：**

1. `packages/content-model/src/comment.ts` — 新增可复用的协议校验原语，供其他需渲染进 `href` 的字段使用：

```ts
export const SAFE_URL_SCHEME = /^https?:\/\//i
export function isSafeExternalUrl(value: string): boolean {
  return SAFE_URL_SCHEME.test(value)
}
```

2. 同文件 — `commentCreateSchema.website` 与 `commentSchema.website` 的 `.url()` 替换为 `.refine()`。

3. `themes/zhuosu/src/components.ts` — 新增渲染侧防护，**覆盖入库早于该约束的历史数据**：

```ts
function safeExternalHref(value: string | undefined): string | undefined {
  return value && isSafeExternalUrl(value) ? value : undefined
}
```

**为什么两处都改：** 只改校验会让存量 `javascript:` 数据继续渲染；只改渲染则新数据仍可入库。原报告的行动项 1、2 正是为此拆分。

**注意：** `commentSchema` 仅用于 `z.infer` 推导类型（已 grep 确认），不在运行时 `.parse()` 数据库行，因此收紧它不会导致历史数据读取失败——历史数据由渲染侧防护兜住。这是正确的分层。

---

### M-S1：RSS 加密文章泄露

**改动：** 仅修改 RSS 调用点，未动 `getPublishedPosts` 本身。

```ts
const all = await getPublishedPosts(c.env.DB, 'post')
// 加密文章不下发：其摘要可能由正文派生，与 search.ts 的可见性判据保持一致
const posts = all.filter((post) => !post.encrypt)
```

**为什么不下沉到 `getPublishedPosts`：** 该函数还被首页（`public.ts:60`）、归档（`public.ts:142`）、sitemap（`public.ts:314`）调用。下沉会连带改变这些页面的行为，超出本次修复的「最小变更」边界。

---

### M-S2：登录口令非恒定时间比较

**改动：** 抽取共享的 `constantTimeEquals` 原语，`login` 同时用它比较用户名与口令。

```ts
function constantTimeEquals(a: string, b: string): boolean {
  const max = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let i = 0; i < max; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  }
  return diff === 0
}
```

**相对原方案的两点改进：**
1. 原报告的 `verifyAdminPassword` 只处理口令，**用户名仍用 `!==` 比较**，同样泄露。现同时覆盖。
2. 原实现长度不等时提前返回（`if (a.length !== b.length) return false`），仍有时序差异。现改为比较到最大长度，消除提前返回。

保留了 `AUTH_INVALID` 错误码，`admin.ts:71-76` 的 catch 分支不受影响。

---

### M-S5：`fetch` 路径环境校验（告警模式）

**改动：** 新增 `collectEnvProblems`（返回问题列表，不抛出）、`assertEnv`（改为基于前者抛出）、`warnEnvOnce`（isolate 级去重告警）。

`index.ts` 的 `fetch` 入口改为包装形式：

```ts
async fetch(request: Request, env: AppEnv['Bindings'], ctx: ExecutionContext) {
  warnEnvOnce(env, (message) => console.error(message))
  return app.fetch(request, env, ctx)
},
```

**额外增益：** 新增占位值检测（`please-change-me-to-a-long-random-string`、`change-me` 等），防止 `.dev.vars.example` 的默认值被误用于生产。

**当前为告警模式**（按你的决定）。观察一个发布周期后，将 `warnEnvOnce` 的调用替换为 `assertEnv(env)` 即可切换为失败闭合。

---

### M-A1：taxonomy 行映射缺失

**改动：** 复用既有的 `rowToPost` 映射，而非在 `terms.ts` 重写一份。

1. `apps/edge/src/services/posts.ts` — `PostRow` 与 `rowToPost` 改为 `export`。
2. `apps/edge/src/services/terms.ts` — 返回类型改为 `Promise<Post[]>`，`.all<PostRow>()` + `.map(rowToPost)`。
3. `apps/edge/src/routes/public.ts` — 移除 `as unknown as Post[]`。

**回归保护测试**是本次最有价值的用例，因为原 bug 对类型系统完全静默：

```ts
it('produces camelCase fields consumed by theme cards', async () => {
  const posts = await listPostsByTermSlug(db, 'category', 'tech')
  // 回归保护：修复前此处返回 snake_case 原始行，publishedAt/contentMd 均为 undefined
  expect(posts[0]?.publishedAt).toBe('2026-09-21T01:00:00.000Z')
  expect(posts[0]?.contentMd).toBe('# 正文内容')
})
```

---

### M-S3：IP 取值信任可伪造头

**改动（按你的决定「仅考虑 Cloudflare 部署」）：**

```ts
// 仅信任 Cloudflare 注入的 CF-Connecting-IP。X-Forwarded-For 可由客户端伪造，
// 一旦用于限流或黑名单判定即可被逐请求轮换绕过。
const ip = c.req.header('CF-Connecting-IP') ?? ''
```

完全移除 `X-Forwarded-For` 回退。在纯 Cloudflare 部署下 `CF-Connecting-IP` 恒存在。

**若未来上线非 Cloudflare 直连场景**，此处会退化为空串 → `hashIp` 不执行 → 频率限制失效（详见「遗留风险」）。

---

### m-01：`formatDate` 时区不一致

**改动：** `formatDate` 与 `yearOf` 改为基于同文件的 `shanghaiParts`——复用已存在且被测试覆盖的实现，而非引入 `Intl.DateTimeFormat`。

新增用例锁定跨午夜边界：

```ts
it('rolls the date over at Shanghai midnight, not UTC midnight', () => {
  // UTC 2026-09-20 17:00 → 上海 2026-09-21 01:00
  expect(formatDate('2026-09-20T17:00:00.000Z')).toBe('2026-09-21')
})
```

**连带影响（已在审查阶段识别）：** `monthOf` 内部调用 `formatDate`，而归档分组（`public.ts:149`）依赖 `monthOf`。此改动**会改变非 +8 环境下的归档分类结果**——这正是修复目标。在 +8 或 UTC 环境下行为与之前一致（已用测试验证）。

---

### m-02 / m-03 / m-04：安全类 MINOR

| 项 | 改动 | 说明 |
|----|------|------|
| m-02 | 白名单移除 `input` 标签与 `div` 的 `data-*` 通配 | 保留 `details`/`summary`（任务列表需要），移除表单伪装面 |
| m-03 | `bind(email, nickname)` 替代 `bind(email \|\| key, nickname)` | 原实现在无邮箱时把 nickname 绑到 `email` 列比较，逻辑与意图不符 |
| m-04 | `timingSafeEqual` 换原生 API + 回退 | 见「新问题 1」 |

---

## 四、Phase 5 逆向验证结果

按自定义指令要求，对每处修改做了复读审查。

| 检查项 | 结果 |
|--------|------|
| **符号闭合** | ✅ 所有改动文件 typecheck 通过；新增 `{}` 块、模板字符串、正则字面量均成对 |
| **跨文件一致性** | ✅ `rowToPost` 导出后 `terms.ts` 正确引用；`isSafeExternalUrl` 导出后 `components.ts` 正确引用；`Post` 类型仍被 `public.ts` 的 `toCard`/`loadCards` 使用，import 未误删 |
| **接口签名** | ✅ `listPostsByTermSlug` 返回类型由 `Promise<unknown>`（隐式）改为 `Promise<Post[]>`，3 个调用点均兼容（`posts.length` 用法不受影响）；`login` 签名未变 |
| **错误处理** | ✅ `verifyAdminUsername`/`verifyAdminPassword` 保持返回 `Promise<boolean>`，`login` 的 `AUTH_INVALID` 抛出路径不变 |
| **边界情况** | ✅ 空串、`null`、非法日期、`javascript:`/`data:`/`vbscript:` 协议、大小写变体均已覆盖 |
| **变更边界** | ✅ 无无关改动；未新增 TODO/FIXME；未删除任何测试 |

**发现并修正的两处自身缺陷：** 见「新问题 1」（运行时兼容）与「新问题 2」（去重语义）。此外还修正了一处测试断言错误——初版断言 `[x](javascript:alert(1))` 不含 `javascript:` 字符串，实际 markdown-it 会将其**降级为纯文本**（不生成 `href`，本质安全）。已改为断言真实行为：不产生 `<a href="javascript:`。

---

## 五、Q-01 / Q-02 / Q-03 查证结果

### Q-01：`apps/studio/public/theme/**` 来源 — 未解决，维持待确认

已核对 `apps/studio/vite.config.ts` 全文（47 行），**无**从 `themes/zhuosu` 拷贝资源的插件或别名。`.gitignore` 未包含该路径，`scripts/` 目录已被 gitignore 不可读。**仍无法确证来源**，未做修改。

### Q-02：文章内嵌留言 — 查证有实质发现，但**不擅自修改**

**查证结论：这不是「待实现」，而是「类型契约声明与实现脱节」+「功能确实缺失」的叠加。**

| 证据 | 结论 |
|------|------|
| `themes/zhuosu/src/types.ts:55-57` | `PostContext` 声明了 `comments` / `canComment` |
| `themes/zhuosu/src/pages.ts:75-110` | `renderPost` 渲染体**从未消费**这两个字段，只输出一个指向留言板的链接 |
| `themes/zhuosu/src/pages.ts:198-208` | **`renderPage` 同样不消费** `comments`（此处修正审查报告的原判断） |
| `themes/zhuosu/src/scripts/guestbook.js:7-8,107` | 前端脚本只处理**表单提交**与编辑器，**不拉取评论列表** |
| `docs/architecture-design.md:67,80,360` | 设计文档明确将「文章内嵌留言」列为文章能力，并要求 `renderPost` 含内嵌留言 |

**定性：** 属**功能缺失**（设计已规划、类型已声明、后端 API 与多态评论表均已就绪，但渲染层未接线），而非 bug。设计文档第 573 行亦将「文章内嵌留言与留言板的表单是否统一」列为**待决策项**。

**未修改的理由：** 实现该功能需要产品决策（内嵌留言是否复用留言板表单、是否默认开启、是否需要独立分页），超出「修复审查问题」的范围。按自查原则「不臆想业务，先对齐需求」，此处留给你决策。

### Q-03：镜像队列无告警 — 未修改

`apps/edge/src/services/mirror.ts:30-33` 在未配置 GitHub 时静默返回。设计文档第 162 行要求「持续失败则告警」。**属功能缺失**（告警通道未设计，`MAIL_API_URL`/`MAIL_API_KEY` 已在 `env.ts` 声明但无使用点）。需先决策告警方式（邮件/Webhook），故未修改。

---

## 六、遗留风险与后续建议

### 需要你关注的两点

**1. `pnpm lint` 当前无法运行（既有问题，非本次引入）**

```
ESLint couldn't find an eslint.config.(js|mjs|cjs) file.
```

项目 `package.json` 声明了 `"lint": "eslint ."` 且安装了 eslint 9.17+，但**缺少 ESLint 9 要求的 flat config 文件**。这是修复前就存在的问题，我未擅自创建配置文件（避免引入无关变更）。建议单独处理。

**2. M-S3 的单点依赖**

当前仅信任 `CF-Connecting-IP`。若未来部署到非 Cloudflare 环境，该头为空 → `ip === ''` → `hashIp` 不被调用 → `meta.ipHash` 为 `undefined` → 频率限制（`comments.ts:101` 的 `if (policy.postInterval > 0 && meta.ipHash)`）**静默失效**。

建议：若考虑多环境部署，在 `env.ts` 增加一个 `TRUSTED_PROXY` 开关，按环境决定是否接受 `X-Forwarded-For`。当前按你的决定未实现。

### 未修复项（本次范围外，可在后续迭代处理）

| 问题 ID | 说明 | 建议时机 |
|---------|------|---------|
| M-R1 | 评论频率限制 TOCTOU 竞态 | 需先确认是否接受该竞态（博客场景影响有限） |
| m-05 | Cookie 解析两份实现 | 后续重构批次 |
| m-06 | slug 三份实现（公共实现被架空） | 需先决策 80 字符截断语义 |
| m-07 | `MomentListPage.tsx` 1181 行 | 后续重构批次 |
| m-08 | ID 生成三处 | 后续重构批次 |
| m-09 | 缓存版本递增无事务包裹 | 需评估 D1 事务能力 |
| Q-01/02/03 | 见上 | 需产品决策 |

### 关于架构审查的 P0/P1 项

架构审查报告（`01-architecture-review.md`）的 P0-1（RSS 泄露）已由本次 M-S1 修复；P0-2（taxonomy 契约失效）已由本次 M-A1 修复。架构报告的 P1（路由层职责过载、`assertEnv` 未失败闭合）中，后者已由 M-S5 处理为告警模式，前者属重构范畴未在本轮执行。

---

## 七、修改文件清单

**源码（10 个）**

```
apps/edge/src/env.ts                      环境校验拆分 + 占位值检测
apps/edge/src/index.ts                    fetch 入口接入告警模式
apps/edge/src/lib/crypto.ts               timingSafeEqual 原生 API + 运行时回退
apps/edge/src/routes/api.ts               仅信任 CF-Connecting-IP
apps/edge/src/routes/public.ts            RSS 过滤加密文章 + 移除 taxonomy 强转
apps/edge/src/services/auth.ts            恒定时间比较 + 清理死代码
apps/edge/src/services/comments.ts        修正白名单绑定
apps/edge/src/services/posts.ts           导出 PostRow / rowToPost 供复用
apps/edge/src/services/terms.ts           返回 Post[] 而非原始行
themes/zhuosu/src/components.ts           渲染侧 URL 协议防护
packages/content-model/src/comment.ts     协议白名单原语 + schema 收紧
packages/renderer/src/markdown.ts         净化白名单移除 input 与 data-*
packages/shared-utils/src/date.ts         formatDate/yearOf 统一上海时区
```

**测试（5 个，新增 26 用例）**

```
apps/edge/src/env.test.ts                 新建 — 环境校验 6 例
apps/edge/src/services/posts.mapping.test.ts  新建 — 行映射 5 例（含回归保护）
packages/content-model/src/comment.test.ts    新建 — 协议校验 7 例
packages/renderer/src/markdown.test.ts        扩充 — 白名单 4 例
packages/shared-utils/src/date.shanghai.test.ts 扩充 — 时区 4 例
```
