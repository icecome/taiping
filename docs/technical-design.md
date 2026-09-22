# taiping_blog 技术方案

> 版本：v1.0（2026-09-18）
> 上游文档：`architecture-design.md` v2.0
> 范围：技术栈选型、前端架构设计、前后端协作与数据交互、工程化方案

---

## 1. 范围与前提

### 1.1 三个客户端面

本项目中「前端」并非单指一个应用，需要先区分三个角色，否则技术选型会失焦：

| 客户端面 | 形态 | 技术栈 | 说明 |
|---------|------|--------|------|
| 读者端 | 服务端渲染的 HTML + 少量渐进增强脚本 | 由 TSX 主题产出，脚本为原生 JS | 不做 SPA，首屏内容不依赖 JS |
| 后台管理端（Studio） | React SPA | React + Vite + TanStack Query | 唯一的 SPA，本方案的前端设计主体 |
| 边缘服务端（Edge） | Worker 应用 | Hono + TSX + D1 | 同时承担前台渲染、后台 API、静态资源托管 |

架构文档中的「请求期渲染」指的是读者端；下文凡称「前端架构」，若无特别说明均指 **Studio**。

### 1.2 选型的基本原则

依据既有工程准则，选型遵循四条优先级：

1. **优先复用既有认知与资产**：Bloath 已验证的技术栈优先，降低学习与迁移成本
2. **优先简单**：能满足需求的最简方案优先，不引入与既有方案功能重叠的依赖
3. **契约优先**：前后端共享类型的能力作为重要权重，服务于「契约单一化」目标
4. **可回退**：每个选型应有替代路径，不形成无解的技术锁定

---

## 2. 技术栈总览

| 层 | 关注点 | 选型 | 替代方案 | 理由摘要 |
|----|--------|------|---------|---------|
| 边缘 | 运行时 | Cloudflare Workers | Deno Deploy / Vercel Edge | 免服务器；与既有 Bloath 经验一致 |
| 边缘 | 框架 | Hono | itty-router / 原生 fetch | 轻量；原生 JSX 支持，与主题方案契合 |
| 边缘 | 数据库 | D1（SQLite） | Turso / Supabase | serverless；与 Workers 同平台无跨网延迟 |
| 边缘 | 契约 | zod | valibot / arktype | 运行时校验与类型推导一体；已被 Bloath 验证 |
| 边缘 | Markdown | markdown-it | remark / marked | 边缘可运行；插件生态成熟 |
| 边缘 | 模板 | Hono JSX | eta / 模板字符串 | 类型安全；与 studio 共享类型 |
| 前端 | 框架 | React 19 | Vue / Svelte | 既有能力；编辑器生态与集成经验可复用 |
| 前端 | 构建 | Vite | Rspack / esbuild | 既有技术栈；HMR 与生态成熟 |
| 前端 | 样式 | Tailwind 4 | CSS Modules / vanilla-extract | 既有技术栈；与设计系统贴合 |
| 前端 | 路由 | React Router 7 | TanStack Router | 沿用；路由数量有限，类型安全收益不显著 |
| 前端 | 服务端状态 | TanStack Query | SWR | mutation 能力完善，契合 CRUD 密集场景 |
| 前端 | 客户端状态 | Zustand（轻量） | Context / Jotai | 无 Provider 嵌套；避免 Context 的全树重渲染 |
| 前端 | 表单 | React Hook Form + zod | TanStack Form / 自研 | 与 content-model 的 zod schema 直接复用 |
| 前端 | 编辑器 | Vditor | OverType / CodeMirror | 长文编辑能力完整；既有集成经验 |
| 前端 | 图标 | lucide-react | 自绘 SVG | 既有依赖；风格克制 |
| 工程 | 包管理 | pnpm workspace | npm workspaces | 严格依赖隔离；workspace 协议清晰 |
| 工程 | 测试 | Vitest | node --test | 支持 Worker 真实运行时与 DOM 测试 |
| 工程 | 代码质量 | ESLint + Prettier | Biome | 生态成熟；既有配置可迁移 |
| 工程 | Git 钩子 | husky + lint-staged | simple-git-hooks | 社区标准 |

**明确不引入**：axios（fetch 足够）、Redux（状态复杂度不需要）、组件库（自研 UI 更贴合既定视觉语言）、ORM（D1 的 SQL 已足够直接）。

---

## 3. 后端技术栈

### 3.1 运行时与框架

**Cloudflare Workers + Hono**

选 Workers 的理由在架构文档中已论述（免服务器、D1 同平台无跨网延迟）。框架选 Hono 而非其他：

- **原生 JSX**：Hono 内置 JSX 转译支持，主题的 TSX 不需要额外引入 React 或预编译管线
- **中间件模型清晰**：`app.use()` 的链式设计让鉴权、CORS、错误处理能统一挂载——这直接对治 Bloath 中「`requireAuth` 中间件存在但被绕开、鉴权样板手写 22 处」的问题
- **体积可控**：核心体积小，适合 Worker 的包体积约束
- **既有经验**：Bloath 已用 Hono 4，路由与中间件写法可直接迁移

`itty-router` 更轻但缺少中间件与 JSX 支持；原生 fetch 则需要自建路由与中间件，不符合「优先复用」。

### 3.2 数据访问

**D1 + 手写 SQL（不引入 ORM）**

理由：

- D1 是 SQLite 语义，SQL 表达能力完整，而博客场景的查询并不复杂
- 引入 ORM 会带来：额外依赖体积、学习成本、生成代码的调试困难，以及与本项目「查询逻辑透明」的诉求冲突
- 但需要配套约定以避免 Bloath 中出现过的样板增殖（见 8.1）

约定：

- 所有查询封装在 `services/*` 中，路由层不直接写 SQL
- 涉及多语句写入的场景使用 `db.batch()` 保证原子性
- 查询语句集中定义，便于审查与复用

### 3.3 契约与校验

**zod**

`content-model` 包以 zod schema 为单一真相，承担四项职责：TypeScript 类型推导、后台表单生成、写接口校验、渲染上下文类型。选 zod 而非 valibot 的理由是生态成熟度与既有使用经验。

### 3.4 配置与密钥

- 敏感项通过 `wrangler secret` 注入（会话签名密钥、GitHub Token、邮件服务凭据）
- 本地开发使用 `.dev.vars`，且该文件必须进入 `.gitignore`
- 非敏感的站点默认值可放在 `wrangler.jsonc` 的 `vars` 中

需吸取的教训：Bloath 的根 `.env` 中存在三个代码零引用的变量（GATEWAY_TOKEN / ADMIN_TOKEN / TALLY_TOKEN），且 `email.service.ts` 中硬编码了回退域名。新项目约定：**环境变量在 `env.ts` 中集中声明类型，未声明的读取应导致类型错误**。

---

## 4. 前端技术栈

### 4.1 框架：React 19

候选与权衡：

| 方案 | 优势 | 劣势 |
|------|------|------|
| **React 19** | 既有能力；编辑器（Vditor/OverType）与表单生态经验可复用；TanStack 全家桶支持完善 | 体积大于 Svelte/Solid |
| Vue 3 | Halo 的管理端用 Vue，可参考其交互设计 | 需要重建既有组件的认知与经验 |
| Svelte 5 | 编译期优化，运行时体积小 | 生态与既有资产不匹配；编辑器集成需重新摸索 |

选择 React 的决定性因素是**既有资产的复用**——Bloath 的编辑器集成、schema 表单、媒体选择器等组件可在重构后继续使用；换框架则这些全部归零。

### 4.2 状态管理（重点）

先厘清现状问题。Bloath 当前用 5 个 Context（Auth / Buffer / Collections / Repo / Toast），暴露出的问题有三：

1. **服务端状态与客户端状态混为一谈**：`RepoContext` 同时持有「当前选中的仓库」（客户端状态）与「仓库列表」（服务端状态），导致缓存放错地方、失效逻辑手工维护
2. **Context 的性能代价**：Context 值变化会触发全部消费者重渲染，在列表页与编辑器同屏时尤其明显
3. **绕开既有抽象**：`http.ts` 已有统一客户端，但 `api.ts` 另写一套 `apiFetch`，六个业务函数还各自手包 `AbortController + setTimeout`

**推荐方案：服务端状态交给 TanStack Query，客户端状态用 Zustand（或就地 useState）**

#### 4.2.1 服务端状态 → TanStack Query

后台 SPA 的数据绝大多数是服务端状态：文章列表、文章详情、评论、说说、设置、镜像状态。这类状态的共性是：需要缓存、需要失效、需要加载与错误状态、需要重试、写操作后需要刷新。

手写这些逻辑的成本很高，且 Bloath 已经证明容易写歪。TanStack Query 直接覆盖：

```ts
// 列表查询：缓存、分页、筛选天然由 queryKey 驱动
const { data, isLoading } = useQuery({
  queryKey: ['posts', { page, status, keyword }],
  queryFn: () => api.posts.list({ page, status, keyword }),
})

// 写操作后精确失效，列表自动刷新
const mutation = useMutation({
  mutationFn: (input: PostInput) => api.posts.update(id, input),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['posts'] })
    queryClient.invalidateQueries({ queryKey: ['post', id] })
  },
})
```

选 TanStack Query 而非 SWR 的原因：本项目的写操作（mutation）密集——文章的增删改、评论审核、设置保存都属于此类。SWR 的强项在只读数据的缓存与去重，mutation 能力相对薄弱。

#### 4.2.2 客户端状态 → Zustand（按需）

真正属于客户端的状态很少：侧边栏折叠、编辑器偏好、当前选中的筛选项草稿、Toast 队列。

| 方案 | 适用场景 | 判断 |
|------|---------|------|
| 就地 `useState` | 单个组件内的状态 | **首选**，能用就用 |
| `useReducer` | 单页面内的复杂状态机 | 编辑器状态适合 |
| Zustand | 需要跨组件共享且变化频繁 | 仅用于 Toast、全局偏好等 |
| Context | 极少变化且全局可见的配置 | 仅用于主题、当前用户等 |

Zustand 相对 Context 的优势在于：无 Provider 嵌套、按选择器订阅（避免全树重渲染）、可在组件外访问。但**不建议把所有状态都放进 store**——Zustand 的价值在于解决共享，而非替代局部 state。滥用 store 会让状态来源变得难以追踪。

#### 4.2.3 状态归属的判断规则

```
这份数据是否来自服务端？
├── 是 → TanStack Query 管理（缓存键即 queryKey）
│        写操作用 useMutation + 精确失效
└── 否 → 是否需要跨组件共享？
         ├── 否 → 就地 useState / useReducer
         └── 是 → 变化是否频繁？
                  ├── 频繁 → Zustand
                  └── 极少 → Context
```

这条规则建议写入项目约定，作为新增状态时的判断依据。

### 4.3 路由：React Router 7

候选与权衡：

| 方案 | 优势 | 劣势 |
|------|------|------|
| **React Router 7** | 沿用现有经验；生态成熟；文档完善 | 参数类型需手工标注 |
| TanStack Router | 端到端类型安全的路由参数与搜索参数 | 与 TanStack Query 同族但学习成本增加；生态较新 |

后台路由数量有限（约 12–15 条），且多数是「列表 + 表单」的标准形态。类型安全路由带来的收益，在路由数量有限的场景下不如状态管理明显。选择沿用 React Router，降低迁移与学习成本。

路由结构：

```
/                      仪表盘（概览、镜像状态）
/posts                 文章列表（草稿 / 已发布 / 回收站）
/posts/new             新建文章
/posts/:id             编辑文章
/pages                 独立页面列表
/pages/:id
/moments               说说列表
/moments/:id
/comments              评论审核（待审 / 已通过 / 垃圾）
/taxonomy              分类与标签
/media                 媒体库
/settings              站点设置
/settings/theme        主题设置
/settings/account      账号与安全
```

### 4.4 表单：React Hook Form + zod

现状中 `SchemaFormPanel.tsx` 有 587 行，是一个自研的 schema 驱动表单。问题在于它维护了**第二份字段定义**，与 `shared/types.ts` 中的 `ArticleFrontmatter` 各自演进——这正是契约漂移的来源之一。

新方案让表单定义直接派生自 `content-model`：

```ts
// 单一真相
export const postSchema = z.object({
  title: z.string().min(1).max(120),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  contentMd: z.string(),
  cover: z.string().url().optional(),
  categoryIds: z.array(z.number()),
  tagNames: z.array(z.string()),
  encrypt: z.boolean().default(false),
  encryptPassword: z.string().min(4).optional(),
})

// 表单直接复用同一 schema，字段错误由 zod 提供
const form = useForm({
  resolver: zodResolver(postSchema),
  defaultValues: postDefaults,
})
```

字段的渲染元数据（标签、控件类型、分组、提示文案）仍在 `content-model` 中声明，但**校验规则只写一次**。这解决了「校验规则在后台表单与后端接口各写一份」的问题。

字段元数据的形态：

```ts
export const postFields: FieldMeta[] = [
  { name: 'title',  label: '标题', control: 'text',  group: 'basic', required: true },
  { name: 'slug',   label: '路径', control: 'slug',  group: 'basic', required: true },
  { name: 'cover',  label: '封面', control: 'image', group: 'basic' },
  { name: 'contentMd', label: '正文', control: 'markdown', group: 'basic', required: true },
  { name: 'encrypt', label: '加密', control: 'boolean', group: 'advanced' },
  { name: 'encryptPassword', label: '密码', control: 'password', group: 'advanced',
    showWhen: { field: 'encrypt', equals: true } },
]
```

`FieldMeta` 保留 `showWhen` 这类条件显示能力（Bloath 已有此设计，可沿用）。

### 4.5 编辑器

| 场景 | 选型 | 理由 |
|------|------|------|
| 文章正文 | Vditor | 长文编辑需要分屏预览、快捷键、工具栏、图片/附件上传；Bloath 已有集成 |
| 说说正文 | Vditor（简配）或纯文本域 | 说说以短文本为主，可复用同一编辑器但隐藏部分工具栏 |
| 评论输入 | OverType | 现状留言板与说说行内评论均使用，且是自研项目，体验可控 |

**Vditor 必须动态导入**。它是本项目中体积最大的前端依赖，且只在编辑页面需要：

```ts
const VditorEditor = lazy(() => import('./VditorEditor'))
```

这同时符合「重型组件按需加载」的工程约定，避免编辑器体积计入首屏。

### 4.6 样式与视觉

沿用 Tailwind 4，与既有技术栈一致。视觉层面遵循既定偏好：中性灰白基调、拒绝套路化的蓝紫科技感、从产品语义（书写与阅读）推导视觉语言。

后台界面的设计取向建议参照既有的 Flore Mail 与 WinUI / Fluent 风格倾向——克制的边框、清晰的层次、不过度使用阴影与渐变。

---

## 5. 前端架构设计

### 5.1 分层

```
┌─────────────────────────────────────────────┐
│  页面层  pages/        路由入口，组合布局与业务组件  │
├─────────────────────────────────────────────┤
│  业务组件层  features/  领域内聚（文章、评论、媒体…） │
├─────────────────────────────────────────────┤
│  通用组件层  components/ui/  无业务语义的基础组件   │
├─────────────────────────────────────────────┤
│  数据访问层  api/       端点函数 + TanStack Query hooks │
├─────────────────────────────────────────────┤
│  基础设施层  lib/       http 客户端、工具、常量      │
└─────────────────────────────────────────────┘
```

依赖方向自上而下单向。**通用组件层不得引用业务层**——这是组件可复用的前提，也是 Bloath 中 `components/ui` 与业务逻辑纠缠所反映的教训。

### 5.2 目录结构

```
apps/studio/
├── src/
│   ├── main.tsx                   应用入口
│   ├── App.tsx                    路由表 + Provider 组装
│   ├── pages/                     页面（路由级组件，只做组合）
│   │   ├── DashboardPage.tsx
│   │   ├── PostListPage.tsx
│   │   ├── PostEditPage.tsx
│   │   ├── CommentAuditPage.tsx
│   │   └── ...
│   ├── features/                  按领域内聚的业务模块
│   │   ├── post/
│   │   │   ├── PostForm.tsx
│   │   │   ├── PostList.tsx
│   │   │   ├── usePostForm.ts
│   │   │   └── constants.ts
│   │   ├── comment/
│   │   ├── moment/
│   │   ├── media/
│   │   └── settings/
│   ├── components/
│   │   ├── ui/                    无业务语义的基础组件
│   │   │   ├── Button.tsx
│   │   │   ├── Dialog.tsx
│   │   │   ├── Toast.tsx
│   │   │   ├── Table.tsx
│   │   │   ├── Pagination.tsx
│   │   │   ├── EmptyState.tsx
│   │   │   └── ErrorBoundary.tsx
│   │   ├── editor/                编辑器封装
│   │   │   ├── VditorEditor.tsx   （懒加载）
│   │   │   └── OverTypeEditor.tsx
│   │   ├── form/                  schema 驱动表单
│   │   │   ├── SchemaForm.tsx
│   │   │   └── fields/
│   │   └── layout/                布局骨架
│   │       ├── AppShell.tsx
│   │       ├── Sidebar.tsx
│   │       └── Topbar.tsx
│   ├── api/                       数据访问层
│   │   ├── client.ts              统一 HTTP 客户端
│   │   ├── posts.ts               端点函数
│   │   ├── comments.ts
│   │   ├── moments.ts
│   │   ├── media.ts
│   │   ├── settings.ts
│   │   └── queries/               TanStack Query hooks
│   │       ├── usePosts.ts
│   │       └── ...
│   ├── lib/                       基础设施
│   │   ├── format.ts
│   │   ├── constants.ts
│   │   └── env.ts
│   └── styles/
│       └── index.css
├── index.html
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

与 Bloath 现有结构的差异：新增 `features/`（领域内聚，替代扁平的功能散落）、`api/queries/`（集中查询 hooks）。这两处改动直接对应「页面肥胖」与「列表逻辑各自重复实现」两个既有问题。

### 5.3 组件划分原则

**四层组件与其职责边界**

| 层 | 是否含业务语义 | 是否可调用 API | 是否可用路由 | 典型例子 |
|----|--------------|--------------|------------|---------|
| `ui/` | 否 | 否 | 否 | Button、Dialog、Table |
| `editor/`、`form/` | 部分（受控组件） | 否 | 否 | SchemaForm、VditorEditor |
| `features/` | 是 | 通过 hooks | 谨慎 | PostForm、CommentList |
| `pages/` | 是 | 通过 hooks | 是 | PostEditPage |

**组件体积约定**：单文件超过约 300 行时，通常已经混合了多个关注点，建议拆分。这一约定的来历是具体的——Bloath 的 `MessagesPage.tsx` 有 707 行（13 个 useState + 7 个 handler + 440 行 JSX），`DraftsPage.tsx` 600 行。拆分方式不是机械切分，而是按「列表逻辑 / 表单逻辑 / 渲染」三类关注点分离。

**列表逻辑的共享**：Bloath 中 `useFileListPage` 抽象只被 2 个页面使用，其余列表页各自重复实现（错误处理与 toast 行为因此分叉）。新方案中列表页统一采用「查询 hook + 通用列表组件」的组合：

```ts
// features/post/usePostList.ts —— 查询、筛选、分页逻辑内聚
// components/ui/Table.tsx        —— 渲染与交互内聚
// PostListPage 只做两者的连接
```

### 5.4 预览机制（重要设计点）

编辑器需要「所见即所得」，而权威渲染在服务端。两条路径：

| 方案 | 机制 | 优势 | 劣势 |
|------|------|------|------|
| A. 客户端同构渲染 | Studio 引入 renderer 与主题，浏览器内渲染 | 零网络往返，即时 | 主题被打进 SPA 体积；需在客户端重复构造渲染上下文（前后篇、分类、站点配置），易与服务端不一致 |
| **B. 服务端预览 API** | 提交内容 → 服务端渲染 → 返回 HTML → iframe 展示 | 渲染逻辑只存在一份；预览与线上完全一致 | 每次预览有网络往返 |

**推荐 B**。方案 A 的根本问题是「主题与渲染上下文需要在两个环境各实现一遍」，这与「契约单一化」的目标相悖，且构造上下文的成本（查询前后篇、分类名、站点配置）在客户端无法完整复现。

实现方式：

```
编辑器内容变化
    │ debounce 约 600ms
    ▼
POST /api/admin/preview
    { type: 'post', contentMd, meta }
    │
    ▼
服务端复用正式渲染管线（不落库）
    │
    ▼
返回完整 HTML 片段
    │
    ▼
iframe srcdoc 展示（隔离样式，避免主题 CSS 污染后台界面）
```

选择 iframe 而非直接注入 DOM 的理由：主题的 CSS（衬线字体、纸纹理、侧边栏布局）会与后台管理界面互相污染。iframe 天然隔离，且能真实反映主题在浏览器中的呈现。

### 5.5 错误处理与边界

三层防护：

| 层级 | 手段 | 覆盖场景 |
|------|------|---------|
| 请求层 | HTTP 客户端统一规范化错误 | 网络失败、超时、401、信封错误 |
| 查询层 | TanStack Query 的重试与错误状态 | 瞬时故障自动重试；持续失败展示错误态 |
| 渲染层 | ErrorBoundary | 组件崩溃不导致整页白屏 |

全局 401 的处理建议从「事件总线」改为「客户端统一拦截」：

```ts
// client.ts 内部
if (res.status === 401) {
  queryClient.clear()            // 清空缓存，避免残留数据
  window.location.href = '/admin/login'
  throw new ApiError('AUTH_REQUIRED', '登录已过期')
}
```

Bloath 当前用 `window.dispatchEvent(new CustomEvent('auth:expired'))` 的方式依赖各订阅方正确响应，链路较长且难以追踪。

---

## 6. 前后端协作与数据交互

### 6.1 类型共享

**唯一的契约来源**：`packages/content-model`

```
packages/content-model/
├── src/
│   ├── post.ts          schema + 类型 + 字段元数据
│   ├── moment.ts
│   ├── comment.ts
│   ├── settings.ts
│   └── index.ts
└── package.json         exports 支持子路径
```

消费方式：

```ts
// edge 侧：写入校验
import { postSchema } from '@taiping/content-model/post'
const parsed = postSchema.parse(input)

// studio 侧：表单校验与类型
import { postSchema, type Post } from '@taiping/content-model/post'
```

**约定：使用子路径导入，不通过 barrel 文件全量导入**。原因是 barrel 文件（`index.ts` 里 re-export 全部）会破坏 tree-shaking，使 edge 包体积无谓增大——这在 Worker 的体积约束下尤其需要注意。

`renderer` 包同理，为同构代码，被 edge 与 studio 共同引用。

### 6.2 API 规范

#### 6.2.1 统一响应信封

**只允许一种信封**。这是针对 Bloath「repos 系用 `{success,data,error}`、comment/buffer 系用 `{code,message,data}`，导致前端被迫写双信封兼容逻辑」的直接修正。

```ts
// 成功
{ "ok": true, "data": { ... } }

// 失败
{ "ok": false, "error": { "code": "VALIDATION_FAILED", "message": "标题不能为空", "details": [...] } }
```

对应的 TypeScript 类型放在 content-model 中，前后端共用：

```ts
export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError }

export interface ApiError {
  code: ApiErrorCode
  message: string
  details?: unknown
}
```

#### 6.2.2 错误码

使用字符串枚举而非裸数字，便于阅读与前端分支：

| 错误码 | HTTP | 含义 |
|--------|------|------|
| `AUTH_REQUIRED` | 401 | 未登录或会话过期 |
| `AUTH_INVALID` | 401 | 凭据无效 |
| `FORBIDDEN` | 403 | 无权限 |
| `NOT_FOUND` | 404 | 资源不存在 |
| `VALIDATION_FAILED` | 422 | 契约校验失败，`details` 含字段错误 |
| `CONFLICT` | 409 | 唯一性冲突（如 slug 重复） |
| `RATE_LIMITED` | 429 | 请求过频 |
| `INTERNAL` | 500 | 服务端错误 |
| `MIRROR_PENDING` | 200 | 非错误：内容已生效但镜像未完成 |

`VALIDATION_FAILED` 的 `details` 直接携带 zod 的错误数组，前端可映射到表单字段。

#### 6.2.3 路由命名

```
# 公开接口
GET    /api/search                      搜索
POST   /api/comments                    提交评论
POST   /api/unlock/:slug                校验文章密码

# 管理接口（全部需要鉴权）
GET    /api/admin/posts                 列表（支持筛选与分页）
POST   /api/admin/posts                 新建
GET    /api/admin/posts/:id             详情
PATCH  /api/admin/posts/:id             更新
DELETE /api/admin/posts/:id             删除
POST   /api/admin/posts/:id/publish     发布
POST   /api/admin/posts/:id/unpublish   撤下

GET    /api/admin/comments              评论列表（含待审）
PATCH  /api/admin/comments/:id          审核（approve / spam / delete）

POST   /api/admin/media                 上传媒体
DELETE /api/admin/media/:id             删除

GET    /api/admin/settings              读取设置
PATCH  /api/admin/settings              保存设置

POST   /api/admin/preview               渲染预览

GET    /api/admin/mirror/status         镜像队列状态
POST   /api/admin/mirror/retry          手动触发重试
```

约定：管理接口统一挂在 `/api/admin/*` 下，鉴权中间件对该前缀一次性挂载，**不允许在单个路由内手写鉴权**。

#### 6.2.4 分页

请求：

```
GET /api/admin/posts?page=1&pageSize=20&status=draft&q=关键词
```

响应：

```json
{
  "ok": true,
  "data": {
    "items": [ ... ],
    "total": 128,
    "page": 1,
    "pageSize": 20
  }
}
```

不使用游标分页——博客内容量有限，页码分页在后台界面中交互更直观（可直接跳页）。

### 6.3 鉴权与会话

**方案：Cookie + 服务端会话**

由于后台 SPA 与 API 部署在同一 Worker（同域），无需处理跨域与 Token 存储问题：

| 项 | 设计 |
|----|------|
| 会话存储 | D1 表或 KV，记录 session id、设备指纹、过期时间 |
| Cookie 属性 | `HttpOnly`、`Secure`、`SameSite=Lax`、`Path=/` |
| 续期策略 | 受信设备 7 天，普通会话 6 小时（沿用 Bloath 的既有设计） |
| CSRF 防护 | 同域 + `SameSite=Lax` 已覆盖大部分场景；保留 `X-Requested-With` 校验作为补充 |
| 登录方式 | 账号口令（首选，简单）；GitHub OAuth（可选，架构文档待决策项） |

**不用 JWT 的理由**：同域单应用，JWT 的无状态优势用不上，反而带来「无法主动失效」的问题（撤销设备需要额外黑名单机制）。服务端会话在 D1/KV 中可即时撤销，与「设备管理」功能自然契合。

### 6.4 数据交互时序

#### 6.4.1 后台读取列表

```
PostListPage 挂载
    │
    ▼
useQuery({ queryKey: ['posts', { page, status, q }] })
    │
    ├── 命中缓存 → 立即渲染（后台静默刷新）
    └── 未命中 → GET /api/admin/posts → 渲染
    │
    ▼
切换分页 / 筛选 → queryKey 变化 → 新查询（旧数据保留，避免闪烁）
```

#### 6.4.2 后台写入

```
用户提交表单
    │
    ▼
zodResolver 本地校验（即时反馈，非权威）
    │
    ▼
useMutation → PATCH /api/admin/posts/:id
    │
    ▼
服务端权威校验 → 写入 D1 → 入队镜像任务
    │
    ├── 校验失败 → 422 + details → 映射到表单字段错误
    ├── 冲突    → 409 → 提示 slug 重复
    └── 成功    → invalidateQueries(['posts']) 与 ['post', id]
    │
    ▼
列表与详情自动刷新；镜像状态单独轮询
```

#### 6.4.3 读者端评论提交

```
访客提交留言
    │
    ▼
POST /api/comments（公开接口，带频率限制与反垃圾）
    │
    ▼
写入 D1，status = pending
    │
    ▼
返回「已提交，待审核」
    │
    ▼
前端本地插入一条「待审核」样式的条目（乐观反馈）
    │
    ▼
审核通过后，下次页面加载时出现在「精选留言」中
```

注意：读者端**不调用管理 API**，也不做数据预取。评论提交是一次性动作，提交后即时反馈即可，无需引入 TanStack Query 到读者端脚本中。

#### 6.4.4 预览

见 5.4。要点是复用服务端渲染管线，通过 `POST /api/admin/preview` 获取 HTML，在 iframe 中展示。

### 6.5 前后端职责对照

| 能力 | Studio（SPA） | Edge（Worker） | 说明 |
|------|--------------|---------------|------|
| 表单即时校验 | 拥有 | — | 使用同一 zod schema，但仅作体验优化 |
| 权威校验 | — | 拥有 | 拒绝不合格写入 |
| 页面渲染 | 不参与 | 拥有 | 出站 HTML 唯一来源 |
| 预览渲染 | 展示 iframe | 拥有 | 复用正式渲染管线 |
| 查询缓存 | 拥有 | — | TanStack Query 管理 |
| 数据一致性 | — | 拥有 | 数据库为唯一写入点 |
| 会话与鉴权 | 持有凭据 | 权威校验 | Cookie 由服务端签发 |
| 图片压缩 | 可选（前端预压缩） | 权威处理 | 前端压缩仅减少上传量 |

---

## 7. 工程化方案

### 7.1 Monorepo 结构

```
taiping_blog/
├── pnpm-workspace.yaml
├── package.json                 根级脚本与共享开发依赖
├── tsconfig.base.json           共享 TS 配置
├── packages/
│   ├── content-model/           zod schema 与类型派生
│   ├── renderer/                markdown 管线与派生数据（同构）
│   └── shared-utils/            通用工具（日期、字符串、slug）
├── themes/
│   └── zhuosu/                  主题 TSX 实现
├── apps/
│   ├── edge/                    Worker 应用
│   └── studio/                  后台 SPA
└── docs/
```

**包管理选 pnpm 的理由**：

- `workspace:*` 协议让内部依赖关系显式，避免误从 registry 拉取同名包
- 严格的 node_modules 结构避免幽灵依赖（npm 的扁平化结构容易让代码引用未声明的依赖，在 monorepo 中尤其危险）
- 内容寻址存储节省磁盘

若倾向零迁移成本，npm workspaces 也能满足需求，但需要自行注意幽灵依赖问题。

### 7.2 构建流程

| 产物 | 工具 | 说明 |
|------|------|------|
| `packages/*` | 不预编译 | 直接以 TS 源码被消费，由消费方转译，减少构建步骤与产物同步问题 |
| `apps/edge` | wrangler（内置 esbuild） | 打包 Worker；JSX 通过 `jsxImportSource: 'hono/jsx'` 转译 |
| `themes/zhuosu` | 随 edge 打包 | 作为 edge 的依赖参与构建 |
| `apps/studio` | Vite | 输出静态资源，作为 Worker 的静态资源托管 |

studio 的构建产物通过 Cloudflare Workers 的静态资源配置托管，与 API 同域，因此**无需 CORS 配置**。这消除了 Bloath 中 `CORS_ORIGIN`、`isAllowedFrontendUrl`、`X-Frontend-Url` 那一整套跨域协商逻辑。

根级脚本建议：

```json
{
  "scripts": {
    "dev": "concurrently \"pnpm -F edge dev\" \"pnpm -F studio dev\"",
    "build": "pnpm -F studio build && pnpm -F edge build",
    "deploy": "pnpm build && pnpm -F edge deploy",
    "typecheck": "pnpm -r typecheck",
    "lint": "eslint .",
    "format": "prettier --write .",
    "test": "pnpm -r test"
  }
}
```

### 7.3 代码质量

| 项 | 方案 | 说明 |
|----|------|------|
| 类型检查 | `tsc --noEmit` | 各包独立配置，根级聚合执行 |
| Lint | ESLint（flat config） | 沿用 Bloath 的配置基础，补充 monorepo 相关规则 |
| 格式化 | Prettier | Bloath 缺失此项，建议补上，避免格式分歧 |
| Git 钩子 | husky + lint-staged | 提交前对暂存文件执行 lint 与格式化 |
| 提交信息 | 约定式提交（可选） | 单人项目可放宽，但保留基本规范 |

`tsconfig` 的关键配置：

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,    // 数组索引访问返回 T | undefined
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true,
    "jsx": "react-jsx",
    "jsxImportSource": "hono/jsx"        // edge 侧
  }
}
```

### 7.4 测试策略

**从零覆盖不现实，也不必要。按风险排序投入**：

| 优先级 | 对象 | 工具 | 理由 |
|--------|------|------|------|
| P0 | `content-model` 的 schema | Vitest | 契约是地基，schema 出错影响面最大 |
| P0 | `renderer` 的纯函数 | Vitest | markdown 管线、阅读时长、摘要生成；纯函数易测 |
| P1 | `services/*` 的业务逻辑 | Vitest + `@cloudflare/vitest-pool-workers` | 在真实 Workers 运行时中测试，避免 mock 失真 |
| P1 | 关键路径集成 | Vitest | 发布链路、加密解锁链路、评论审核 |
| P2 | Studio 组件 | Vitest + happy-dom | 仅覆盖复杂交互组件（SchemaForm、编辑器） |
| P3 | UI 快照 | — | 收益低，不做 |

**不追求覆盖率数字**。Bloath 的现状是 23 个 lib 模块中仅 2 个有测试（约 9%），且 CI 只跑 typecheck。新项目的目标是「关键模块有测试、CI 有门禁」，而非全面覆盖。

### 7.5 CI

```
on: push / pull_request

jobs:
  verify:
    - pnpm install
    - pnpm lint
    - pnpm typecheck
    - pnpm test
    - pnpm build          # 构建失败也应阻断
```

相对于 Bloath 的改进：从「仅 typecheck」扩展为「lint + typecheck + test + build」四道门禁。

部署单独设 workflow，由 tag 或手动触发，与验证流程解耦。

### 7.6 环境变量

```
apps/edge/
├── .dev.vars              本地开发（gitignore）
├── .dev.vars.example      示例（入库）
└── src/env.ts             集中声明类型

apps/studio/
├── .env.development
└── src/lib/env.ts
```

`env.ts` 的作用是让「读取未声明的变量」成为类型错误：

```ts
export interface Env {
  DB: D1Database
  MEDIA: R2Bucket
  SESSION_SECRET: string
  GITHUB_TOKEN: string
  SITE_URL: string
}
```

---

## 8. 既有技术债的规避约定

本节把 Bloath 评审中发现的问题转化为新项目的明文约定，避免重蹈。

| 编号 | 约定 | 针对的既有问题 |
|------|------|--------------|
| 1 | **统一 HTTP 客户端，禁止绕开** | `http.ts` 已有 `requestJson`，但 `api.ts` 另写 `apiFetch`，六个函数还各自手包超时 |
| 2 | **只允许一种响应信封** | repos 系与 comment 系双信封并存，前端被迫写兼容层 |
| 3 | **鉴权中间件按前缀统一挂载** | `requireAuth` 存在但零使用，鉴权样板手写 22 处 |
| 4 | **路由层只做编排，业务逻辑进 services** | `routes/inbound.ts` 在路由内直连第三方 API 并完成落库 |
| 5 | **页面文件超过约 300 行即拆分** | `MessagesPage` 707 行、`DraftsPage` 600 行 |
| 6 | **列表逻辑统一走共享组合（查询 hook + 通用组件）** | `useFileListPage` 仅 2 页使用，其余各自实现导致行为分叉 |
| 7 | **重型依赖动态导入** | Vditor 体积大，不应计入首屏 |
| 8 | **内部包使用子路径导入，不建 barrel** | barrel 破坏 tree-shaking，增大 edge 包体积 |
| 9 | **环境变量集中声明，未声明即类型错误** | `.env` 中存在三个零引用变量 |
| 10 | **删除死代码，不留「可能有用」的模块** | `comment/utils/sanitizer.ts` 的 `sanitizeInput` 全仓零调用 |

---

## 9. 关键技术决策汇总

| 决策 | 选择 | 主要理由 | 主要代价 |
|------|------|---------|---------|
| 前端框架 | React 19 | 既有资产与经验可复用 | 运行时体积大于 Svelte |
| 服务端状态 | TanStack Query | 覆盖缓存、失效、重试、mutation | 引入一个中等体积依赖 |
| 客户端状态 | 就地 state 优先，Zustand 按需 | 避免 Context 全树重渲染与 Provider 嵌套 | 需要遵守状态归属判断规则 |
| 路由 | React Router 7 | 沿用；路由数量有限 | 无端到端类型安全 |
| 表单 | React Hook Form + zod | 与 content-model 共用校验规则 | 需改造既有 SchemaFormPanel |
| HTTP 客户端 | fetch + 薄封装 | 需求简单；避免 axios 体积 | 需自行维护错误规范化 |
| 预览 | 服务端预览 API | 渲染逻辑单份；所见即所得 | 每次预览有网络往返 |
| 鉴权 | Cookie + 服务端会话 | 同域；可即时撤销 | 需要服务端会话存储 |
| 包管理 | pnpm workspace | 严格依赖隔离 | 与 Bloath 的 npm 习惯不同 |
| 测试 | Vitest | Worker 真实运行时 + DOM 支持 | 需配置 vitest-pool-workers |
| 后端框架 | Hono | JSX 支持；中间件模型清晰 | 生态小于 Express |

---

## 10. 待验证事项

在动手前建议实测，避免方案建立在不牢靠的假设上：

1. **Workers 单页渲染耗时**：markdown 渲染 + TSX 求值 + D1 查询的合计耗时，与免费额度 CPU 限制对照。这是最影响架构细节的一项
2. **Hono JSX 的构建产物体积**：与 studio 共用构建链时的包体积表现
3. **`@cloudflare/vitest-pool-workers` 的可用性**：确认当前 wrangler 版本下的配置方式
4. **Worker 静态资源托管的配置方式**：确认 studio 构建产物与 `/api/*` 路由的优先级关系
5. **Vditor 与 OverType 的实际体积**：决定是否需要进一步拆分懒加载粒度
6. **D1 的查询性能**：列表页含 JOIN 与筛选的查询在实际数据量下的表现

---

## 11. 与架构文档的对应关系

| 架构文档章节 | 本文档对应 |
|-------------|-----------|
| L0 数据层 | 3.2 数据访问 |
| L1 契约层 | 6.1 类型共享 |
| L2 渲染层 | 3.1 运行时与框架、5.4 预览机制 |
| L3 路由层 | 6.2 API 规范 |
| L4 客户端层 | 4. 前端技术栈、5. 前端架构设计 |
| 前后端职责边界 | 6.5 前后端职责对照 |
| 演进路线 | 7.2 构建流程、7.5 CI |
