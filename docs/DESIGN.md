# DESIGN.md — 太平后台 Studio

> 设计体系来源：`docs/design-optimization/B端设计优化方案.md`（基于 Ant Design / IBM Carbon / NN-g 规范独立推导）
> Token 唯一来源：`apps/studio/src/styles/tokens.css`
> 本文档是执行约束的固化，改 UI 前先对照。

## 1. Objective

建立单一、可执行的设计体系，消除「各页各画一套」的漂移。核心手段是 **token 单源 + 组件复用 + 明确的反模式清单**。

## 2. Product Context

- 产品：博客后台 `apps/studio`（内容管理：文章 / 页面 / 说说 / 评论 / 图床 / 分类标签 / 主题 / 设置）。
- 受众：站点管理员；高频场景是浏览列表、筛选、轻量编辑与配置。
- 90% 状态：桌面端列表筛选与侧栏导航；移动端底栏 + 底部抽屉/面板为辅。

## 3. Visual Foundations

**唯一来源**：`apps/studio/src/styles/tokens.css`。组件与页面一律引用变量，禁止写死值。

### 3.1 中性色

| Token | Light | 用途 |
|-------|-------|------|
| `--background` | `#f7f7f7` | 页面底色 |
| `--card` | `#ffffff` | 容器表面 |
| `--secondary` | `#fcfcfc` | 次级表面（悬停/嵌套） |
| `--muted` | `#f5f5f5` | 弱化底 |
| `--foreground` | `#2e2e2e` | 主文本 |
| `--muted-foreground` | `#777777` | 次文本（**仅辅助说明，不得作正文**） |
| `--border` / `--border-subtle` | `#e8e8e8` / `#f0f0f0` | 描边 / 弱分割线 |
| `--primary` | `#2e2e2e` | 主色（墨） |

### 3.2 功能色（5 语义位）

| 语义 | 值 | 底色 token |
|------|-----|-----------|
| success | `#3f7d3a` | `--color-success-bg` |
| warning | `#8f6b16` | `--color-warning-bg` |
| error | `#b83a3a` | `--color-error-bg` |
| info / link | `#2c6599` | `--color-info-bg` |

兼容别名 `--state-*`、`--destructive`、`--success`、`--warning`、`--info` 指向上述语义色，供既有引用使用；**新代码请用 `--color-*`**。

### 3.3 排版

| 级别 | 字号 / 行高 | 字重 | 用途 |
|------|------------|------|------|
| display | 20/28 | 600 | 页面主标题 |
| title | 16/24 | 600 | 区块与面板标题 |
| body | 14/22 | 400 | 正文、表格、表单（**基准**） |
| label | 13/20 | 500 | 表单标签、按钮文字 |
| caption | 12/18 | 400 | 辅助说明、时间戳、徽章 |

- 字体：系统栈 `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif`（中文 B 端最优，零加载成本）。
- 字重仅 3 档：400 / 500 / 600。
- 数字统一 `tabular-nums`（表格与统计）。
- **禁止** 10px / 11px / 15px 等越级值。

### 3.4 间距（8px 栅格）

`--space-1` 4 · `--space-2` 8 · `--space-3` 12 · `--space-4` 16 · `--space-5` 20 · `--space-6` 24 · `--space-8` 32

邻近性三档：8px（同一信息单元内）→ 16px（相关字段间）→ 24px（不同区块间）。**禁止任意间距值**。

### 3.5 圆角与阴影

圆角三档：`--radius-sm` 3px（徽章/小按钮/输入框）· `--radius-md`/`--radius` 5px（卡片/面板/按钮）· `--radius-lg` 8px（抽屉/弹窗）· `--radius-full` 药丸。

阴影**仅用于浮层**（抽屉 / 下拉 / 弹窗 / Toast），统一 `--shadow-floating`。**静态卡片不用阴影**，靠 1px 边框划分。

### 3.6 动效

`--duration-fast` 120ms · `--duration-base` 180ms · `--duration-slow` 240ms · `--ease-standard` `cubic-bezier(0.16,1,0.3,1)`。

仅动画 `transform` / `opacity`；全局尊重 `prefers-reduced-motion`。

## 4. Accessibility

- **焦点**：全局 `:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px }`；禁 `outline:none` 无替代。
- **键盘可达**：所有可点元素须可 Tab 到达；列表项若整体可点，用 `role="button"` + `tabIndex={0}` + Enter/Space 处理（按钮嵌套按钮是无效 HTML，故不整体改 `<button>`）。
- **弹层**：`role="dialog"` + `aria-modal` + `Esc` 关闭 + 遮罩点击关闭 + 锁 `body` 滚动 + **焦点陷阱**（`useFocusTrap`）+ 关闭归还焦点。
- **菜单**：`aria-haspopup` + `aria-expanded` + Esc 关闭 + 方向键导航。
- **触控目标**：≥ 36px（移动端 ≥ 44px）。
- **图标按钮**：必须有 `aria-label`。
- **状态不单靠颜色**：徽章必须带文字。
- **对比度**：正文 ≥ 4.5:1，UI 元素 ≥ 3:1。

## 5. Voice & Tone

- 中文、直接、少形容词；列表与按钮文案动作化（添加 / 保存 / 删除）。
- 状态徽章用语义色 + 中文（已发布/草稿/待处理），不单靠颜色区分。
- 错误信息用平实语言说明问题并给出解法（不说技术术语）。

## 6. Implementation Practices

- **颜色一律走 CSS 变量**，组件内禁止写死 hex；新代码用 `--color-*` 而非兼容别名。
- **复用组件**：`Button`（primary/secondary/ghost/danger/link）、`Card`、`Badge`、`Tabs`、`Input`、`Select`、`PageHeader`、`Drawer`、`RowMenu`、`Pagination`、`LoadingState`、`EmptyState`、`ErrorState`、`ConfirmDialog`。
- **状态三件套**：加载用 `LoadingState`（骨架屏优先）、空态用 `EmptyState`（状态提示 + 帮助引导 + 建议动作）、失败用 `ErrorState`（含重试）。
- **确认交互**：危险操作一律用 `await confirmDialog({ title, danger: true })`，**禁止** `window.confirm`。
- **异步失败必须有反馈**：所有 `.then()` 配 `.catch()` 并 toast 提示。
- **文本折行**：功能性元素（按钮/徽章/标签/状态/表头/导航）不折行；仅长文本段落允许折行。空间不足时容器适配或截断，不折行。
- **导航分组**：按用户使用路径而非技术归属。置顶=概览；内容=文章/页面/说说/评论/图床/分类标签；外观=主题；系统=设置。
- **时间**：**存储 UTC，展示与热力图格子按 Asia/Shanghai（UTC+8）日历日**；日历格 key 用 `YYYY-MM-DD` 字符串，禁止对本地 `Date` 再 `toISOString()` 反推格子。
- **分类/标签编辑**：桌面与移动端统一**抽屉**。
- **设置项**：每字段放入 `setting-field`，输入控件统一 `input-base`。
- **响应式**：断点 `max-width: 767px`（移动）/ `min-width: 768px`（桌面），就近声明于所修饰组件旁。

## 7. Anti-Patterns

- 写死 hex 颜色值，或使用 Tailwind 调色板类（`text-red-700` 等）。
- 使用 `text-[10px]`、`15px` 等越级字号。
- 静态卡片加阴影。
- 内联魔数（`borderRadius: '12px'`）绕过 token。
- 功能性元素（徽章/按钮/表头）折行。
- `window.confirm` 或任何无确认的危险操作。
- 异步操作无失败反馈。
- 状态只用颜色不用文字。
- 弹层无焦点陷阱、不可 Esc 关闭。
- 触控目标 < 36px。
- 自定义细滚动条与系统滚动条混用。
- 筛选 Tabs 底部分割线与卡片底边双线。
- 热力图用 UTC 切片或 `toISOString` 反推导致「今天」错日。
- 蓝紫渐变主视觉、emoji 装饰。
- **`!important` 铺样式**——豁免范围仅限编辑器第三方样式补丁段（`.overtype-*`）与覆盖内联 `style` 的场景。

## 8. Decision-Making

| 决策 | 选择 | 理由 |
|------|------|------|
| 设计基准来源 | 外部规范独立推导，非继承现有代码 | 现有两套 token 互相冲突，取其一只是固化错误 |
| Token 架构 | 单源 `tokens.css` + Tailwind 配置引用变量 | 消除三处颜色定义冲突 |
| 概览导航 | 侧栏独立置顶（无分组标题） | 首页入口优先 |
| 滚动条 | 原生系统滚动条 | 减少 CSS 覆盖面 |
| 分类编辑 | 仅抽屉，无详情栏 | 消灭双栏空置；移动端一致 |
| 热力图时区 | DB UTC → 展示上海 | 多端一致；本地时钟漂移不污染格子 |
| 确认交互 | 自建 `ConfirmDialog` 替代 `window.confirm` | 原生 confirm 观感生硬、不可定制 |
| 断点位置 | 各 `@media` 就近声明，不集中合并 | 就近可读性更佳，合并会改变规则顺序有覆盖风险 |
| 表格整体可点行 | `role="button"` 而非改 `<button>` | 行内含按钮，button 嵌套 button 是无效 HTML |

## 9. Workflow

1. 改 UI 前对照本文件与 `docs/design-optimization/B端设计优化方案.md`。
2. 页面级改动按：布局 → 交互 → 样式 token → 边界（空态/错误态/移动端）。
3. 涉及时间展示先过上海时区工具函数。
4. 涉及危险操作先接 `confirmDialog`。
5. 交付前：`pnpm typecheck` + `pnpm -F @taiping/studio build`；后端若动 API 则跑 edge 相关 test。

## 10. 已知遗留（有意保留）

| 项 | 现状 | 原因 |
|----|------|------|
| `!important` 约 79 处 | 保留 | 多数用于覆盖内联 `style`（如 `MomentListPage` 的 `display:none`、弹层的内联 `display`）或第三方编辑器样式；清理需先消除内联样式，风险大于收益 |
| 暗色模式 | token 层未定义 `.dark` | 当前无切换入口，需要时按 `--color-*` 结构补 |
| 断点分散 9 处 | 保留 | 就近声明，无重复选择器 |
