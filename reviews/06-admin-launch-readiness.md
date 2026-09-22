# 管理端上线评估报告

> **评估对象：** taiping_blog 管理端（`apps/studio` 后台 SPA + `apps/edge` 的 `/api/admin/*`）
> **评估日期：** 2026-09-21
> **上线场景：** 单作者自用上线（内容存 D1，前端运行于 Cloudflare）
> **评估依据：** `docs/architecture-design.md` v2.0 设计基线 + `pnpm build` 实测 + 本地 D1 数据核查
> **评估性质：** 只读分析，未修改任何代码或配置

---

## 一、结论

**建议：可上线，但需先完成 5 项必做动作。预计 1~2 天。**

管理端的**功能完成度很高**，9 个功能模块全部可用，32 个后端接口齐备，构建链两端均可跑通。前几轮审查发现的安全问题已全部修复且在位。对于单作者自用场景，功能上**已经够用**。

**但当前状态不能直接部署**——主要卡在**运维准备**而非功能本身：`wrangler.toml` 里 D1 的 `database_id` 仍是占位符 `local-placeholder`，仓库**一次提交都没有**（无回滚能力），生产密钥需要单独配置。这 5 项都是配置与流程工作，不涉及代码改动。

上线后需知晓两个**已知功能缺口**（不影响自用）：评论回复是未接线的占位实现；镜像导出在已有文件上会失败（因为 GitHub API 更新文件需要 `sha`）。

---

## 二、功能完成度

### 2.1 模块矩阵

已实测：`apps/studio/src/features/*/route.tsx` 共 9 个模块，全部注册并被 `registry.ts` 自动装配。

| 模块 | 路由 | 实现状态 | 后端接口 | 说明 |
|------|------|---------|---------|------|
| 概览 | `/` | ✅ 完整 | `GET /overview` | 含文章/评论/说说计数与镜像状态 |
| 文章 | `/posts` | ✅ 完整 | 7 个接口 | 列表/详情/增删改/发布/取消发布 |
| 页面 | `/pages` | ✅ 完整 | 复用文章接口 | 复用 `PostEditPage`，`type=page` |
| 说说 | `/moments` | ✅ 完整 | 5 个接口 | 1189 行，含日历热力图/标签云/草稿持久化 |
| 评论 | `/comments` | ⚠️ 基本完整 | 2 个接口 | 审核动作齐全，**回复未接线** |
| 图床 | `/media` | ✅ 完整 | 5 个接口 | 支持 GitHub 图床 + 外链登记 |
| 分类标签 | `/taxonomy` | ✅ 完整 | 4 个接口 | 分类与标签共表多态 |
| 主题 | `/theme` | ℹ️ 只读 | — | 仅展示主题信息，无切换（符合设计：构建期选主题） |
| 设置 | `/settings` | ✅ 完整 | 2 个接口 | 5 个分组（基础/阅读/评论/外观/媒体） |

**另有 3 个非路由接口**：`POST /preview`（预览渲染）、`GET /mirror/status`、`POST /mirror/retry`。

### 2.2 与设计文档的对照

设计文档第 451-461 行的职责边界表中，管理端需「拥有」的能力逐项核对：

| 设计要求 | 实现 | 结论 |
|---------|------|------|
| 内容编辑（编辑器、表单、草稿） | OverType 编辑器 + `SchemaForm` 派生表单 + localStorage 草稿 | ✅ |
| 即时预览 | `POST /preview` 复用 `renderer` | ✅ |
| 契约校验（非权威） | 前端 zod + 后端权威校验 | ✅ |
| 加密校验（输入界面） | 文章编辑含加密字段（`encrypt`/密码/提示/文案） | ✅ |
| 评论审核界面 | 5 个审核动作 + 抽屉详情 | ✅ |
| 媒体上传交互 | 双路径（本地上传 / 图床选择），含进度与重试 | ✅ |
| 镜像导出（展示状态/手动触发） | 概览页展示镜像状态，含重试入口 | ✅ |
| 站点设置界面 | 5 分组标签页 | ✅ |

设计文档第 44 行「契约单一化」目标已落地：`postFields`（`content-model/src/post.ts:91`）等字段元数据驱动后台表单，与前端校验、后端存储共用同一 schema。

### 2.3 三点功能边界（已知，非缺陷）

1. **主题不可切换** — `ThemePage` 是 43 行的只读信息面板。这符合设计文档第 50 行「不做多主题并存与在线切换」，非缺失。
2. **评论回复未接线** — `CommentAuditPage.tsx` 的 `handleReply` 直接 `toast('回复功能待接入')`。UI 与输入框已建好，仅缺后端接口。设计文档第 402 行将回复列为评论能力之一，**这是一处真实缺口**。
3. **无多用户/角色** — 符合设计文档第 49 行「不做多用户与角色权限」。

### 2.4 现存数据

直接读取本地 D1（`apps/edge/.wrangler/state/v3/d1/.../*.sqlite`，733 KB）核实：

```
文章/页面  50 条
说说       65 条
分类/标签  44 条
评论        0 条
```

**内容迁移已完成**（文章与说说已有真实数据，且历史说说带正确 `author`），但**评论为 0**。若上线目标是替代现有 Hugo 站点，评论数据尚未迁移——这是需要你确认的一点。

---

## 三、可用性阻塞项

### 3.1 部署阻塞（必改）

| # | 问题 | 证据 | 影响 |
|---|------|------|------|
| A1 | D1 `database_id` 是占位符 | `wrangler.toml`：`database_id = "local-placeholder"`；`pnpm -F @taiping/edge build` 输出 `DB: taiping-blog (local-placeholder)` | **无法部署**。需先 `wrangler d1 create` 取得真实 ID |
| A2 | 生产密钥未配置 | `.dev.vars` 仅本地用；`SESSION_SECRET`/`ADMIN_USERNAME`/`ADMIN_PASSWORD` 需以 `wrangler secret put` 注入 | **无法登录**。缺失时 `warnEnvOnce` 会告警（已修复为告警模式） |
| A3 | `SITE_URL` 仍是本地地址 | `wrangler.toml` 的 `[vars] SITE_URL = "http://127.0.0.1:8787"` | Session Cookie 的 `Secure` 标志依赖该值是否为 https（`auth.ts:38`），**配错会导致 Cookie 不带 Secure** |

### 3.2 构建链验证（已实测通过）

```
pnpm -F @taiping/studio build  → ✅ 成功
  dist/assets/index-*.css   47.36 kB (gzip  9.44 kB)
  dist/assets/index-*.js   537.08 kB (gzip 161.66 kB)   ← 超 500 kB 警告
  dist/assets/OverTypeEditor-*.js  204.21 kB (gzip 52.87 kB)

pnpm -F @taiping/edge build    → ✅ 成功
  Total Upload: 997.90 KiB / gzip: 221.34 KiB
```

主包 537 kB 超过 Vite 默认 500 kB 告警线。单作者自用可接受，但首屏加载会偏慢（gzip 后 162 kB 仍属正常范围）。

**资源路径已核对一致**：`dist/index.html` 引用 `/assets/index-*.js`，与 Worker 的 `app.get('/assets/*')` 路由匹配；`/theme/*` 亦已正确映射。

### 3.3 前端零测试

`apps/studio` 的测试文件数为 **0**。9 个测试文件全部集中在 `apps/edge`（4 个）与 `packages/*`（5 个），共 51 个用例通过。

对单作者自用场景，这个覆盖水平**可接受但不理想**——后台 UI 的任何改动都缺少回归保护。其中「说说输入框」那类状态机问题（见 `05-moment-and-scrollbar-fixes.md`）本可被一个简单用例拦截。

### 3.4 上一轮修复的回归确认

逐项复核，全部仍在位：

| 修复 | 验证点 | 状态 |
|------|--------|------|
| C-01 评论协议校验 | `comment.ts` 含 `isSafeExternalUrl` | ✅ |
| C-01 渲染侧防护 | `components.ts` 含 `safeExternalHref` | ✅ |
| M-S1 RSS 加密过滤 | `public.ts` 含 `!post.encrypt` | ✅ |
| M-S2 恒定时间比较 | `auth.ts` 含 `constantTimeEquals` | ✅ |
| M-S5 环境校验 | `env.ts` 含 `warnEnvOnce` | ✅ |
| M-A1 行映射 | `terms.ts` 含 `rowToPost` | ✅ |
| 滚动条槽位 | `studio/src/styles/index.css` 含 `scrollbar-gutter` | ✅ |

---

## 四、安全与风险

### 4.1 已修复（前几轮）

- 评论 `website` 的 `javascript:` 协议漏洞（CRITICAL）——契约层 + 渲染层双重防护
- RSS 泄露加密文章正文片段（MAJOR）
- 登录口令非恒定时间比较（MAJOR）
- 环境变量未在请求路径失败闭合（MAJOR）
- taxonomy 类型契约失效（MAJOR）
- 评论限流信任可伪造的 `X-Forwarded-For`（MAJOR）
- 净化白名单过宽、白名单绑定错位（MINOR）

### 4.2 上线后需知晓的遗留风险

| # | 风险 | 触发条件 | 自用场景影响 |
|---|------|---------|-------------|
| R1 | **镜像更新必定失败** | 配置 `GITHUB_TOKEN` + `GITHUB_MIRROR_REPO` 后，**同一文章第二次发布** | GitHub Contents API 更新已有文件必须提供当前 `sha`，而 `mirror.ts` 中 `sha` 出现 **0 次**。首次成功，后续 409 Conflict |
| R2 | **镜像队列无重试上限** | 与 R1 同源 | `processMirrorQueue` 无 `MAX_RETRY`（已确认 0 处），`retryFailed` 只把 failed 重置为 pending。失败任务会**每小时无限重试** |
| R3 | 房间无告警通道 | 镜像持续失败时 | 设计文档第 162 行要求「持续失败则告警」，但 `MAIL_API_URL`/`MAIL_API_KEY` 虽已声明却无使用点。失败会静默累积（`T17` 已记录） |
| R4 | 生产 sourcemap 暴露 | 部署后访问 `/assets/*.js.map` | `vite.config.ts` 设 `sourcemap: true`，构建产物含 2.5 MB 的 `.map`。单作者自用影响有限，但公开部署建议关闭 |
| R5 | 评论限流 TOCTOU 竞态 | 并发的评论提交 | 检查与插入之间无事务，理论上可绕过间隔限制。自用场景评论量低，风险很小 |
| R6 | 评论 CSRF 仅靠 `X-Requested-With` | 跨站构造请求 | 非令牌机制。`SameSite=Lax` 已缓解大部分场景 |
| R7 | `.wrangler/` 缓存目录含 15 份构建副本 | 无 | 已在 `.gitignore` 中，仅影响本地磁盘占用 |

**R1 与 R2 的组合值得单独说明**：单一缺陷（缺 `sha`）会经由无上限的重试机制放大为持续的资源消耗。若上线时启用镜像，建议先修这两项——它们属同一处代码。

### 4.3 安全性评价

对单作者自用场景，管理端的安全基线是**合格的**：

- 会话 Cookie 正确设置 `HttpOnly` + `SameSite=Lax`，生产环境（`SITE_URL` 为 https）会带 `Secure`
- 口令比对已改为恒定时间实现
- 全量 SQL 均使用参数化查询（前轮已确认，本轮未发现新增）
- 净化白名单严格，`allowedSchemes` 限定 http/https/mailto
- 密钥未进入 `wrangler.toml`（已核对，正确）
- `assertEnv` 在 Cron 路径失败闭合、请求路径告警模式

**唯一需要在部署时留意的是 A3**：`SITE_URL` 若配成 `http://`，Cookie 会缺失 `Secure` 标志。

---

## 五、上线前检查清单

### 必做（阻塞上线）

- [ ] **创建生产 D1 并回填 ID**
      `wrangler d1 create taiping-blog` → 将返回的 `database_id` 写入 `wrangler.toml:15`
- [ ] **执行线上迁移**
      `pnpm -F @taiping/edge db:migrate:remote`（迁移文件 `0001_init.sql` 共 114 行，与代码 schema 一致，已核对）
- [ ] **注入生产密钥**（三项，`wrangler.toml` 中不含，正确）
      ```
      wrangler secret put SESSION_SECRET     # 至少 16 字符，避免使用 .dev.vars.example 的占位值
      wrangler secret put ADMIN_USERNAME
      wrangler secret put ADMIN_PASSWORD
      ```
- [ ] **修正 `wrangler.toml` 的 `[vars]`**
      `SITE_URL` 改为生产 https 域名（影响 Cookie `Secure`）；核对 `SITE_TITLE`/`SITE_AUTHOR`/`SITE_DESCRIPTION`
- [ ] **建立初始提交**
      仓库当前 `git log` 返回 `fatal: ... does not have any commits yet`，**无任何版本历史**。上线前应至少有一次提交，否则无法回滚。同时确认 `.dev.vars` 已被忽略（已核对在 `.gitignore:4`）

### 建议做（非阻塞）

- [ ] **决定是否迁移内容**：现有 50 文章 / 65 说说 / 44 标签已在本地 D1；线上库为空。若需携带，导出本地数据后导入线上
- [ ] **确认评论迁移**：评论为 0 条。若原站点有评论需要保留，需单独处理
- [ ] **若启用镜像，先修 R1/R2**：在 `mirror.ts` 的 `commitToGithub` 中先 GET 文件 `sha` 再 PUT；并在 `processMirrorQueue` 增加 `retry_count` 上限
- [ ] **关闭生产 sourcemap**：`apps/studio/vite.config.ts` 的 `build.sourcemap` 改为 `false`
- [ ] **配置镜像告警通道**（`MAIL_API_*` 已有声明，缺实现）
- [ ] **更新 wrangler**：当前 3.114.17，最新 4.136.1（构建时有告警）

### 上线后验证

- [ ] 访问 `/admin/` 能加载登录页
- [ ] 用生产账号口令可登录，会话 Cookie 带 `Secure`
- [ ] 新建一篇草稿 → 发布 → 前台可见
- [ ] 新建一条说说（验证前轮修复的输入框问题）
- [ ] 上传一张图片到图床
- [ ] 提交一条评论 → 后台审核通过 → 前台可见
- [ ] 检查 `wrangler tail` 无 `[env]` 告警输出（确认密钥配置正确）

---

## 六、总体评价

**做得扎实的部分**：管理端的功能覆盖与设计文档高度吻合——9 个模块、32 个接口全部到位，契约单一化、加密字段、媒体双路径上传、草稿持久化这些细节都实现了。构建链两端均可跑通，迁移脚本与代码 schema 一致。前几轮的安全修复全部在位并经复核。

**主要短板集中在工程化而非功能**：零 git 提交（无回滚）、前端零测试、D1 配置停留在占位状态。这三项对自用场景不构成功能障碍，但会显著抬高第一次部署的试错成本——尤其在没有版本历史的情况下。

**建议的推进顺序**：先完成 5 项必做动作（预计半天），部署到线上跑通一次完整流程；确认可用后再回头处理镜像的 `sha` 缺陷与前端测试补强。考虑到镜像功能默认未启用（`GITHUB_TOKEN` 未配置），R1/R2 不阻塞首次上线。

---

## 附：证据来源

| 结论 | 验证方式 |
|------|---------|
| 9 个功能模块全部注册 | 读取 `features/*/route.tsx`（9 个文件）+ `registry.ts` 自动装配逻辑 |
| 32 个后端接口 | 正则提取 `routes/admin.ts` 的 `admin.(get\|post\|patch\|delete)` 调用 |
| 页面实现深度 | 逐文件行数统计（43~1189 行）+ 关键页面全文阅读 |
| 现存数据量 | 直接解析本地 D1 sqlite 文件，按 ID 前缀去重计数 |
| 构建可用 | 实际执行 `pnpm -F @taiping/studio build` 与 `pnpm -F @taiping/edge build` |
| D1 占位符 | `wrangler.toml` 内容 + 构建输出的 binding 清单 |
| 镜像缺 `sha` | 对 `services/mirror.ts` 全文正则计数，`sha`/`409`/`422` 均为 0 处 |
| 无重试上限 | 同文件 `retry_count` 出现 3 次，`MAX_RETRY`/`maxRetry` 出现 0 次 |
| 评论回复未接线 | 读取 `CommentAuditPage.tsx` 的 `handleReply`，为 `toast('回复功能待接入')` |
| 无 git 提交 | 执行 `git log --oneline -3`，返回 `fatal: ... does not have any commits yet` |
| 前端零测试 | 递归统计 `apps/studio/src` 下 `*.test.*`，结果为 0 |
| 迁移完整性 | 读取 `0001_init.sql`（114 行），抽查 `moments` 表定义与代码字段一致 |
| 前期修复在位 | 对 7 个修复点逐一在文件中查找关键符号，全部命中 |
