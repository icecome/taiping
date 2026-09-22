# 逐文件重复/复用审查报告（review-duplication）

> **审查对象：** taiping_blog 业务源码  
> **审查日期：** 2026-09-25（按会话时间）  
> **技能：** review-duplication（重复逻辑 / 重造工具 / 未复用既有约定）+ 最佳实践对齐  
> **范围（已确认）：** `packages/`、`apps/`、`themes/`、`scripts/` 中的一手代码；不含 `vendor/`、`docs/`、`reviews/`、`taiping-admin-design/`、lock/config 产物  
> **交付：** 对话内逐文件结论 + 本报告汇总  
> **性质：** 只读分析，未修改生产代码

---

## 0. 方法与基线

按 `review-duplication` 工作流：

1. 抽取核心机制（工具函数、组件、协议校验、ID/日期/slug、HTTP/密钥原语）；
2. 假设这些逻辑“本应住在”共享层，并对照：
   - `@taiping/shared-utils`：`nowIso` / `formatDate` / `formatDateTime` / `yearOf` / `monthOf` / `shanghaiParts` / `shanghaiDateKey` / `shanghaiTimeHm` / `calendarDateKey` / `calendarWeekdayMondayFirst` / `slugify` / `isValidSlug` / `plainText` / `excerptOf` / `truncate` / `encodeId` / `createId` / `countWords` / `readingMinutes` / `readingTimeLabel`
   - `@taiping/content-model`：各 zod schema 与 `isSafeExternalUrl`
   - `@taiping/renderer`：`renderMarkdownSafe` / `deriveExcerpt` / `deriveReadingTime` / `buildExcerptAndReading` / `findPrevNext` / `paginate` / `buildSearchDocs` / `filterSearchDocs`
   - Studio UI 基元：`Drawer` / `ConfirmDialog` / `Badge` / `Card` / `Tabs` 等
3. 逐文件比对实现与调用点；
4. 对齐错误处理、状态/主题、类型安全等既有约定；
5. 给出可落地的复用建议（源路径 + 符号 + 迁移要点）。

与 `reviews/02-code-reuse-assessment.md` 的关系：02 为复用阶梯评估；本报告是**全业务源码逐文件**扫描，包含 02 之后的新证据（例如 `formatDate` 已改为上海时区、`slugify` 已被 Studio 使用、`isSafeExternalUrl` 已落地到评论网站字段）。

---

## 1. 跨文件问题清单（优先看这里）

| ID | 主题 | 严重度 | 代表证据 | 建议复用目标 |
|----|------|--------|----------|--------------|
| C-01 | 主题静态资源双份镜像且已漂移 | **HIGH** | `apps/studio/public/theme/**` ↔ `themes/zhuosu/src/**`；`guestbook.css` 哈希不一致；`public/theme/scripts/zhuosu.css` 为脏副本 | 以 `themes/zhuosu/src` 为唯一真源；同步脚本 + CI 哈希校验 |
| C-02 | slug 正则 4 份、长度上限三套（80 vs 200） | **HIGH** | `shared-utils/src/slug.ts:7,12`；`content-model/src/post.ts:11-15`；`content-model/src/term.ts:10-14`；`TaxonomyPage.tsx:113` | 导出 `SLUG_RE` / `SLUG_MAX_LEN`，schema 与运行时同源 |
| C-03 | 外链协议校验未统一 | **HIGH** | `comment.ts` 已有 `isSafeExternalUrl`；`moment.ts:17-18,30-31` 无；`media.ts` URL 无；`lib/mail.ts:178` href 仅 HTML 转义 | 抽通用 `isSafeExternalUrl`，moment/media/mail/settings 共用 |
| C-04 | `extractHeadings` 实效 | **HIGH** | `renderer/src/markdown.ts:55-67` 依赖 heading `id`，但未挂 `markdown-it-anchor`（`renderer/package.json:20` 死依赖） | 接线 anchor，或删除函数 + 死依赖 |
| C-05 | Cookie 解析两套 | MEDIUM | `services/auth.ts:317-331` `parseSessionCookie`；`routes/public.ts:336-341` `parseCookie` | 抽 `lib/cookie.ts` 的 `readCookie` |
| C-06 | ID/token 多入口 | MEDIUM | `string.ts:25` `createId`；`lib/mirror.ts:10` 内联等价；`settings.ts:84` 自造；`auth.ts:110,195` / `comments.ts:318` 裸 UUID | 统一 `createId`；会话/重置 token 另设 `randomToken()`（不截断） |
| C-07 | Markdown 清洗与截断双实现 | MEDIUM | `string.ts:2-18` vs `reading-time.ts:16-20`；`excerptOf` 未调 `truncate`；`lib/mail.ts:171` 第三份 truncate | `stripMarkdownNoise` + `excerptOf→truncate` |
| C-08 | 恒定时间比较 / hex / HMAC 多份 | MEDIUM | `lib/crypto.ts` 私有未导出；`auth.ts:173-178,337-343`；`inbound.ts:35-55` | 导出 `bytesToHex` / `timingSafeEqual` / `sha256Hex` |
| C-09 | 分页 WHERE+COUNT+LIMIT 骨架 4 份 | MEDIUM | `services/{posts,comments,moments,media}.ts` 的 `list*` | 可选抽 `lib/d1.ts`；也可暂不抽象（见 §3） |
| C-10 | Studio 弹层未复用 Drawer/统一 Modal | MEDIUM | `MediaPicker.tsx` 自造 modal；`MomentListPage` 双 sheet；`DrawerHeader` 死代码 | 扩展 `Drawer`/抽 `Modal`，迁移调用方 |
| C-11 | 主题 JS 工具整段重复 | MEDIUM | `moment.js` ↔ `guestbook.js`（isDark/initEditor/ensureEditor/getContent/setStatus/submit） | 抽 `comment-form.js` |
| C-12 | 主题脚本功能双绑 | MEDIUM | `main.js` ↔ `moment-text.js` 折叠；`main.js` ↔ `theme-toggle.js` 打开搜索 | 只保留 `moment-text.js` + 一处搜索打开 |
| C-13 | 日期/datetime 本地重写 | MEDIUM | `PostEditPage` `toIso`/`toDatetimeLocal`/`pad`；`mediaUtils.padZero` + 本地 Y/m/d；`import-hugo` `toIso`/`excerptFrom` | `nowIso` + 共享 `lib/datetime.ts`；模板日期走 `shanghaiParts` |
| C-14 | GitHub 请求封装 3–4 份 | MEDIUM | `github-media.ts` 多处 fetch；`services/mirror.ts:148-163` `githubRequest` | 抽 `lib/github.ts` |
| C-15 | 口令最小长度策略不统一 | MEDIUM | login `min(4)` / new `min(8)` / reset `min(8)` / 文章加密 `min(4)` | 导出 `PASSWORD_MIN` 等常量 |
| C-16 | 启动/冒烟脚本重复 | MEDIUM | `run-edge*` / `start-edge-only` / `start-local`；`smoke.mjs` 与 `start-local.ps1` 自检 | 合并启动入口；共享检查清单与端口常量 |
| C-17 | 归档年分组时区夹角 | MEDIUM | `routes/public.ts:156` `publishedAt.slice(0,4)` vs 同文件 `monthOf` | 改用 `yearOf` |
| C-18 | `content-model` exports 缺 `./mirror` | MEDIUM | `index.ts` 导出，`package.json` 未声明 | 补 `"./mirror"` 导出 |

---

## 2. 逐文件结论

图例：**无** = 未发现值得记录的重复/未复用；**LOW / MEDIUM / HIGH** = 建议优先级（非绝对缺陷等级）。

### 2.1 `packages/shared-utils`

| 文件 | 职责 | 重复/未复用 | 最佳实践 | 结论 |
|------|------|-------------|----------|------|
| `src/index.ts` | barrel | — | — | **无** |
| `src/date.ts` | ISO/上海墙钟格式化 | 已是共享源；`formatDate` 已走 `shanghaiParts` | pattern 仅 token 首次替换（`string.ts` 风格）；有测试 | **LOW** |
| `src/slug.ts` | slug 生成/校验 | 截断 80 vs `isValidSlug` 放行 200；正则被 content-model 重写；`isValidSlug` 零调用 | 生成/校验契约不一致 | **HIGH** |
| `src/string.ts` | plainText/截断/ID | 清洗与 `reading-time` 分叉；`excerptOf` 未复用 `truncate`；`createId` 被下游内联重写 | `truncate` 无 `maxLength<=0` 防护 | **MEDIUM** |
| `src/reading-time.ts` | 字数/分级 | 自写清洗，未复用 `plainText` | `charsPerMinute` 被 `Math.max(60,…)` 静默抬高 | **MEDIUM** |
| `src/date.shanghai.test.ts` | 时区回归 | — | 覆盖质量较好 | **无** |
| `src/reading-time.test.ts` | 测试 | slug/string 用例错位；关键函数覆盖弱 | — | **MEDIUM** |
| `package.json` / `tsconfig.json` | 配置 | — | — | **无** |

### 2.2 `packages/content-model`

| 文件 | 职责 | 重复/未复用 | 最佳实践 | 结论 |
|------|------|-------------|----------|------|
| `src/index.ts` | barrel | 导出 `./mirror` 但 package exports 未声明 | 解析路径依赖 tsconfig paths | **MEDIUM** |
| `src/post.ts` | 文章契约 | slug 正则内联 + `max(200)`；加密口令 `min(4)` | datetime 默认要求 `Z` | **HIGH** |
| `src/post.test.ts` | 测试 | 无 slug 长度 80/200 边界 | — | **MEDIUM** |
| `src/term.ts` | 分类/标签 | slug `max(80)` + 第三份正则 | 与 post 上限冲突 | **HIGH** |
| `src/comment.ts` | 评论契约 | `isSafeExternalUrl` 放在 comment 域；website refine 两份 | 白名单设计正确、有测试 | **LOW** |
| `src/comment.test.ts` | 测试 | — | 可补空 host 边界 | **无** |
| `src/moment.ts` | 说说契约 | `linkUrl`/`videoUrl` 无协议校验 | 与 comment 策略不一致 | **HIGH** |
| `src/media.ts` | 媒体契约 | `url` 无协议校验 | — | **LOW** |
| `src/mirror.ts` | 镜像契约 | — | 干净 | **无** |
| `src/settings.ts` | 设置契约 | 自造 `mc_*` ID；`createMediaConfig` 展开顺序可吞默认值；social url 裸串 | 未复用 `createId`/`isSafeExternalUrl` | **MEDIUM** |
| `src/auth.ts` | 认证契约 | 口令下限 4/8 混用 | — | **MEDIUM** |
| `src/api.ts` | API 信封 | — | 干净 | **无** |

### 2.3 `packages/renderer`

| 文件 | 职责 | 重复/未复用 | 最佳实践 | 结论 |
|------|------|-------------|----------|------|
| `src/index.ts` | barrel | — | — | **无** |
| `src/markdown.ts` | MD→HTML/sanitize | 剥标签第 3 份；`deriveExcerpt`/`deriveReadingTime` 薄别名 | `extractHeadings` 依赖未挂载的 anchor | **HIGH** |
| `src/derive.ts` | 展示派生 | `renderPostBody` 纯别名；excerpt fallback 与 `posts.ts` 重复 | `paginate` 除零未防护 | **MEDIUM** |
| `src/search.ts` | 搜索索引 | 路由前缀硬编码 `/posts/` `/pages/` | 零测试 | **MEDIUM** |
| `src/markdown.test.ts` | 测试 | 未测 extractHeadings/search | XSS 用例较好 | **MEDIUM** |
| `package.json` | 配置 | `markdown-it-anchor` 死依赖 | — | **MEDIUM** |

### 2.4 `apps/edge`

#### 生产

| 文件 | 职责 | 重复/未复用（代表） | 最佳实践 | 结论 |
|------|------|---------------------|----------|------|
| `src/index.ts` | 入口/Cron | — | waitUntil/错误处理正确 | **无** |
| `src/env.ts` | Env 校验 | — | placeholder 黑名单、无硬编码密钥 | **无** |
| `src/lib/http.ts` | 响应封装 | — | 正确复用 content-model 错误码 | **无** |
| `src/lib/cache.ts` | 缓存版本 + `newId` | `newId` 薄包装，下游未统一走它 | 参数化 SQL | **LOW** |
| `src/lib/crypto.ts` | 口令/HMAC/hex | 原语未导出 → 下游重复实现 | 实现质量高 | **MEDIUM** |
| `src/lib/settings.ts` | 设置读写 | `export function now()` 为 `nowIso` 死包装 | — | **LOW** |
| `src/lib/mail.ts` | 发信/模板 | `truncate` 内联；`escapeHtml` 局部 | href 缺协议白名单；有 timeout | **MEDIUM** |
| `src/lib/mirror.ts` | 镜像入队 | `createId('mq')` 被内联；`new Date().toISOString()` | — | **MEDIUM** |
| `src/middleware/auth.ts` | 会话/CSRF | — | 弱 CSRF 可注释假设 | **无** |
| `src/middleware/error.ts` | 错误映射 | — | 防枚举文案 | **无** |
| `src/services/auth.ts` | 认证/会话/重置 | Cookie 解析；token/恒定时间比较/hex 重复 | 限流与失败拉平正确 | **MEDIUM** |
| `src/services/authAttempts.ts` | 登录限流 | 正确委托 `hashIp` | 好样板 | **无** |
| `src/services/comments.ts` | 评论 | 分页骨架；reply token 内联；prepareReply 两处 | 策略清晰；guestbook 镜像目标可疑 | **MEDIUM** |
| `src/services/posts.ts` | 文章 CRUD | slug 内联；derive 三连未走 `buildExcerptAndReading`；分页骨架 | 复用 renderer 主体正确 | **MEDIUM** |
| `src/services/terms.ts` | 分类标签 | slug 内联与 posts 几乎逐字相同 | rowToPost 已复用 | **MEDIUM** |
| `src/services/media.ts` | 媒体 | 分页骨架；`nowIso().slice(0,10)` 时区夹角 | URL 无协议校验 | **MEDIUM** |
| `src/services/moments.ts` | 说说 | 分页骨架；渲染两处 | linkUrl/videoUrl 落库无协议校验 | **MEDIUM** |
| `src/services/github-media.ts` | GitHub 图床 | 多份 fetch/headers/path 编码 | 缺 AbortSignal.timeout | **MEDIUM** |
| `src/services/mirror.ts` | 镜像消费 | 与 github-media 重复请求封装 | DELETE 缺 sha | **MEDIUM** |
| `src/services/inbound.ts` | Webhook 验签 | HMAC/恒定时间比较重复 | 安全路径质量高 | **MEDIUM** |
| `src/routes/api.ts` | 公开 API | targetType 手写数组 | unlock cookie Secure 写死 | **MEDIUM** |
| `src/routes/public.ts` | 前台 HTML | Cookie 解析；年分组 `slice(0,4)` | 复用 renderer/theme 良好 | **MEDIUM** |
| `src/routes/admin.ts` | 后台 REST | safeParse 样板；局部 zod 内联 | zod 大体走 content-model | **MEDIUM** |
| `src/routes/inbound.ts` | 回信入口 | — | 验签默认拒绝、幂等正确 | **无** |

#### 测试

| 文件 | 覆盖关注 | 结论 |
|------|----------|------|
| `src/env.test.ts` | 密钥校验主路径 | **无** |
| `src/lib/crypto.test.ts` | 仅 HMAC | **LOW**（覆盖薄） |
| `src/services/auth.test.ts` | 登录/会话较好；重置链路缺口 | **无** |
| `src/services/authAttempts.test.ts` | 限流主路径 | **无** |
| `src/services/inbound.test.ts` | 验签安全路径 | **无** |
| `src/services/posts.mapping.test.ts` | 映射契约 | **无** |

测试 mock/夹具不计生产债。缺口模块见 §3.4。

### 2.5 `apps/studio`

| 文件 | 职责 | 重复/未复用 | 最佳实践 | 结论 |
|------|------|-------------|----------|------|
| `src/main.tsx` / `App.tsx` | 入口/路由 | — | — | **无** |
| `src/api/client.ts` / `endpoints.ts` | HTTP/API | 类型已用 content-model | try/catch 覆盖 XHR | **无** |
| `src/components/ui/*`（Badge/Card/Button/Tabs/Input/Select/Pagination/Empty/Loading/Error/ErrorBoundary/Toast/PageHeader/RowMenu/TagSelector/Panel） | 基础 UI | 各页复用良好 | — | **无** |
| `src/components/ui/Drawer.tsx` | 抽屉 | 头部与 `Tabs` 内 `DrawerHeader` 同构 | focus trap 正确 | **LOW** |
| `src/components/ui/Tabs.tsx` | Tabs + DrawerHeader | `DrawerHeader` 全仓零引用（死代码） | 职责混放 | **LOW–MEDIUM** |
| `src/components/ui/ConfirmDialog.tsx` | 确认框 | Esc/body lock 与 Drawer 重复 | alertdialog 正确 | **LOW** |
| `src/components/media/MediaPicker.tsx` | 图床弹层 | 自造 Modal，未用 Drawer；clipboard 与 MediaPage 重复 | 有 try/catch | **MEDIUM** |
| `src/components/media/ImageGridEditor.tsx` | 宫格 | — | — | **无** |
| `src/components/media/MediaConfigManager.tsx` | 图床配置 | 与 SettingFields 轻度同构 | — | **无–LOW** |
| `src/components/form/SchemaForm.tsx` | schema 表单 | datetime 切片/toDatetimeLocal 与 PostEdit 重复 | — | **LOW** |
| `src/components/form/SettingFields.tsx` / `PasswordPanel.tsx` | 表单 | — | — | **无** |
| `src/components/editor/OverTypeEditor.tsx` | 编辑器封装 | — | 有 try/catch；与库内 draft 双策略需文档 | **无–LOW** |
| `src/components/layout/AppShell.tsx` / `PageSticky.tsx` | 布局 | — | — | **无** |
| `src/lib/toast.ts` / `useFocusTrap.ts` | 共享 hook | 被正确复用 | — | **无** |
| `src/lib/mediaUtils.ts` | 媒体工具 | `padZero`/`randomString`/本地日期模板 | 未用 `shanghaiParts`/`createId` | **MEDIUM** |
| `src/features/moment/composeState.ts` | 说说 reducer | — | — | **无** |
| `src/features/moment/draftPersistence.ts` | 草稿 | 单点实现，无重复 | try/catch 完整 | **无** |
| `src/features/moment/useMediaUpload.ts` | 上传 | — | try/catch 有 | **无** |
| `src/features/*/route.tsx`、`registry.ts`、`types.ts` | 路由注册 | — | — | **无** |
| `src/pages/MomentListPage.tsx` | 说说列表 | 自造双 sheet；`slice(0,40)` 未 `truncate`；`getDateKey` 别名 | 日期 API 使用正确 | **MEDIUM** |
| `src/pages/PostEditPage.tsx` | 文章编辑 | `toIso`/`toDatetimeLocal`/`pad`；`new Date().toISOString()` | 已用 `slugify`/`countWords` | **MEDIUM** |
| `src/pages/PostListPage.tsx` | 列表 | — | `formatDate` 正确 | **无** |
| `src/pages/TaxonomyPage.tsx` | 分类标签 | slug 正则第 4 份 | 唯一正确用 Drawer 的页面 | **无**（正则归 C-02） |
| `src/pages/MediaPage.tsx` | 媒体库 | 删除/clipboard 与 MediaPicker 重复 | — | **LOW** |
| `src/pages/CommentAuditPage.tsx` | 评论审核 | `id.slice(0,8)` 可考虑 `encodeId` 语义 | `formatDateTime` 正确 | **LOW** |
| `src/pages/DashboardPage.tsx` | 总览 | — | 一处静默 `.catch` | **无–LOW** |
| `src/pages/SettingsPage` / `ThemePage` / `LoginPage` / `ResetPasswordPage` | 页面 | — | — | **无** |
| `src/styles/index.css` / `tokens.css` | 样式 | truncate 类命名轻微不统一 | — | **无–LOW** |
| `public/theme/**` | 主题镜像 | 与 `themes/zhuosu` 大面积字节级重复；`guestbook.css` 已分叉；`scripts/zhuosu.css` 脏副本 | 无同步机制 | **HIGH** |

### 2.6 `themes/zhuosu`

| 文件 | 职责 | 重复/未复用 | 最佳实践 | 结论 |
|------|------|-------------|----------|------|
| `src/index.ts` / `types.ts` | 导出/类型 | — | types 已用 content-model | **无** |
| `src/components.ts` | HTML 片段 | — | `formatDate`/`isSafeExternalUrl` 正确 | **无–LOW** |
| `src/pages.ts` | 页面模板 | `formatDate(new Date().toISOString())` 可 `nowIso` | 日期复用正确 | **LOW** |
| `scripts/moment.js` / `guestbook.js` | 评论表单 | isDark/initEditor/ensureEditor/getContent/setStatus/submit 整段重复 | `.catch` 有 | **MEDIUM** |
| `scripts/main.js` / `moment-text.js` / `theme-toggle.js` | 交互 | 折叠双绑；搜索打开双处 | theme-toggle localStorage 无 try | **MEDIUM** |
| `scripts/search.js` | 搜索 | `escapeHtml` 局部可接受 | `item.url` 进 href 未 escape 属性 | **LOW–MEDIUM** |
| `scripts/code-toolbar.js` | 代码栏 | 与 OverType 内置复制双套风险 | — | **LOW** |
| `scripts/lightbox-core.js` / `lightbox-gallery.js` | 灯箱 | 拆分合理 | — | **无** |
| `scripts/spoiler.js` | 剧透 | — | — | **无** |
| `scripts/overtype/overtype.min.js` | 第三方 | 双份镜像归 C-01 | 库内部不评 | （镜像）**HIGH** |
| `styles/*` | 样式 | 与 public 镜像；`zhuosu.css` 与 `guestbook.css` 规则轻度重叠 | — | 镜像 **HIGH** |

### 2.7 `scripts/`

| 文件 | 职责 | 重复/未复用 | 最佳实践 | 结论 |
|------|------|-------------|----------|------|
| `run-edge.ps1` / `run-edge.bat` / `run-edge.cmd.txt` | 起 edge | 启动逻辑家族重复；ps1 硬编码绝对路径 | — | **MEDIUM** |
| `start-edge-only.ps1` | 独立起 edge | Start-Independent 与 start-local 重复 | — | **MEDIUM** |
| `start-local.ps1` | 起双端 + 自检 | 自检 ≡ smoke | `.dev.vars` 拷贝合理 | **MEDIUM** |
| `smoke.mjs` | 冒烟 | 与 start-local 检查重复；端口 8788 vs 8787 未共享常量 | waitForServer/finally kill 良好 | **MEDIUM** |
| `import-hugo.mjs` | Hugo 导入 | `toIso`/`excerptFrom` 未用 `nowIso`/`plainText`/`excerptOf` | main().catch 良好 | **MEDIUM** |

---

## 3. 构造性建议（如何复用）

### 3.1 主题镜像（C-01，优先）

> `apps/studio/public/theme/**` 与 `themes/zhuosu/src/**` 已确认大面积哈希一致，且 `styles/guestbook.css` 已出现内容分叉。倾向于把 `themes/zhuosu/src` 定为唯一真源。

建议步骤：

1. 先处理脏副本：倾向删除 `apps/studio/public/theme/scripts/zhuosu.css`（路径错放 + 内容陈旧 + 注释乱码）。
2. 将 `themes/zhuosu/src/styles/guestbook.css` 同步到 public（或去掉 public 副本，由构建产出）。
3. 增加 `scripts/sync-theme.mjs`（或 package script）：从 themes 拷贝到 public，并做哈希比对；CI 断言不一致则失败。
4. 若确认 public 只是构建产物，可考虑 `.gitignore`，避免手工双维护。

**取舍说明：** 方案 A「同步脚本 + 保留 public」改动面小，适合当前 Studio 预览链路；方案 B「去掉 public 副本、构建时注入」更干净，但需要动 Vite/打包配置。建议先 A 后视稳定度评估 B。

### 3.2 slug 策略单源（C-02）

当前同一「slug」概念存在：生成截断 80、`isValidSlug` 放行 200、`postSchema` 200、`termSchema` 80、Taxonomy 页正则再抄一份。

示例（倾向统一为单一常量，长度取 80 与 `slugify` 一致，或全体改 200——需产品拍板）：

```ts
// packages/shared-utils/src/slug.ts
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const SLUG_MAX_LEN = 80

export function slugify(input: string): string {
  const base = input
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LEN)
  return base || `post-${Date.now().toString(36)}`
}

export function isValidSlug(slug: string, maxLen = SLUG_MAX_LEN): boolean {
  return SLUG_RE.test(slug) && slug.length <= maxLen
}
```

content-model 侧改为引用 `SLUG_RE` / `SLUG_MAX_LEN`，避免第三、四份拷贝。`posts.ts` / `terms.ts` 的内联 slug 生成建议改为 `slugify(...)`（可给 fallback 前缀参数）。

### 3.3 外链协议统一（C-03）

已有正确实现可复用：

```ts
// packages/content-model/src/comment.ts:7-11
export function isSafeExternalUrl(value: string): boolean
```

建议：

1. 将其上移到 `content-model/src/url.ts`（或 shared-utils），comment/moment/media/settings 共用；
2. `moment.ts` 的 `linkUrl`/`videoUrl`、`media.ts` 的 `url`、settings 的 social/nav url 补 refine；
3. `lib/mail.ts:178` 的 href 在 `escapeHtml` 之外增加协议检查（渲染侧纵深防御）；
4. 主题 `components.ts` 对 moment `linkUrl` 同样走 `safeExternalHref`。

### 3.4 edge 内部去重（C-05/C-06/C-08）

| 现状 | 建议 |
|------|------|
| `auth.parseSessionCookie` + `public.parseCookie` | `lib/cookie.ts` → `readCookie(header, name)`；三段会话结构留在 auth 上层 |
| `lib/mirror.ts:10` 等价 `createId('mq')` | 直接 `newId('mq')` / `createId('mq')` |
| `auth.ts` session/reset token 截断语义不同 | 增加 `randomToken()`（全熵、不截断），勿强行并入 `createId` |
| `constantTimeEquals` / inbound 比较 / crypto 私有 | 从 `lib/crypto.ts` 导出 `timingSafeEqual`、`bytesToHex`、可选 `sha256Hex` |
| `mail.ts` 内联 truncate | `@taiping/shared-utils` 的 `truncate`（先统一省略号是否占位） |
| `settings.ts` 的 `now()` | 建议删除死包装，统一 `nowIso` |

### 3.5 分页骨架（C-09）——建议暂缓大抽取

posts/comments/moments/media 的 WHERE+COUNT+LIMIT 同构明显，但 posts 有逐行 term 补充、comments 有 featured 条件、media 有 LIKE。抽 `paginateQuery` 参数面会变复杂，并可能遮蔽索引相关 SQL。

更稳妥的倾向：

1. 先为四处补分页边界测试（空页、末页、pageSize 上限）；
2. 待出现游标分页等第二次差异化需求时再抽象。

### 3.6 Studio 弹层与 datetime（C-10/C-13）

- 扩展 `Drawer` 支持 bottom-sheet / 居中 Modal，或新增 `Modal` 共享 `useFocusTrap` + Esc + body lock + `DrawerHeader`；
- `MediaPicker`、`MomentListPage` 两处 sheet 迁移过去；
- 新建 `apps/studio/src/lib/datetime.ts`：`toIso` / `toDatetimeLocal` / `pad2`，PostEdit 与 SchemaForm 共用；产品若要求上海语义，模板占位走 `shanghaiParts` 而非浏览器本地时区。

### 3.7 主题 JS（C-11/C-12）

- 抽 `themes/zhuosu/src/scripts/comment-form.js`（`isDark` / `initEditor` / `ensureEditor` / `getContent` / `setStatus` / submit），`moment.js` 与 `guestbook.js` 只留绑定差异；
- 说说折叠只保留 `moment-text.js`；搜索 modal 打开只保留一处（倾向留在 `theme-toggle.js`）；
- `search.js` 对 `item.url` 做属性值转义。

### 3.8 测试缺口（复用改造的安全网）

建议优先补齐：

| 目标 | 为什么 |
|------|--------|
| `slugify` / `isValidSlug` / slug 长度 80 vs 200 | 支撑 C-02 契约统一 |
| `plainText` / `truncate` / `excerptOf` | 支撑 C-07 合并 |
| `countWords` 代码块/URL/行内代码 | 验证与 plainText 合并后语义 |
| `extractHeadings` | 当前可能恒返回空，测试会立刻暴露 C-04 |
| `isSafeExternalUrl` 边界（空 host） | 支撑 C-03 |
| `public.parseCookie` | Cookie 合并时的回归锚点 |

---

## 4. 最佳实践对齐摘要

| 维度 | 观察 |
|------|------|
| 错误处理 | edge 服务层与 Studio API client / theme 提交流大体有 try/catch 或 `.catch`；`theme-toggle` localStorage、`DashboardPage` 一处静默吞错偏弱 |
| 共享层使用 | `nowIso`/`formatDate`/`renderMarkdownSafe`/`slugify`（Studio）/`isSafeExternalUrl`（评论）已建立正确复用习惯；缺口集中在 edge 服务短工具与主题 JS |
| 类型 | 未见生产 `any`；content-model `z.infer` 与实现同源较好 |
| 安全配置 | 评论 website 协议白名单正确；moment/media/mail/settings 尚未统一同一策略；密钥走 env，未见生产硬编码密钥 |
| 样式 | Studio 有 tokens + tailwind 基元，复用良好；主题侧 CSS 双份是结构问题 |
| 依赖 | markdown 解析/净化复用第三方正确；`markdown-it-anchor` 声明未用 |

---

## 5. 与 `reviews/02` 的增量

| 02 结论 | 本次状态 |
|---------|----------|
| `formatDate` 时区缺陷 | **已修复**：现基于 `shanghaiParts`，并有 `date.shanghai.test.ts` |
| `slugify` 被架空 | **部分修复**：Studio `PostEditPage` 已用；edge `posts.ts`/`terms.ts` 仍有内联 |
| 评论 website 校验 | **已修复**：`isSafeExternalUrl` + 测试；但未推广到 moment/media |
| Cookie 双实现 | **仍在** |
| 主题双副本 | **仍在**，且 `guestbook.css` 已漂移、出现第三份脏 `scripts/zhuosu.css` |
| ID 生成不统一 | **仍在** |
| 分页骨架 | **仍在**（本次维持「暂缓抽取」建议） |

---

## 6. 建议落地顺序

1. **HIGH**：主题镜像治理（删脏副本 → 同步 guestbook.css → sync + CI）  
2. **HIGH**：slug 策略单源（80/200 拍板 → 常量/正则同源 → edge 改 `slugify`）  
3. **HIGH**：外链 `isSafeExternalUrl` 推广（moment / media / mail / settings）  
4. **HIGH**：`extractHeadings` 接线或删除 + 移除死依赖  
5. **MEDIUM**：Cookie / truncate / createId / nowIso / crypto 导出面整理  
6. **MEDIUM**：Studio Modal 统一 + datetime 工具；主题 `comment-form.js`  
7. **MEDIUM**：GitHub 请求封装、归档 `yearOf`、口令常量、content-model `./mirror` exports  
8. **MEDIUM**：脚本启动/冒烟合并；`import-hugo` 接 shared-utils  
9. **LOW**：其余薄重复与测试矩阵补齐  

---

## 7. 未评估项

| 范围 | 说明 |
|------|------|
| `vendor/overtypeplus` | 第三方 vendored，按约定跳过；仅记录与主题的双份镜像问题 |
| `docs/` / `reviews/` / `taiping-admin-design/` | 文档与设计稿，非运行时业务源码 |
| 第三方许可证合规 | 需专门扫描，超出本次技能范围 |
| 运行时性能剖析 | 本次为静态复用/最佳实践审查 |

---

## 8. 执行记录

本次为只读审查。若进入修复迭代，建议按「一次只做一件事」拆分提交，并为每项匹配 §3.8 测试缺口中的对应用例。
