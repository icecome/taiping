# taiping_blog 架构设计

> 版本：v2.0（2026-09-18）
> 定位：部署在边缘运行时内、以数据库为内容主存储的轻量博客管理系统，复刻拙素（zhuosu）主题的渲染样式与功能
> 状态：设计基线，待评审后进入实施

---

## 版本说明

**v2.0 相对 v1.0 的方向修正**

v1.0 建立在「Git 为主存储 + 混合渲染」之上，为伺候这个选择设计了读路径内容副本、Webhook 同步路径、落账重试队列与最终一致性处理。

需求收敛到「更接近 Typecho / Halo 的轻量博客管理系统」之后，这些设计被判定为过度设计：

| 项 | v1.0 | v2.0 | 原因 |
|---|---|---|---|
| 内容主存储 | Git 为主，D1 做索引 | **D1 为主，自动镜像到 Git** | 若 Git 为主，后台管理会退化为 Git 客户端，与 Typecho 心智不符 |
| 读路径 | 走 R2 内容副本，不访问 Git | 直接查 D1 | 主存储即数据库，无需副本机制 |
| 同步路径 | Git Webhook 触发索引重建 | 仅保留单向镜像导出 | 不再需要双向同步 |
| 一致性 | 最终一致，需对账 | 强一致（单库） | 数据库为唯一写入点 |
| 缓存失效 | 版本号入键 | 保留（简化版） | 仍然需要，但无需跨源协调 |

保留下来的 v1 结论：契约层单一 schema、请求期渲染、TSX 主题模型、缓存版本号入键策略。

---

## 1. 定位与目标

### 1.1 一句话定位

一个跑在边缘运行时里的轻量博客管理系统——具备完整的后台管理能力，内容存于数据库，页面在请求期渲染，通过异步镜像保持数据主权，整体复刻拙素主题的视觉与功能。

### 1.2 设计目标

| 编号 | 目标 | 判据 |
|------|------|------|
| G1 | 免服务器部署 | 仅凭 `wrangler deploy` 即可上线，无运行时安装、无常驻进程、无服务器运维 |
| G2 | 具备完整博客管理 | 文章、说说、评论、媒体、分类标签、站点设置均可在后台完成增删改查 |
| G3 | 复刻拙素主题 | 现有站点的全部页面与功能在新系统中可用，渲染结果与视觉呈现保持一致 |
| G4 | 数据主权可保障 | 全部内容可导出为人类可读的 markdown 与 JSON，离开本系统仍可被其他工具消费 |
| G5 | 契约单一化 | 后台表单、存储校验、渲染上下文由同一份 schema 派生 |
| G6 | 轻量 | 单个部署单元承担全部职责，不引入额外常驻服务 |

### 1.3 非目标（Non-goals）

- **不做插件机制**：Typecho 与 Halo 的插件系统是其主要重量来源之一。本设计以内置能力 + 主题插槽替代，不开放第三方插件接口
- **不做多用户与角色权限**：单一作者场景，仅需一个管理员身份
- **不做多主题并存与在线切换**：主题以代码包形式参与构建，不提供运行时切换
- **不做可视化建站与页面搭建器**：主题以类型化代码表达
- **不做离线编辑与实时协同**：编辑器为在线应用
- **不做通用 CMS**：仅覆盖博客语义（文章、页面、说说、评论），不做任意内容类型建模

---

## 2. 现状盘点

### 2.1 拙素主题能力清单（复刻范围）

以下清单来自对 `themes/zhuosu` 与站点 `hugo.toml` 的实际读取，而非推断。

**内容类型**

| 类型 | 现有能力 |
|------|---------|
| 文章 | 标题、日期、封面图（可选）、分类、标签、加密、阅读时长分级、前后篇导航、文章内嵌留言开关 |
| 独立页面 | 底片（关于）、友链 |
| 说说 | 正文、作者、精确到分的时间、单图与 2–3 列自适应图片网格、B站 iframe 内嵌（自动解析 BV/av 号）、普通 video 标签、外链卡片（按域名匹配微信/B站/GitHub/知乎 logo）、标签、长文折叠、行内留言 |
| 归档 | 按时间归档 |

**站点结构**：首页（文章列表 + 分页）、归档、说说、留言、底片、分类、标签、404

**交互能力（13 项）**

| 能力 | 现有实现 |
|------|---------|
| 搜索 | 构建期生成 JSON Feed 索引（仅标题 + 摘要，排除加密文章），前端过滤 |
| 留言板 | 精选留言列表 + 分页 + 表单（昵称/邮箱/站点地址/内容），OverType 编辑器 |
| 文章内嵌留言 | 由 `params.guestbook` 开关控制，复用留言板逻辑 |
| 说说行内留言 | 按钮展开，复用留言板接口 |
| 文章加密 | 构建期预加密（PBKDF2 600000 次 + AES-GCM），密文随 HTML 下发，前端解密 |
| 图片灯箱 | lightbox-core + lightbox-gallery |
| 代码工具栏 | 交通灯终端风格 |
| 剧透 | spoiler |
| 农历日期 | lunar + lunar-date |
| 长说说折叠 | moment-text |
| 暗色模式 | 主题 CSS |
| 纸纹理与衬线排版 | paper-texture + 全站衬线字体 |
| 阅读时长中式分级 | 弹指可览 / 片刻即毕 / 阅需一刻 / 半炷香时 / 一炷香时 / 细品慢读 |

**基础设施**：RSS（按 section 输出）、SEO、CSP（meta 方式）、分析（Umami + Tally）、社交链接

### 2.2 两个关键发现

**发现一：留言功能已经运行在独立 Worker 上**

站点配置中 `params.guestbook.worker_api` 指向 `https://blog-comment-worker.api.icecome.com`。这意味着现状并非纯静态站，而是「静态页面 + 独立评论服务」的混合体。新架构的价值之一是把这两部分收拢为单一部署单元，同时消除跨域配置与双份鉴权。

**发现二：加密存在一条明文降级路径**

`layouts/partials/post-encrypt.html` 第 105–107 行，当找不到预加密数据（`$hasEncrypted` 为假）时，直接输出明文正文：

```
{{- else -}}
<div class="post-content post-content-encrypted">{{ $content }}</div>
{{- end -}}
```

此分支下 CSS 遮罩仅构成视觉遮挡，查看页面源码即可读到全文。这是加密脚本未成功执行时的静默降级，构成实际暴露面。

v2.0 采用服务端校验后渲染，此缺口自然消除——未通过校验的请求既不下发密文也不下发明文。

---

## 3. 与 Typecho / Halo 的取舍

### 3.1 保留的核心模型

- **后台管理**：内容在后台完成全部增删改查，无需接触命令行或仓库
- **动态渲染**：页面在请求期由服务端渲染，不是构建期产物
- **主题系统**：主题决定全部页面的产出结构，与内容解耦
- **数据在库**：内容以结构化形式存储，查询与聚合由数据库承担

### 3.2 主动砍掉的部分

| 砍掉项 | 理由 |
|--------|------|
| 插件机制与插件市场 | 重量主要来源；改以内置能力 + 主题插槽覆盖 |
| 多用户与角色权限 | 单作者场景 |
| 多主题并存与在线切换 | 目标为复刻拙素，不承担通用主题生态 |
| 服务器运维面板 | 无服务器可运维 |
| 数据库备份面板 | 由镜像导出与 D1 自身机制承担 |

### 3.3 轻量化对比

| 系统 | 运行时 | 数据库 | 部署方式 | 运维负担 |
|------|--------|--------|---------|---------|
| Typecho | PHP-FPM | MySQL / SQLite | VPS 或虚拟主机 | 需维护运行环境与数据库 |
| Halo | JVM | MySQL / H2 / PostgreSQL | 服务器 | 需维护 JVM 与数据库 |
| **taiping_blog** | Workers（无需安装运行时） | D1 | `wrangler deploy` | 无服务器运维 |

---

## 4. 架构决策

| 决策项 | 选择 | 含义 |
|--------|------|------|
| 内容主存储 | **D1 为主，自动镜像到 Git** | 后台直接操作数据库，变更后异步导出 markdown 到 Git，保障数据主权 |
| 渲染方式 | **请求期服务端渲染** | 页面在边缘实时渲染，无构建期 |
| 主题表达 | **TSX 组件** | 类型安全，与后台 SPA 共享内容类型 |
| 后台形态 | **同一 Worker 托管 SPA** | 单部署单元，复用 Bloath 编辑器经验 |
| 加密文章 | **服务端校验后渲染** | 未解锁的请求不接触正文，密文与明文均不下发 |

### 4.1 「D1 为主 + 镜像到 Git」的关键约定

镜像产物必须是**人类可读且可迁移**的格式，否则数据主权只是形式上的。因此约定：

- 镜像的是**内容快照**（markdown + frontmatter），不是数据库导出（SQL dump）
- 目录结构对齐现有 Hugo 站点的组织方式，便于既有工具与习惯继续工作
- 镜像为**单向**：数据库 → Git。不做 Git → 数据库的回流，避免双向同步的一致性负担
- 镜像失败不阻塞发布：进入重试队列，持续失败则告警，并提供手动对账入口

---

## 5. 总体架构

### 5.1 部署单元

```
┌──────────────────────────────────────────────────────┐
│  单个 Worker 部署单元                                  │
│                                                       │
│   前台路由  /            →  请求期渲染（拙素复刻）      │
│            /posts/:slug                                │
│            /moments  /archives  /categories  /tags     │
│            /pages/:slug   /rss.xml   /sitemap.xml      │
│                                                       │
│   后台路由  /admin/*     →  管理 SPA（静态资源）        │
│   管理 API  /api/admin/*  →  文章 / 说说 / 评论 /        │
│                              媒体 / 设置 / 镜像状态     │
│   公开 API  /api/*       →  评论提交 / 解锁 / 搜索      │
│                                                       │
│   定时任务  Cron          →  镜像导出 / 缓存预热        │
└──────────────────────────────────────────────────────┘
              │                    │              │
              ▼                    ▼              ▼
        ┌─────────┐          ┌─────────┐    ┌─────────┐
        │   D1    │          │   KV    │    │   R2    │
        │ 主存储  │          │ 渲染缓存 │    │  媒体   │
        └─────────┘          └─────────┘    └─────────┘
```

KV 与 R2 为可选组件。建议先只上 D1，在实际观察到渲染延迟压力后再引入 KV；媒体若已有外部图床或对象存储，R2 也可省去。

### 5.2 分层

```
┌─────────────────────────────────────────────────────┐
│  L4 客户端层   读者端浏览器脚本 · 后台管理 SPA        │
├─────────────────────────────────────────────────────┤
│  L3 路由层     前台路由 · 后台 API · 公开 API         │
├─────────────────────────────────────────────────────┤
│  L2 渲染层     markdown 管线 · TSX 主题执行器         │
├─────────────────────────────────────────────────────┤
│  L1 契约层     content-model（schema 与全部派生）     │
├─────────────────────────────────────────────────────┤
│  L0 数据层     D1 主存储 · R2 媒体 · KV 缓存          │
└─────────────────────────────────────────────────────┘
```

依赖方向严格单向：L4 → L3 → L2 → L1 → L0。L1 契约层虽位于底层，但被 L2 与 L3 共同引用，是后台表单与前台渲染共享定义的唯一来源。

---

## 6. 核心模块

| 模块 | 层 | 职责 | 来源 |
|------|----|------|------|
| `content-model` | L1 | zod schema、TS 类型、后台表单字段派生、渲染上下文类型 | 新建 |
| `renderer` | L2 | markdown 渲染、XSS 净化、阅读时长计算、摘要生成 | 参考 Bloath `web/src/lib/markdown.ts`，迁至边缘 |
| `theme-zhuosu` | L2 | 拙素主题的 TSX 实现：布局、页面、组件、插槽 | 由 `themes/zhuosu` 的模板重写 |
| `routes-public` | L3 | 前台路由、RSS、sitemap、搜索接口 | 新建 |
| `routes-admin` | L3 | 后台 CRUD API | 新建 |
| `services/content` | L3 | 文章与页面的业务逻辑 | 新建 |
| `services/moment` | L3 | 说说的业务逻辑 | 新建 |
| `services/comment` | L3 | 评论、审核、反垃圾、回复 | 由 Bloath `comment/` 抽取 |
| `services/mirror` | L3 | Git 镜像导出与重试 | 由 Bloath `services/github.ts` 演进 |
| `services/auth` | L3 | 管理员会话（OAuth 可选） | 由 Bloath `routes/auth.ts` 抽取 |
| `services/media` | L3 | 媒体上传、元数据 | 由 Bloath 媒体模块抽取 |
| `studio` | L4 | 后台管理 SPA | 由 Bloath `web/` 演进 |

### 6.1 契约层的派生关系

```
                  content-model
                       │
      ┌────────┬───────┼────────┬────────┐
      ▼        ▼       ▼        ▼        ▼
  TS 类型   后台表单   D1 表   渲染上下   写入校验
           字段描述   结构      文类型
```

现状中「Bloath 的 `ArticleFrontmatter`」与「Hugo 模板对 `.Params` 的读取」是两份互相独立的定义。v2.0 要求二者由同一 schema 派生——这在选择 TSX 作为主题表达方式后具备编译期保障。

---

## 7. 数据模型

### 7.1 主要数据表

```
posts            文章与独立页面
  id, slug, type(post|page), title, content_md, content_html,
  excerpt, cover, status(draft|published), published_at,
  reading_time, template(page 专用), sort_order,
  encrypt(bool), encrypt_password_hash, encrypt_hint,
  encrypt_title, encrypt_message, created_at, updated_at

moments          说说
  id, content_md, content_html, pictures(json), video_url,
  link_url, link_text, author, status, created_at

terms            分类与标签
  id, type(category|tag), name, slug

post_terms       文章与分类标签的关联
  post_id, term_id

comments         评论（同时服务留言板、文章内嵌、说说行内）
  id, target_type(guestbook|post|moment), target_id,
  parent_id, nickname, email, website,
  content_md, content_html, status(pending|approved|spam),
  is_featured, ip_hash, user_agent, created_at

settings         站点与主题设置
  key, value(json)

media            媒体元数据（文件本体在 R2 或外部存储）
  id, storage_key, filename, mime, size, width, height, created_at

mirror_queue     Git 镜像任务
  id, entity_type, entity_id, op(upsert|delete),
  status, retry_count, last_error, created_at
```

### 7.2 设计说明

- **文章与页面共用 `posts` 表**，以 `type` 区分。二者的字段高度重合，分表会带来重复的查询逻辑
- **说说独立成表**。其字段（图片数组、视频、外链）与文章差异较大，强行合表会产生大量空字段
- **评论单表多态**。留言板、文章内嵌留言、说说行内留言三种场景共用一套审核与反垃圾逻辑，以 `target_type` 区分归属
- **分类与标签共用 `terms` 表**，以 `type` 区分。两者的查询模式一致
- **加密口令只存哈希**，不存明文亦不存可逆密文（详见 8.3）

---

## 8. 关键机制

### 8.1 渲染管线

```
请求 /posts/:slug
    │
    ▼
查 D1（status = published，含 type 约束）
    │
    ├── 记录不存在 ──► 渲染 404
    │
    ├── encrypt = true ──► 校验解锁 Cookie
    │       ├── 未解锁 ──► 渲染密码提示页（正文不参与渲染）
    │       └── 已解锁 ──► 继续
    │
    ▼
markdown 渲染（markdown-it，含代码高亮、表格、脚注等插件）
    │
    ▼
XSS 净化（净化在渲染后、注入模板前执行）
    │
    ▼
计算派生数据（阅读时长分级、摘要、前后篇、分类标签）
    │
    ▼
TSX 主题渲染（Hono JSX → HTML 字符串）
    │
    ▼
组装布局（baseof → sidebar → footer → 脚本注入）
    │
    ▼
写 KV 缓存（键含内容版本号）并返回
```

### 8.2 TSX 主题接口

主题以类型化代码包形式实现，接口大致如下：

```ts
export interface Theme {
  name: string
  renderIndex(ctx: IndexContext): HtmlElement
  renderPost(ctx: PostContext): HtmlElement
  renderList(ctx: ListContext): HtmlElement
  renderArchives(ctx: ArchiveContext): HtmlElement
  renderTaxonomy(ctx: TaxonomyContext): HtmlElement
  renderMoments(ctx: MomentsContext): HtmlElement
  renderGuestbook(ctx: GuestbookContext): HtmlElement
  renderNotFound(ctx: NotFoundContext): HtmlElement
  assets: AssetManifest
  slots: Record<string, SlotRenderer>
  styles: string[]
  scripts: string[]
}
```

拙素主题的现有模板对应关系：

| 现有模板 | 新实现 | 备注 |
|---------|--------|------|
| `_default/baseof.html` | 布局组件 + 页面外壳 | 侧边栏、页脚、脚本注入 |
| `index.html` | `renderIndex` | 文章列表 + 分页 |
| `_default/single.html` | `renderPost` | 含加密分支与内嵌留言 |
| `_default/list.html` | `renderList` | 通用列表 |
| `_default/taxonomy.html` / `terms.html` | `renderTaxonomy` | 分类与标签 |
| `moments/list.html` | `renderMoments` | 说说列表（复杂度最高，含图文视频与折叠） |
| `moments/single.html` | 说说详情 | 视需求决定是否保留独立页 |
| `page/links.html` | 友链页面 | 可作为页面渲染器的特殊模板 |
| `page/single.html` | 独立页面 | |
| `404.html` | `renderNotFound` | |
| `index.json` | 搜索接口 | 由构建期产物改为运行时查询 |
| `partials/*.html` | 对应组件 | article-card、head、pagination、sidebar-nav、social-icons、search、guestbook、post-encrypt |

**需自行实现的 Hugo 过滤器**：`PrevInSection` / `NextInSection`、`urlize`、`relURL` / `absURL`、`ReadingTime`、`.Summary | plainify`；`resources.Fingerprint` 由构建期的 Vite 资源哈希替代。

### 8.3 加密文章（服务端校验后渲染）

与现状的机制对比：

| 环节 | 现状 | v2.0 |
|------|------|------|
| 加密时机 | 构建期由脚本预加密 | 无需预加密，正文存库 |
| 口令存储 | `data/encrypt_passwords` 中的哈希 | 数据库中的哈希（PBKDF2 或 Argon2） |
| 密文位置 | 随 HTML 下发 | 不下发 |
| 校验位置 | 浏览器 | 服务端 |
| 解锁记忆 | 无（每次访问都需输入） | 签名 Cookie，TTL 可控 |
| 未解锁请求 | 仍收到密文，且存在明文降级分支 | 只收到提示页，正文不参与渲染 |

流程：

```
POST /api/unlock/:slug  { password }
    → 服务端读取 password_hash
    → PBKDF2 派生 + 恒定时间比较
    → 通过：签发 HMAC 签名 Cookie（payload = 文章 id + 过期时间）
    → 拒绝：返回统一错误，不泄露额外信息
```

签名 Cookie 采用无状态设计，省去 KV 读写。密钥从环境变量注入，不硬编码。

### 8.4 评论机制

沿用 Bloath 已有的评论能力（反垃圾、审核、邮件回复），做两处调整：

- **单表多态**：`target_type` 支持 `guestbook` / `post` / `moment`，替代现状中文章内嵌留言与留言板两套独立逻辑
- **审核状态**：`pending` / `approved` / `spam`，前台仅展示 `approved` 且 `is_featured` 的留言（对齐现状的「精选留言」）

### 8.5 缓存策略

| 缓存对象 | 键设计 | 失效方式 |
|---------|--------|---------|
| 页面 HTML | `page:<path>:<contentVersion>` | 内容变更时版本号自增 |
| 列表与归档 | `list:<type>:<page>:<indexVersion>` | 内容增删时索引版本号自增 |
| 站点设置 | `config:<configVersion>` | 设置变更时自增 |
| 主题静态资源 | `asset:<name>:<buildHash>` | 构建期哈希决定 |

采用版本号入键而非主动删除，旧缓存依靠 TTL 自然回收，规避边缘多节点删除的时序问题。

### 8.6 Git 镜像导出

```
内容变更（发布 / 更新 / 删除）
    │
    ▼
写入 mirror_queue（与业务写入同一批事务）
    │
    ▼
Cron Trigger 定时消费（或即时触发）
    │
    ▼
组装快照：frontmatter + markdown 正文
    │
    ▼
Git Data API 批量提交（单 commit 原子，复用 Bloath 的 commitBatch 思路）
    │
    ├── 成功：标记完成，记录 commit sha
    └── 失败：retry_count 自增，指数退避；持续失败则告警并提供手动对账
```

镜像目录结构（对齐现有 Hugo 站点，便于既有习惯延续）：

```
content/posts/<slug>.md          frontmatter + 正文
content/pages/<slug>.md
content/moments/<date>-<id>.md
data/settings.json               站点设置快照
data/terms.json                  分类与标签快照
```

---

## 9. 前后端职责边界

| 能力 | 后台 SPA（浏览器） | Worker（边缘） | 数据层 |
|------|------------------|--------------|--------|
| 内容编辑 | **拥有**：编辑器、表单、草稿 | 无关 | 无关 |
| 即时预览 | **拥有**：本地渲染（复用 renderer） | 无关 | 无关 |
| 契约校验 | 提供即时反馈（非权威） | **权威校验**：拒绝不合格写入 | 无关 |
| 页面渲染 | 不参与 | **拥有**：出站 HTML 唯一来源 | 无关 |
| 加密校验 | 提供输入界面 | **拥有**：哈希比对与解锁签发 | 口令哈希 |
| 评论审核 | 提供审核界面 | **拥有**：状态流转与反垃圾 | 评论数据 |
| 媒体上传 | 上传交互与预览 | **拥有**：校验、转存、元数据 | R2 或外部存储 |
| 镜像导出 | 展示状态与手动触发 | **拥有**：队列消费与提交 | Git 仓库 |
| 站点设置 | 设置界面 | **拥有**：校验与持久化 | 设置表 |

**三条边界原则**

1. **前端负责意图，后端负责真相**：前端可校验可预览，但结论不构成权威；出站 HTML 只由后端产生
2. **渲染器是共享代码，不是共享职责**：`renderer` 与 `content-model` 同构，后台引用是为了即时预览，边缘引用是为了权威输出
3. **后台不感知存储细节**：管理界面操作的是「一篇文章」，不接触 SQL、表结构或 Git 概念

---

## 10. 目录结构建议

```
taiping_blog/
├── packages/
│   ├── content-model/         # L1 契约：schema、类型、字段与上下文派生
│   └── renderer/              # L2 markdown 管线、净化、派生数据计算
├── themes/
│   └── zhuosu/                # 拙素主题的 TSX 实现 + 样式 + 客户端脚本
│       ├── layouts/           #   布局组件
│       ├── components/        #   列表项、分页、侧边栏、留言板等
│       ├── pages/             #   各页面渲染器
│       ├── slots/             #   插槽实现
│       ├── styles/            #   由现有 assets/css 迁移
│       └── scripts/           #   由现有 assets/js 迁移
├── apps/
│   ├── edge/                  # L3 边缘应用
│   │   ├── routes/            #   前台 / 后台 / 公开 API
│   │   ├── services/          #   内容、说说、评论、镜像、鉴权、媒体
│   │   ├── middleware/        #   鉴权、CORS、错误处理、缓存
│   │   └── migrations/        #   D1 迁移
│   └── studio/                # L4 后台管理 SPA
└── docs/
```

---

## 11. 技术选型

| 关注点 | 选型 | 依据 |
|--------|------|------|
| 边缘运行时 | Cloudflare Workers | 免服务器，与既有 Bloath 经验一致 |
| 边缘框架 | Hono | 轻量，原生 JSX 支持契合 TSX 主题 |
| 数据库 | D1（SQLite） | serverless，无运维 |
| 对象存储 | R2（可选） | 媒体存储；若已有外部图床可省 |
| 缓存 | KV（可选） | 建议先不引入，观察到延迟压力再加 |
| 契约 | zod | 运行时校验与类型推导一体 |
| Markdown | markdown-it | Worker 侧可运行，插件生态成熟 |
| 编辑器 | Vditor（后台） / OverType（评论输入） | 前者沿用 Bloath，后者与现有留言体验一致 |
| 后台前端 | React + Vite + Tailwind | 沿用 Bloath 技术栈 |
| 搜索 | D1 LIKE 或 FTS5 | 现状搜索仅覆盖标题与摘要，FTS5 可能超出实际所需；建议先用 LIKE 实现，规模增长后再评估 |
| 口令哈希 | PBKDF2（WebCrypto）或 Argon2 | Workers 环境优先 WebCrypto 自带实现 |
| 定时任务 | Cron Triggers | 镜像导出与缓存预热 |

---

## 12. 演进路线

### 阶段一：地基（数据与契约）

- 建立 `content-model`：文章、页面、说说、评论的 schema 与类型派生
- 建立 D1 表结构与迁移
- 交付判据：schema 可校验样例内容，类型在前后端可用

### 阶段二：渲染（复刻拙素）

- 实现 `renderer`（markdown 管线与派生数据）
- 将拙素主题的模板重写为 TSX 组件
- 交付判据：给定库中内容，边缘可输出与现站点视觉一致的页面

### 阶段三：管理（后台能力）

- 实现后台 API 与 SPA：文章、说说、评论、媒体、设置
- 实现加密文章的服务端校验与解锁
- 交付判据：全部日常操作可在后台完成，无需命令行

### 阶段四：主权（镜像与迁移）

- 实现镜像导出与重试
- 迁移既有内容（文章、说说、留言、设置）
- 交付判据：导出产物可被其他工具消费；新系统可完整替代现有 Hugo 站点

---

## 13. 风险与待验证

### 13.1 风险

| 风险 | 影响 | 缓解方向 |
|------|------|---------|
| 拙素模板重写的工作量 | 阶段二为主要投入区 | 逐页对照迁移，先完成文章与列表两条主线 |
| Hugo 过滤器语义的复刻偏差 | 渲染结果与现状不一致 | 建立逐页对照清单，以「视觉一致」为验收判据 |
| 说说模板复杂度 | 现有模板含大量嵌套条件，重写易出偏差 | 拆分为子组件，逐个对应现有条件分支 |
| Workers CPU 预算 | 渲染 + JSX 求值可能触及限制 | 阶段二实测单页渲染耗时，必要时引入 KV 缓存 |
| 镜像与业务写入的一致性 | 极端情况下导出滞后 | 同批事务入队 + 定时对账 + 手动补导入口 |
| 平台锁定 | 依赖 Cloudflare | 内容始终可导出为 markdown；数据层通过 schema 与访问层隔离 |

### 13.2 待验证事项

建议在动手前实测，避免设计建立在不牢靠的假设上：

1. **Workers 单页渲染耗时**：markdown 渲染 + TSX 求值 + 数据库查询的合计耗时，与免费额度的 CPU 限制对照
2. **D1 查询延迟**：列表页、归档页的聚合查询在实际数据量下的表现
3. **markdown-it 与 Vditor 的输出一致性**：编辑期预览与最终渲染需保持一致
4. **Hono JSX 与后台 SPA 共用构建链**：确认包体积与构建产物无冲突
5. **D1 对 FTS5 的支持**：仅在未来需要全文检索时相关，当前不阻塞

### 13.3 待决策

1. **说说是否保留独立详情页**：现状有 `moments/single.html`，若列表已承载全部内容，可省去
2. **文章内嵌留言与留言板的表单是否统一**：现状两处均加载 OverType 与 guestbook.css，可合并为同一组件
3. **媒体存储落点**：R2、外部图床，或延续 Bloath 的 Git image-branch 方案
4. **归档页的实现**：现状由 Hugo 的 section 机制产出，新系统需明确分组规则（按年或按月）
5. **是否需要保留 GitHub OAuth 登录**：若仅单作者自用，账号口令 + 会话可能比 OAuth 更简单
