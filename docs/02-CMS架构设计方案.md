# 太平 CMS 架构设计方案

> 项目：**太平 CMS**（`taiping-blog`）
> 运行时：Cloudflare Workers + D1 + KV + R2
> 参考依据：[`docs/01-参考项目架构分析.md`](./01-参考项目架构分析.md)
> 文档性质：实施蓝图。代码结构、表结构、接口与扩展方式都以本文为准；本文与代码不一致时，以「先改本文再改代码」的顺序处理。

## 1. 设计目标与边界

### 1.1 目标

1. **单 Worker 交付**：一个 Worker 同时提供前台渲染、后台 JSON API、后台 SPA 静态资源与媒体直出，不存在需要单独部署的服务。
2. **前后端分离**：前台由服务端渲染（SEO 友好、零框架运行时），后台是由独立构建产物承载的 SPA，两者通过 `/api` 契约通信。
3. **可换皮的模板层**：主题是编译进 Worker 的模块，声明自己的能力与配置项；换主题不动数据层与路由层。
4. **权限可表达**：「作者只能改自己的、编辑能改所有人的」这类差异由权限目录表达，不写进业务代码。
5. **扩展不改内核**：新增插件、主题、内容类型、自定义字段都不需要修改总线、路由或数据访问层。
6. **可验证**：功能、性能、兼容性三部分都要有可复跑的测试或脚本，不靠人工点。

### 1.2 非目标

| 不做的事 | 理由 |
| --- | --- |
| 多租户 / SaaS | 单站点定位，多租户会把权限与存储都复杂化一个量级 |
| 运行时可执行的主题包与插件包 | Workers 里做沙箱执行的成本与风险远高于收益，见 ADR 0003 |
| 本地全文索引引擎 | D1 的 FTS5 已经够用，引入外部搜索引擎是运维负担 |
| 分布式强一致计数器 | 浏览量、评论数这类指标允许最终一致，用定时落库即可 |
| 完整的内容审批工作流引擎 | 状态机只有五个状态，用显式流转接口比通用工作流引擎更好测 |

### 1.3 约束

| 约束 | 影响 |
| --- | --- |
| Workers 无文件系统、无常驻进程 | 状态全部外置；定时任务挂 cron；不做进程内缓存 |
| D1 是 SQLite | 无存储过程、无严格外键约束（需应用层保证）、FTS5 可用 |
| Worker 有 CPU 预算 | 口令哈希迭代次数、单请求查询数、Markdown 渲染都要控制 |
| 冷启动与包体积 | Worker 包体控制在 2 MB 以内；前台不引入 React |
| KV 是最终一致 | 只用它做缓存与计数，不做需要强一致的判定 |

## 2. 总体架构

### 2.1 分层

```
                    ┌─────────────────────────────────────────┐
   访客 ──────────►  │ Worker 入口（apps/server/src/index.ts）  │
                    │   fetch / scheduled                     │
                    └───────────────┬─────────────────────────┘
                                    │  中间件链（顺序即安全边界）
       ┌────────────────────────────┼────────────────────────────┐
       ▼                            ▼                            ▼
  /api/*                      /（前台 SSR）                   /media/*、/assets/*
  ┌──────────────┐            ┌──────────────┐              ┌──────────────┐
  │ api/ 路由层  │            │ site/ 路由层 │              │ R2 / ASSETS  │
  │  zod 校验    │            │  URL 解析    │              │  直出        │
  └──────┬───────┘            └──────┬───────┘              └──────────────┘
         ▼                           ▼
  ┌────────────────────────────────────────────┐
  │ lib/ 领域层                                 │
  │  content-service / auth / rbac / settings   │
  │  markdown / search / cache / hooks / tasks  │
  └──────┬─────────────────────────────────────┘
         ▼
  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
  │ db/ schema   │   │ theme/ 主题层 │   │ plugins/ 插件 │
  │  Drizzle     │   │  只接收 view  │   │  钩子 + 清单  │
  └──────┬───────┘   │  model       │   └──────────────┘
         ▼           └──────────────┘
     D1 / KV / R2
```

依赖方向是单向的：`api` 与 `site` 可以引用 `lib` 与 `theme`；`lib` 可以引用 `db`；`theme` 不能引用 `db`、`env` 或网络；`shared` 不引用以上任何一层。

这条规则的价值在排查时体现：任何一次「后台改一条数据，前台没变」都可以按「api → lib → db → 缓存版本」这条固定路径查，不需要读主题代码。

### 2.2 请求生命周期

| 阶段 | 动作 | 代码位置 |
| --- | --- | --- |
| 1 | 生成请求 ID、记录开始时间 | `middleware/request.ts` |
| 2 | 注入安全响应头（CSP、HSTS、X-Frame-Options 等） | `middleware/security.ts` |
| 3 | 开发期 CORS 白名单（仅 `CONSOLE_ORIGIN`） | 同上 |
| 4 | 写操作的同源校验（CSRF） | 同上 |
| 5 | 解析登录态：cookie 或 Bearer → SHA-256 → 会话表 → KV 缓存 30 秒 | `middleware/session.ts`、`lib/auth.ts` |
| 6 | 路由分派 | `app.ts` |
| 7 | 业务处理：`lib` 领域函数 | 各路由 |
| 8 | 缓存写入（前台匿名 GET） | `lib/cache.ts` |
| 9 | 统一错误映射 | `middleware/error.ts` |
| 10 | 记录 Server-Timing，5xx 打日志 | `middleware/request.ts` |

中间件顺序不可随意调整，两处必须记住：

- **同源校验在会话解析之前**：CSRF 拦截不应该依赖登录态，否则未登录时的跨站请求会走进业务分支再被拒。
- **安全头在业务之后仍然生效**：`securityHeaders` 在 `await next()` 之后写响应头，因此错误响应也带安全头。

### 2.3 技术栈定稿

| 项 | 选型 | 版本 | 理由 |
| --- | --- | --- | --- |
| 运行时 | Cloudflare Workers | compatibility_date 2026-09-01 | D1 / KV / R2 / Cron 同生态 |
| 语言 | TypeScript | 5.9 | 严格模式，无 `any` |
| HTTP 框架 | Hono | 4.13 | 中间件模型清晰，包体小 |
| API 契约 | `@hono/zod-openapi` | 1.6 | 一次定义得到校验、类型与 `/api/doc`，无生成步骤 |
| ORM | Drizzle ORM | 0.45 | 类型安全、迁移可读 |
| 数据库 | D1（SQLite + FTS5） | — | 关系清晰、支持全文索引 |
| 缓存 | KV（配置/会话/限流）+ Cache API（页面） | — | 分层清晰 |
| 对象存储 | R2 | — | 媒体原件 |
| 后台前端 | React + Vite + TanStack Query | 19 / 7 / 5 | 交互复杂度需要组件与请求缓存 |
| 后台样式 | Tailwind CSS | 4 | 无运行时，构建期产出 |
| Markdown | marked + highlight.js | 18 / 11 | 纯 JS，Workers 可跑 |
| 拼音 | pinyin-pro | 3.29 | 中文标题转 slug |
| 测试 | Vitest（Node）+ `@cloudflare/vitest-plugin`（workerd） | 4.1 | 纯函数与集成分层 |
| 部署 | wrangler | 4.152 | 稳定工具链 |

## 3. 仓库与目录结构

```
taiping_blog/
├── apps/
│   ├── server/                  服务端（Worker）
│   │   ├── src/
│   │   │   ├── index.ts         fetch + scheduled 入口
│   │   │   ├── app.ts           应用装配（中间件顺序 + 路由挂载）
│   │   │   ├── env.ts           Env / 上下文变量类型（唯一真值）
│   │   │   ├── api/             JSON API 路由（按领域分文件）
│   │   │   ├── site/            前台路由、数据装载、SEO
│   │   │   ├── lib/             领域层（业务逻辑与基础设施）
│   │   │   ├── db/              Drizzle schema 与客户端
│   │   │   ├── theme/           主题契约、注册表、各主题实现
│   │   │   ├── plugins/         内置插件
│   │   │   ├── middleware/      请求上下文、安全、会话、错误
│   │   │   └── shared/          前后端共享的纯常量与 zod 结构
│   │   └── migrations/          D1 迁移（drizzle-kit 生成 + 自定义）
│   └── console/                 后台 SPA（React）
│       └── src/
│           ├── api/             接口客户端与类型
│           ├── components/      通用组件
│           ├── features/        按领域分的页面模块
│           └── layouts/         布局与导航
├── docs/                        设计与使用文档
├── scripts/seed.mjs             演示数据初始化（走 API 的端到端脚本）
├── tests/                       集成测试
├── wrangler.jsonc               绑定与部署配置
└── vitest*.config.ts            两套测试配置
```

三个目录职责的判定规则：

| 问题 | 答案 |
| --- | --- |
| 一段逻辑只被前台用 | 放 `site/` |
| 一段逻辑只被 API 用 | 放 `api/` |
| 一段逻辑两边都要用（如内容保存、slug 生成） | 放 `lib/`，两边调用 |

`shared/` 有一条例外规则：它被后台 SPA 直接引用，因此**不允许**依赖任何 Workers 专有 API，也不允许 import `db` 或 `lib`。

## 4. 数据模型

### 4.1 全局约定

| 约定 | 内容 | 理由 |
| --- | --- | --- |
| 主键 | `前缀_16位base32` 文本，如 `cnt_1a2b3c4d5e6f7g8h` | 跨表肉眼可辨；前缀见 `lib/id.ts` 的 `IdPrefix` |
| 时间 | `INTEGER` 存 unix 毫秒，Drizzle 用 `timestamp_ms` | 排序与区间查询直接比较，无时区歧义 |
| 逻辑删除 | `deleted_at`（NULL 表示未删除） | 保留审计线索，恢复不需要重建行 |
| slug 唯一 | 部分唯一索引 `WHERE deleted_at IS NULL` | 回收站里的内容不占用 slug |
| 布尔 | `INTEGER` + `{ mode: "boolean" }` | SQLite 无布尔类型 |
| 枚举 | `text(..., { enum: [...] })` | 类型层收窄，DB 层不加 CHECK（SQLite 改 CHECK 要重建表） |
| 计数 | 冗余列（`comment_count`、`view_count`、`term.count`） | 列表页不做 JOIN COUNT |

### 4.2 表清单

**账号与权限**

| 表 | 作用 | 关键列 |
| --- | --- | --- |
| `users` | 用户 | `email` / `username` 唯一，`password_hash`，`status`，`must_change_password` |
| `roles` | 角色 | `key` 唯一，`is_system` 标记内置 |
| `role_permissions` | 角色 → 权限 | 复合主键，权限键为字符串 |
| `user_roles` | 用户 → 角色 | 复合主键，带 `granted_by` 追溯 |
| `sessions` | 会话 | `token_hash` 唯一，`expires_at`，`revoked_at` |
| `api_tokens` | 访问令牌 | `token_hash` 唯一，`token_prefix` 用于辨识 |
| `audit_logs` | 审计日志 | `action` / `target_type` / `target_id` / `meta_json` |

**内容**

| 表 | 作用 | 关键列 |
| --- | --- | --- |
| `contents` | 全部内容（文章 / 页面 / 动态 / 项目） | `type`、`slug`、`status`、`visibility`、`body_markdown`、`body_html`、`author_id`、`published_at`、`scheduled_at`、`deleted_at` |
| `content_revisions` | 版本快照 | `content_id` + `revision_no` 唯一 |
| `terms` | 分类 / 标签 / 系列 | `type` + `slug` 唯一，`parent_id` 自引用，`count` 冗余 |
| `content_terms` | 内容 ↔ 术语 | 复合主键 |
| `field_definitions` | 自定义字段定义 | `key` 唯一，`field_type`，`applies_to_json` |
| `field_values` | 自定义字段值 | `content_id` + `field_key` 复合主键，值按类型分列 |
| `comments` | 评论 | `content_id`、`parent_id`、`root_id`、`depth`、`status` |
| `media` | 媒体 | `storage_key` 唯一，`checksum` 去重，`driver` 区分 R2 / 外链 |

**系统**

| 表 | 作用 |
| --- | --- |
| `settings` | 键值配置，键按 `site.` / `theme.<id>.` / `plugin.<key>.` 前缀分命名空间 |
| `nav_items` | 导航项，`location` 区分头部 / 页脚 / 侧栏 |
| `plugins` | 插件状态与配置 |
| `tasks` | 待处理任务（派生任务、通知） |
| `locks` | 幂等锁（带过期时间） |
| `redirects` | 旧地址跳转 |
| `content_fts` | FTS5 虚表，全文检索 |

共 21 张实体表 + 1 张虚拟表。相对参考项目的变化与理由：

| 变化 | 理由 |
| --- | --- |
| 单一 `contents` 表承载四种类型 | 四种类型的字段重合度超过 80%；拆表会让「最近更新」这类跨类型查询变成 UNION |
| 不建公开快照表 | 读一致性由状态 + 读时判断 + 缓存版本号达成，见 ADR 0001 |
| 分类与标签分表存放 | 分类有层级、标签没有；共表会让层级字段在标签上永远为空 |
| 自定义字段拆「定义表 + 值表」 | 加字段不需要迁移；与 `contents` 解耦后字段可以跨类型复用 |
| 配置用键值表而非 JSON 单行 | 键由代码里的字段定义约束，写入路径可校验 |

### 4.3 关键索引

| 索引 | 服务的查询 |
| --- | --- |
| `contents_slug_unique`（部分唯一） | 按 slug 取详情 |
| `contents_status_published_idx` | 前台列表与归档 |
| `contents_type_status_idx` | 后台按类型 + 状态过滤 |
| `contents_scheduled_idx` | cron 捞取到点的定时内容 |
| `comments_content_idx` / `comments_status_created_idx` | 内容下的评论、后台待审列表 |
| `media_folder_idx` / `media_checksum_idx` | 媒体库列表、上传去重 |
| `tasks_status_run_idx` | 任务调度 |
| `content_fts`（FTS5） | 全文检索 |

## 5. 权限体系

### 5.1 三层结构

```
users ──< user_roles >── roles ──< role_permissions >── permission key
                          │
                          └── 内置角色（代码定义）/ 自定义角色（后台创建）
```

权限键是**字符串常量**，目录定义在 `apps/server/src/shared/permissions.ts`，前后端共用同一份。

### 5.2 权限键命名

格式：`资源.动作[.范围]`。

| 范围 | 含义 | 判定方式 |
| --- | --- | --- |
| 无后缀 | 与对象无关 | 只查权限集合 |
| `.own` | 仅限本人创建的对象 | 必须传入对象作者，与当前用户比较 |
| `.any` | 任意对象 | 只查权限集合 |

以内容为例：

| 权限键 | 含义 |
| --- | --- |
| `content.create` | 创建内容 |
| `content.update.own` | 编辑自己创建的 |
| `content.update.any` | 编辑任何人创建的 |
| `content.delete.own` / `.any` | 删除（移入回收站） |
| `content.publish.own` / `.any` | 发布、定时发布 |
| `content.review` | 审核待审内容 |
| `content.restore` | 从回收站恢复、彻底删除 |

### 5.3 判定规则

判定入口集中在 `lib/rbac.ts`，只有四个函数：

| 函数 | 用途 |
| --- | --- |
| `can(auth, permission)` | 与对象无关的权限判断 |
| `assertCan(auth, permission)` | 同上，不满足抛 403 |
| `assertContentAccess(auth, action, content)` | 按 `content.authorId` 自动选 `.own` / `.any` |
| `assertCanManageUser(auth, target)` | 用户管理侧的越权保护（非 owner 不能动 owner） |

三条必须遵守的实现约束：

1. **owner 角色短路放行**。`isSuperAdmin` 为真时跳过权限集合检查，避免「新增权限后忘记给 owner 配上」导致站点所有者把自己锁在门外。
2. **持有 `.any` 的人天然可以处理自己的对象**。判定时先试 `.own`，失败再试 `.any`，避免角色配置里漏配 `.own` 造成行为不一致。
3. **未登录先抛 401 再抛 403**。`assertAuthenticated` 在所有断言函数的最前面，保证「未登录」与「登录了但没权限」两类错误可以区分。

### 5.4 内置角色

| 角色 | 定位 | 权限范围 |
| --- | --- | --- |
| `owner` | 站点所有者 | 全部权限（含 API 令牌管理）；不可删除，权限不可下调 |
| `admin` | 管理员 | 除 API 令牌管理外的全部权限 |
| `editor` | 编辑 | 全部内容、分类标签、评论、媒体、导航、内容模型 |
| `author` | 作者 | 本人内容的增删改发 + 媒体上传 + 回复评论 |
| `contributor` | 投稿者 | 只能写草稿，不能发布、不能删除已发布内容 |
| `subscriber` | 订阅者 | 无后台权限，仅可登录前台评论 |

内置角色的定义在代码里，初始化时写入数据库（`lib/bootstrap.ts`）。规则是：

- 角色不存在 → 按代码定义创建；
- 角色已存在 → **不动它的权限**，避免覆盖管理员在后台的调整；
- 需要回滚到代码定义时显式调用 `resyncBuiltinRoles`。

## 6. 内容模型

### 6.1 四种内容类型

| 类型 | 路由 | 分类标签 | 评论 | 封面 | 版本 | 定时 | SEO |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `post` 文章 | `/post/{slug}` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `page` 页面 | `/{slug}` | ✗ | ✗ | ✗ | ✓ | ✗ | ✓ |
| `moment` 动态 | `/moment/{slug}` | ✓ | ✓ | ✗ | ✗ | ✓ | ✗ |
| `project` 项目 | `/project/{slug}` | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ |

能力由 `shared/content-types.ts` 的 `supports` 声明。新增类型 = 注册表加一条 + 主题加可选模板，**不需要改表结构**。

### 6.2 状态机

```
draft ──► pending ──► published ──► trashed ──► （超期物理删除）
  ▲          │           │  ▲          │
  └──────────┘           │  └──────────┘
                         ▼
                     scheduled ──► published（cron 或读时判断）
```

| 状态 | 前台可见 | 说明 |
| --- | --- | --- |
| `draft` | 否 | 草稿 |
| `pending` | 否 | 待审核，投稿者提交后停在这里 |
| `scheduled` | 否 | 有 `scheduled_at`，到点后由 cron 或读时判断转为已发布 |
| `published` | 是 | 且要求 `published_at <= now` |
| `trashed` | 否 | 有 `deleted_at`，超过保留期由 cron 物理删除 |

状态只能通过 `POST /api/contents/{id}/status` 流转，**不允许**通过 PATCH 直接改。理由：状态变化牵涉发布权限、定时时间、索引刷新与缓存失效，混在普通更新里会让「改个错别字顺手把草稿发了」这种事变得可能。

### 6.3 可见性与访问控制

| `visibility` | 行为 |
| --- | --- |
| `public` | 匿名可访问 |
| `private` | 仅登录用户可访问 |
| `password` | 需要密码解锁，解锁后签发无状态 cookie（值 = `sha256("tp-unlock:" + 内容 ID + 密码)`） |

解锁令牌不带状态：内容密码一改，旧 cookie 自然失效，不需要额外的失效表。

### 6.4 自定义字段

字段定义与值分离：

| 层 | 表 | 内容 |
| --- | --- | --- |
| 定义 | `field_definitions` | `key`、`label`、`field_type`、`options_json`、`applies_to_json`、`sort_order` |
| 值 | `field_values` | `content_id`、`field_key`、按类型分列存值 |

字段类型与落列的关系：

| 类型 | 落列 |
| --- | --- |
| `text` / `textarea` / `markdown` / `date` / `select` / `url` | `value_text` |
| `number` | `value_number` |
| `boolean` | `value_bool` |
| `json` | `value_json` |

按类型分列而不是统一塞 JSON，是为了让「按字段筛选」这类查询能用索引。

## 7. 插件与扩展机制

### 7.1 形态

插件 = 一个导出 `PluginManifest` 的模块，编译进 Worker：

```ts
export const tocPlugin: PluginManifest = {
  key: "toc",
  name: "自动目录",
  version: "1.0.0",
  description: "根据正文标题自动生成目录。",
  author: "太平",
  defaultEnabled: false,
  settings: [{ key: "minHeadings", label: "最少标题数", type: "number", default: 3 }],
  hooks: {
    filters: {
      "content.renderHtml": (payload, ctx) => ({ ...payload, html: buildToc(payload.headings) + payload.html }),
    },
  },
};
```

不做动态加载的理由见 ADR 0003：Workers 里执行第三方代码要么依赖受限的动态 `import`，要么自己实现解释器，两条路都引入沙箱与冷启动成本。需要数据面扩展时走 webhook 这类出口。

### 7.2 钩子

| 钩子 | 类型 | 触发点 |
| --- | --- | --- |
| `content.beforeSave` | filter | 保存内容前改写 Markdown |
| `content.renderHtml` | filter | 前台渲染正文后改写 HTML |
| `site.headHtml` | filter | 页面 `<head>` 内容注入 |
| `site.footerHtml` | filter | 页面底部注入（脚本） |
| `comment.beforeCreate` | filter | 评论入库前改写正文 |
| `content.afterSave` | call | 内容保存后 |
| `content.afterPublish` | call | 发布后 |
| `content.afterDelete` | call | 删除后 |
| `comment.afterCreate` | call | 评论入库后 |
| `app.scheduled` | call | cron 触发时 |

语义沿用 Typecho：

- `filter` 是管道，前一个插件的输出是后一个的输入；
- `call` 是副作用，返回值被忽略。

### 7.3 运行与容错

- 执行顺序按插件 key 排序，保证顺序稳定可复现。
- **单个插件抛错不会中断整条链**：捕获后打日志并继续下一个。理由：插件是可选增强，它挂掉不该让页面白屏。
- 启用状态由 `plugins` 表决定，并用 KV 缓存 60 秒（`plugins:enabled`），避免每请求查库。

### 7.4 新增插件 / 主题 / 内容类型的步骤

| 目标 | 步骤 |
| --- | --- |
| 新增插件 | 1. `plugins/<key>.ts` 导出 `PluginManifest`；2. 在 `plugins/index.ts` 的数组里加一项；3. 在后台「插件」页启用并配置 |
| 新增主题 | 1. `theme/<id>/index.tsx` 导出 `Theme`（manifest + render）；2. 在 `theme/registry.ts` 的 `THEMES` 数组里加一行；3. 后台「外观」页切换 |
| 新增内容类型 | 1. `shared/content-types.ts` 加一条定义；2. 主题按 `supports` 决定渲染分支；3. 如需独立路由，在 `site/router.ts` 加一个前缀 |
| 新增自定义字段 | 后台「内容模型」页创建，或在 `scripts/seed.mjs` 里加一条；不需要改代码 |

## 8. 主题与模板

### 8.1 契约

主题导出 `Theme = { manifest, render }`：

| 字段 | 内容 |
| --- | --- |
| `manifest.id` / `name` / `version` / `author` / `description` | 元信息，后台展示 |
| `manifest.supports` | 能力声明：暗色模式、目录、侧栏、评论样式、动态、项目 |
| `manifest.settings` | 主题配置项，后台据此生成表单 |
| `manifest.styles` | 主题 CSS（内联注入 `<head>`） |
| `manifest.scripts` | 渐进增强脚本（可选） |
| `render.layout(ctx, meta, children)` | 文档骨架 |
| `render.home / archive / term / post / page / moments / projects / search / error` | 各页面渲染 |

### 8.2 两条硬约束

1. **主题不取数据**。所有数据由 `site/data.ts` 装载成 view model 后传入。这样换主题不会把查询逻辑一起换掉，也不会因为主题作者写了 N+1 查询而拖垮 TTFB。
2. **主题是同步的**。renderer 不返回 Promise，避免在渲染链里引入异步依赖。

### 8.3 模板选择

当前实现是「主题决定模板」，即一个主题里每种页面一个实现。Typecho 那种「`custom → type/slug → type → single/archive → index`」的回落链在这里由 `contents.template` 字段预留：

- 字段已存在并会在编辑页出现；
- 主题可以选择性识别它做分支；
- 未识别时不报错，走默认实现。

这样保留了自定义单页模板的能力，但没有把回落链塞进内核。

### 8.4 内置主题

| 主题 | 定位 | 特点 |
| --- | --- | --- |
| `default`（纸墨） | 中文长文阅读优先 | 类纸底色、清晰正文排版、侧栏、目录、暗色模式、完整 CSS |
| `paper`（素纸） | 极简单列 | 无侧栏无卡片，验证「换主题只改显示层」 |

## 9. API 设计

### 9.1 前缀与分组

| 前缀 | 分组 |
| --- | --- |
| `/api/auth` | 登录、初始化、会话、口令 |
| `/api/contents` | 内容读写与状态流转、版本 |
| `/api/terms` | 分类 / 标签 / 系列 |
| `/api/comments` | 评论审核与回复 |
| `/api/media` | 媒体库（含 R2 上传） |
| `/api/users` | 用户管理 |
| `/api/roles` | 角色与权限矩阵 |
| `/api/settings` | 站点设置、主题、维护任务 |
| `/api/fields` | 内容模型 |
| `/api/nav` | 导航菜单 |
| `/api/plugins` | 插件启停与配置 |
| `/api/audit` | 审计日志 |
| `/api/dashboard` | 后台统计 |
| `/api/doc` | OpenAPI 文档（Swagger UI 在 `/api/reference`） |

### 9.2 响应约定

成功：

```json
{ "ok": true, "data": { } }
```

失败（由 `middleware/error.ts` 统一产出）：

```json
{ "ok": false, "error": { "code": "FORBIDDEN", "message": "缺少权限：content.update.any", "fields": { "title": "不能为空" } } }
```

| `code` | HTTP | 含义 |
| --- | --- | --- |
| `BAD_REQUEST` | 400 | 参数语义错误 |
| `VALIDATION_FAILED` | 422 | zod 校验失败，`fields` 给出字段级原因 |
| `UNAUTHORIZED` | 401 | 未登录或凭据无效 |
| `FORBIDDEN` | 403 | 已登录但权限不足 |
| `NOT_FOUND` | 404 | 资源不存在 |
| `CONFLICT` | 409 | 唯一性冲突或状态不允许 |
| `RATE_LIMITED` | 429 | 触发限流 |
| `PAYLOAD_TOO_LARGE` | 413 | 上传超限 |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | MIME 类型不允许 |
| `INTERNAL` | 500 | 未预期异常 |

业务处理器**只声明成功响应**，错误一律通过 `throw AppError` 抛出。这样错误码在 OpenAPI 里表达的是「可能发生」而不是「每条都返回」，handler 里也不需要写 if/else 判错。

### 9.3 分页

所有列表接口统一：

```
GET /api/contents?page=2&pageSize=20&status=published&type=post
→ { ok: true, data: { items: [...], meta: { page, pageSize, total, totalPages } } }
```

`pageSize` 上限 100，且在解析层强制（`parsePagination`），不依赖各路由自觉。

### 9.4 凭证

| 方式 | 用途 | 传递 |
| --- | --- | --- |
| Cookie 会话 | 后台 SPA、前台表单 | `Set-Cookie: taiping_session=...; HttpOnly; SameSite=Lax; Secure` |
| Bearer 令牌 | 脚本、CI | `Authorization: Bearer <token>` |

两者都解析成同一个 `AuthContext`。区别在 CSRF 判定：携带 Bearer 的请求跳过同源校验（浏览器不会自动附带它，没有 CSRF 面）。

## 10. 缓存与性能

### 10.1 分层

| 层 | 存什么 | TTL | 失效方式 |
| --- | --- | --- | --- |
| Cache API | 匿名 GET 的 HTML | 可配，默认 300 秒 | 全局版本号变化 |
| KV | 站点配置、启用插件集合、已解析会话、限流计数 | 30–300 秒 | 主动删除或版本号 |
| D1 | 真相源 | — | — |
| 请求内 | 单次请求复用的设置快照 | 请求结束 | — |

### 10.2 缓存版本号

所有前台页面缓存的键都带一个版本前缀：

```
{origin}/__cache/v{version}{pathname}{search}
```

发布内容、改设置、切主题、启停插件都会 `bumpCacheVersion`，版本号一变，全部缓存键同时失效。代价是旧条目要等 TTL 自然过期才回收，无法按 URL 精确失效。个人博客量级可以接受，改造成本远低于维护 tag 到 URL 的映射表。

### 10.3 三条必须遵守的缓存纪律

1. **带 Cookie 的请求不走缓存**，否则会把登录态内容写进共享缓存。
2. **读接口不得有写副作用**。浏览量改成「读时在内存累计 + 定时任务落库」，读路径不写库。
3. **缓存键必须包含查询串**。`?page=2` 与 `?page=3` 是两份缓存。

### 10.4 性能取舍

| 决策 | 影响 |
| --- | --- |
| 前台不引入 React | Worker 包体 1.4 MB / gzip 269 KB，冷启动可控 |
| 详情页现渲染 Markdown 而不是读缓存列 | 插件钩子能拿到准确的 headings；单次渲染在毫秒级 |
| 列表页读 `body_html` 派生的摘要列 | 避免为列表渲染全文 |
| 设置与启用插件集合走 KV | 每请求省两次 D1 往返 |
| 计数冗余列 | 列表页不做 JOIN COUNT |
| `pageSize` 上限 100 | 防止一次拉全表进内存 |

## 11. 定时任务

`wrangler.jsonc` 配 `crons: ["*/5 * * * *"]`，`index.ts` 的 `scheduled` 处理：

| 任务 | 作用 | 幂等性 |
| --- | --- | --- |
| `publishDueContent` | 把 `scheduled` 且到点的内容转为 `published` | 条件更新，重复执行无副作用 |
| `purgeExpiredTrash` | 物理删除超过保留期的回收站内容（连带版本、评论、术语关联） | 按 `deleted_at < 阈值` 筛选 |
| `purgeExpiredSessions` / `purgeExpiredTokens` | 清理过期会话与令牌 | 按过期时间删除 |
| `purgeStaleLocks` | 清理过期锁 | 同上 |
| `runPendingTasks` | 消费 `tasks` 表（重建搜索索引、评论通知） | 任务带状态与重试次数，超过 3 次标记失败 |

两条设计约束：

- **定时发布不依赖 cron 准时**。前台查询本身要求 `published_at <= now`，cron 迟到只影响索引刷新，不影响可见性。
- **有变更才 bump 缓存版本**。`runScheduledTasks` 返回 `changed` 标记，避免每 5 分钟无意义地作废全站缓存。

## 12. 安全模型

| 面 | 措施 | 代码位置 |
| --- | --- | --- |
| 口令 | PBKDF2-HMAC-SHA256，100k 次迭代，16 字节随机盐，比对用常量时间 | `lib/crypto.ts` |
| 会话令牌 | 32 字节 CSPRNG，库里只存 SHA-256 | 同上 |
| 会话生命周期 | 可单条吊销、可按用户批量吊销；改密/停用/改角色都会触发批量吊销 | `lib/auth.ts` |
| 凭证存储 | HttpOnly + SameSite=Lax + Secure cookie；不落 localStorage | 同上 |
| CSRF | 写操作校验 Origin 与 Host 同源；Bearer 请求豁免 | `middleware/security.ts` |
| 越权 | 权限目录 + `.own` / `.any` 双档 + 对象作者校验 | `lib/rbac.ts` |
| XSS（正文） | Markdown 关闭原生 HTML 透传，HTML 由渲染器拼出并转义属性 | `lib/markdown.ts` |
| XSS（评论） | 纯文本存储，模板层转义 | `site/data.ts` |
| XSS（响应头） | CSP、`X-Content-Type-Options`、`X-Frame-Options`、Referrer-Policy | `middleware/security.ts` |
| 上传 | MIME 前缀白名单 + 体积上限 + 内容哈希去重；R2 对象不可执行 | `api/media.ts` |
| 限流 | 登录按 IP、评论按 IP、注册按 IP | `middleware/security.ts` |
| 审计 | 所有写操作落 `audit_logs` | `lib/audit.ts` |
| 敏感操作 | 重置他人密码、改角色、彻底删除都要求更高权限并留痕 | 各路由 |

一处明确的取舍：CSP 保留了 `'unsafe-inline'`。原因是后台 SPA 与前台主题各有一处必要的内联脚本（主题的渐进增强、构建产物的首屏注入）。换成 nonce 需要把这两处改成外链资源，收益有限。这个决定记录在 ADR 0005。

## 13. 部署与配置

### 13.1 绑定

| 绑定 | 类型 | 用途 |
| --- | --- | --- |
| `DB` | D1 | 主库 |
| `KV` | KV | 配置 / 会话 / 限流缓存 |
| `MEDIA` | R2 | 媒体原件 |
| `ASSETS` | Assets | 后台 SPA 构建产物 |

### 13.2 环境变量与密钥

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `ENVIRONMENT` | var | `development` / `production` / `test` |
| `PUBLIC_BASE_URL` | var | 生成绝对 URL（RSS、sitemap、JSON-LD） |
| `CONSOLE_ORIGIN` | var | 开发期后台来源，用于 CORS 白名单 |
| `SETUP_TOKEN` | secret（可选） | 初始化管理员时的校验令牌 |

### 13.3 部署顺序

```
1. 创建 D1 与 R2，回填 wrangler.jsonc 里的 id
2. wrangler d1 migrations apply DB --remote
3. pnpm build          # 构建后台 SPA + Worker 产物
4. wrangler deploy
5. curl -X POST https://<域名>/api/auth/setup   # 初始化站点所有者
```

本地开发不需要第 1、2 步的远程部分，`pnpm db:migrate` 会把迁移打到本地状态目录。

## 14. 后续扩展点

按「改动范围 / 收益」排序，留白但不实现：

| 扩展点 | 需要的改动 |
| --- | --- |
| 邮件通知 | 新增插件 + 一个发信适配器；`tasks` 表已有投递任务的位置 |
| OAuth 登录 | `users` 加 provider 列 + 一个回调路由；会话模型无需改动 |
| 图片处理（缩略图、WebP） | 上传路径接入 Cloudflare Images，`media` 表加变体列 |
| 多语言内容 | `contents` 已有 `locale` 概念的位置，需要加翻译组关联表 |
| 评论订阅通知 | `comment.afterCreate` 钩子 + 退订令牌表 |
| 静态导出 | `site/data.ts` 已是纯数据层，可以复用成导出脚本的数据源 |

不打算做的：把主题改成可上传的模板包、把插件改成可动态加载的第三方代码、引入外部搜索引擎。这三件事都与「单 Worker 可交付」的目标冲突。
