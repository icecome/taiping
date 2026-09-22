# Studio 管理后台滚动条审查报告与设计规范

> 范围：`apps/studio` 管理后台（不含博客前台主题与 `taiping-admin-design` 设计稿）  
> 交付：场景盘点 + 合理性评估 + 原生/自定义选型 + 统一设计标准  
> 技术倾向（已确认）：优先 CSS 轻量样式化，暂不引入 JS 自定义滚动条库  
> 说明：文中建议均基于当前代码与后台使用场景推导，落地时可按实际体验微调。

---

## 1. 审查范围与方法

| 项 | 说明 |
|----|------|
| 代码范围 | `apps/studio/src/**`（页面、布局、UI 组件、全局样式） |
| 依赖参考 | `vendor/overtypeplus`（编辑器内部滚动行为） |
| 排除项 | `themes/zhuosu` 前台、`taiping-admin-design` 原型 HTML |
| 方法 | 静态扫描 `overflow-*` / `scrollbar-*` / `studio-scroll` / `no-scrollbar` / `editor-scrollport`，对照页面结构与交互意图逐点评估 |

**现有滚动相关设计资产（源码事实）：**

| 资产 | 位置 | 作用 |
|------|------|------|
| `--scroll-thumb` / `--scroll-thumb-hover` | `index.css` | 滑块颜色 token（中性墨色半透明） |
| `.studio-scroll` | `index.css:85-88` | 兼容历史 class，当前刻意保持 `scrollbar-width: auto`（偏原生） |
| `.no-scrollbar` | `index.css:90-96` | 隐藏滚动条（webkit + 标准属性） |
| `.editor-scrollport` | `index.css:742-753` | 编辑区滚动口；webkit 滑块 6px + token 色 |
| `html/body` `overflow: hidden` | `index.css:54` | 外壳锁定，页面滚动下沉到内容层 |
| `.tabs-row` + `no-scrollbar` | `index.css:223-225` | 横向标签条隐藏滚动条 |
| OverType vendor | `overtypeplus` 样式 | 工具栏 thin 滚动条、正文 autoResize 时的 overflow 策略 |

---

## 2. 滚动条场景全量清单

按「谁在滚、为什么滚」分类，共 6 类、约 15 处可滚动实例。

### 2.1 外壳与主内容（App Shell）

| ID | 位置 | 代码锚点 | 滚动方向 | 触发条件 | 现状实现 |
|----|------|----------|----------|----------|----------|
| S1 | `html / body / #root` | `index.css:47-55` | — | 恒不滚 | `overflow: hidden`，滚动责任交给内部层 |
| S2 | 主内容 `.admin-inner` | `index.css:483-488` + `AppShell.tsx:134` | 纵向 | 列表/设置等页面超出视口 | `overflow-y: auto`，**未**挂 `studio-scroll`，无自定义样式 |
| S3 | 侧边栏导航 `nav` | `AppShell.tsx:81` | 纵向 | 菜单项过高（低分辨率/放大） | `flex-1 overflow-y-auto`，无自定义样式 |
| S4 | `.admin-main` / `.admin-content` | `index.css:470-482` | — | — | `overflow: hidden`，仅作布局裁剪，本身不滚 |

### 2.2 横向滚动条（工具条 / 表格）

| ID | 位置 | 代码锚点 | 滚动方向 | 触发条件 | 现状实现 |
|----|------|----------|----------|----------|----------|
| H1 | 全局 Tabs 条 `.tabs-row` | `index.css:223-225`，`Tabs.tsx:19` | 横向 | 标签项宽度合计超出容器 | `overflow-x-auto no-scrollbar`，**故意隐藏**滚动条 |
| H2 | 移动端 Tabs `.admin-tabs-row` | `index.css:549-558`，如 `CommentAuditPage.tsx:165` | 横向 | 窄屏标签溢出 | `overflow-x: auto !important` + 若同时带 `tabs-row` 则仍被 `no-scrollbar` 隐藏 |
| H3 | 文章/页面列表表格 | `PostListPage.tsx:164` | 横向 | 桌面表格列过宽（分类长等） | `hidden md:block overflow-x-auto`，纯原生横向滚动条 |

### 2.3 编辑器与元信息侧栏

| ID | 位置 | 代码锚点 | 滚动方向 | 触发条件 | 现状实现 |
|----|------|----------|----------|----------|----------|
| E1 | 文章编辑主滚动口 `.editor-scrollport` | `PostEditPage.tsx:439`，`index.css:742-753` | 纵向 | 正文变长；工具栏 sticky 相对该层 | 同时挂 `studio-scroll` + `editor-scrollport`；webkit 滑块 6px + `--scroll-thumb`；Firefox 仍偏原生宽 |
| E2 | 编辑右侧元信息栏 | `PostEditPage.tsx:217` | 纵向 | 发布/摘要/分类等区块超出侧栏高度 | `overflow-y-auto studio-scroll`（行为=原生） |
| E3 | 移动端元信息底部面板 | `index.css:846-859` | 纵向 | 窄屏底部滑出面板内容溢出 | 面板 `max-height: 60vh` + `overflow-y: auto` |
| E4 | OverType 内部 textarea/preview | vendor `styles.js` / `overtype.js` | 纵向（及工具栏横向） | `maxHeight > 0` 时内部滚；当前 `maxHeight: 0` + `autoResize` 时内部倾向不滚，由 E1 承担 | vendor 强制 `scrollbar-width: auto`；工具栏另有 thin 样式 |
| E5 | Markdown 预览内 `pre` 代码块 | vendor `p2-export`/样式 | 横向（或双向） | 代码行长 | `overflow: auto`，库默认样式 |

### 2.4 浮层：抽屉 / 弹窗 / 底部面板

| ID | 位置 | 代码锚点 | 滚动方向 | 触发条件 | 现状实现 |
|----|------|----------|----------|----------|----------|
| O1 | 通用抽屉 `.drawer-body` | `Drawer.tsx:56`，`index.css:375-379` | 纵向 | 评论详情等长内容 | `flex: 1; overflow-y: auto`；打开时 `body` 锁定 |
| O2 | 评论审核会话区 | `CommentAuditPage.tsx:377` | 纵向 | 会话/留言内容长 | `overflow-y-auto studio-scroll` |
| O3 | 图床选择 MediaPicker 外层 | `MediaPicker.tsx:102` | 纵向+横向 | 弹窗整体高于视口 | 蒙层容器 `overflow-auto`；**未**锁 `body` |
| O4 | 图床文件网格 | `MediaPicker.tsx:141` | 纵向 | 图片列表长 | `max-h-[60vh] overflow-y-auto studio-scroll`（与 O3 可能形成双滚） |
| O5 | 说说撰写底部面板 | `MomentListPage.tsx:1072` | 纵向 | 移动端表单超出 `70vh` | `overflow-y-auto`，无 `studio-scroll` |
| O6 | 说说筛选底部面板 | `MomentListPage.tsx:1135` | 纵向 | 筛选内容超出 `60vh` | 同上 |

### 2.5 列表面板与下拉

| ID | 位置 | 代码锚点 | 滚动方向 | 触发条件 | 现状实现 |
|----|------|----------|----------|----------|----------|
| L1 | 说说时间线 | `MomentListPage.tsx:960` | 纵向 | 时间线条目多 | `flex-1 min-h-0 overflow-y-auto`，无自定义 class；含 sticky 日期头 |
| L2 | 标签选择器下拉 | `TagSelector.tsx:147` | 纵向 | 候选项多于 `max-h-48` | `max-h-48 overflow-y-auto studio-scroll` |
| L3 | 原生 `Select` | `Select.tsx` | 系统弹层 | 选项超出屏幕 | 浏览器/OS 原生下拉滚动 |
| L4 | 行操作菜单 `RowMenu` | `RowMenu.tsx:35` | 目前不滚 | 当前项少；若未来项多可能溢出 | 无 `max-h` / `overflow`，暂无滚动条 |

### 2.6 表单控件内部滚动

| ID | 位置 | 代码锚点 | 滚动方向 | 触发条件 | 现状实现 |
|----|------|----------|----------|----------|----------|
| F1 | 摘要 / 回复 / 说说等 `textarea` | `PostEditPage.tsx:276`，`CommentAuditPage.tsx:402`，`MomentListPage.tsx:472` 等 | 纵向 | 文本超过 `rows` 且 `resize-none` | 控件原生滚动条 |
| F2 | 设置/Schema 表单 textarea | `SettingFields.tsx`，`SchemaForm.tsx:48` | 纵向 | 同上 | 控件原生滚动条 |
| F3 | 卡片 `overflow-hidden` | Taxonomy / Settings / Media 等 | — | — | 圆角裁剪，**不是**滚动场景 |

---

## 3. 现状设计评估

### 3.1 整体架构倾向

Studio 采用「外壳锁定 + 内容层滚动」的 Admin 常见模式：`body` 不滚，主内容在 `.admin-inner`（S2）与各业务滚动口内滚。这一点对固定侧栏、顶栏、移动端底栏较友好，架构上合理。

全局仅定义了中性滚动 token 与三类 class，但实际**风格并不统一**：

| 风格簇 | 实例 | 表现 |
|--------|------|------|
| 刻意原生 | S2、S3、H3、L1、O5/O6、E2（经 `studio-scroll` 仍为 auto） | 系统默认宽度与对比度，Windows 上通常偏重 |
| 局部细条 | E1（`editor-scrollport`） | Chromium 系 6px 细滑块，与 token 一致 |
| 隐藏 | H1/H2（Tabs） | 横向可滚但无视觉提示 |
| 依赖 vendor | E4/E5 | 与 Studio token 无绑定 |

### 3.2 逐场景合理性（摘要）

| 场景 | 视觉 | 交互 | 功能适配 | 综合判断 |
|------|------|------|----------|----------|
| S2 主内容 | 未统一，偏系统默认 | 键盘/滚轮/触控板正常 | 长列表、设置页适配足够 | **合理，样式可收敛** |
| S3 侧边栏 | 未样式化 | 菜单变多时可滚 | 预期低频 | **可接受；建议并入统一 token 样式** |
| H1/H2 Tabs | 隐藏后无「可滑」暗示 | 可滑动但可发现性弱 | 选项极多时（设置分组尚可，筛选 Tabs 一般） | **可讨论：隐藏与可发现性存在张力** |
| H3 表格横向 | 原生横向条较显眼 | 信息完整的必要手段 | 宽表合理 | **功能合理；样式宜统一** |
| E1 编辑滚动口 | 已有细条，但 hover token 未用；跨浏览器不一致 | sticky 工具栏依赖该层，逻辑正确 | 写作场景长文适配 | **方向正确，实现宜补齐** |
| E2/E3 元信息栏 | 偏原生 | 表单侧栏滚动正常 | 元信息密度适中 | **合理；宜与 E1 同一视觉语言** |
| E4 vendor 编辑器内部 | 强制 auto，与 Studio 可能双滚动条 | autoResize 下内部少滚，设计得当 | 当前配置下主滚动在 E1，可接受 | **现阶段可维持；避免与 E1 同时双条** |
| O1/O2 抽屉 | 样式不统一 | body 锁定良好 | 审核阅读场景合理 | **交互合理，样式宜对齐** |
| O3/O4 MediaPicker | 可能双滚动条 | **body 未锁**，蒙层后仍可能滚底层 | 图床列表适配基本够 | **建议处理双滚与 body 锁定一致性** |
| O5/O6 底部面板 | 偏原生 | 场景明确 | 移动端适配合理 | **合理；建议统一 class** |
| L1 时间线 | 无自定义 | sticky 日期头依赖自身滚动口，正确 | 信息流适配好 | **合理；样式宜对齐** |
| L2 TagSelector | 有 `studio-scroll` 名义，实为原生 | 紧凑下拉可用 | 选项多时可用 | **功能可用；紧凑场景更适合细条** |
| L3 原生 Select | 系统样式 | 系统级可靠 | 后台筛选足够 | **建议保持原生，不自绘** |
| F1/F2 textarea | 原生 | `resize-none` + 固定 rows 在长文时滚动必要 | 短文本足够，长文体验一般 | **短字段合理；长正文应走编辑器滚动口** |

### 3.3 主要问题清单（按影响排序）

1. **视觉语言分裂**：仅 E1 有细条样式，S2/L1/O1 等高频内容区仍为系统默认宽度，Windows 桌面后台观感偏「重」。
2. **`studio-scroll` 名实不符**：多处挂了该 class，CSS 注释却写明「不再定制」，维护者容易误解「已统一样式」。
3. **E1 样式不完整**：定义了 `--scroll-thumb-hover` 但未接入；未使用 `scrollbar-color` / Firefox 专用属性；与 vendor 工具栏 thin 样式无 token 对齐。
4. **横向 Tabs 隐藏滚动条**：功能可滚，但缺少 fade/阴影等替代提示，可发现性依赖用户试探。
5. **MediaPicker 双滚与 body 锁定缺失**：与 Drawer/CommentAudit 行为不一致，浮层体验不统一。
6. **滚动容器 class 挂载不完整**：S3、H3、L1、O1、O5、O6 等未挂统一滚动 class，后续无法一处改全局。
7. **RowMenu 暂无溢出策略**：当前项少问题不大，菜单变长时可能出现无 max-h 的溢出（非滚动条样式问题，属布局边界）。

---

## 4. 原生控制 vs 自定义控制：系统性对比

> 本节「自定义」默认指 **CSS 滚动条样式化**（`scrollbar-width/color` + `::-webkit-scrollbar` 等），不含 JS 自绘滚动条。

### 4.1 三档控制深度

| 档位 | 含义 | 典型技术 | 适用 |
|------|------|----------|------|
| A. 系统原生 | 不写样式，浏览器/OS 默认 | 无额外 CSS | 原生 `select` 弹层、对系统一致性要求极高的场景 |
| B. CSS 轻量样式化（**推荐主路径**） | 保留原生滚动逻辑，只调宽度/颜色/圆角/显隐 | `scrollbar-width`、`scrollbar-color`、`::-webkit-scrollbar*` | 内容区、侧栏、抽屉、下拉、编辑滚动口 |
| C. JS 自定义组件 | 自绘轨道/滑块，接管拖拽与虚拟滚动 | SimpleBar / OverlayScrollbars / 自研 | 虚拟列表、需精确控制滚动指示器、复杂嵌套手势仲裁 |

### 4.2 对比结论（面向本项目）

| 维度 | A 原生 | B CSS 轻量 | C JS 自定义 |
|------|--------|------------|-------------|
| 视觉与 Studio 墨色纸感一致 | 弱 | **中～强** | 强 |
| 开发/维护成本 | 低 | **低** | 高 |
| 可访问性 / 键盘 / 触控板 | 系统保障 | **基本保留系统行为** | 需自行补齐 |
| 滚动性能 | 好 | **好** | 一般足够，虚拟列表除外 |
| 跨浏览器一致性 | 低 | **中（需 webkit+标准双写）** | 高 |
| 与现有 admin 壳兼容 | 好 | **好** | 需改 DOM 结构 |
| 与「最小变更 / 简洁优先」原则 | 最好 | **好** | 一般 |

**选型判断（倾向性结论）：**

- 本后台以列表、表单、编辑器为主，**暂未出现必须 JS 接管滚动的场景**（如万行虚拟表格、自定义滚动指示条产品需求）。
- 建议 **全局以 B（CSS 轻量样式化）为主**，对已用原生控件（`select` 下拉）保持 A。
- 建议 **暂不引入 C**；若未来出现虚拟滚动或滚动位置指示器等明确需求，再单点评估。
- 滚动**逻辑**始终建议保持浏览器原生（滚轮、触控板、键盘、惯性），自定义仅限**外观与少量 overflow 策略**。

### 4.3 分场景选型矩阵

| 场景 ID | 场景 | 建议控制方式 | 理由简述 |
|---------|------|--------------|----------|
| S2 | 主内容列表/设置滚动 | **B · 统一 content 样式** | 高频、决定整体观感；保持原生行为 + 统一滑块 |
| S3 | 侧边栏导航 | **B · 与 content 同 token，可更细** | 低频但同属外壳，宜一致 |
| H1/H2 | Tabs 横向 | **B · 隐藏滚动条 + 边缘渐隐提示（可选）** | 保持 `no-scrollbar` 亦可，但建议补可发现性 |
| H3 | 表格横向 | **B · 横向统一样式** | 功能必须可滚；样式与纵向统一 |
| E1 | 编辑滚动口 | **B · compact/thin + token + hover** | 已有方向，补齐 hover 与 Firefox |
| E2/E3 | 元信息侧栏/面板 | **B · 与 E1 同档或略厚** | 同屏并列时不宜粗细突变 |
| E4 | OverType 内部 | **A/B 边界：维持库默认，避免双条** | 当前滚动责任在 E1；强改 vendor 成本高 |
| E5 | 预览代码块 | **B · 细条 + token（Studio 层覆盖即可）** | 代码块场景需要横向滚动可见性 |
| O1/O2 | 抽屉正文 | **B · compact** | 浮层宜轻；与 body 锁定配套 |
| O3/O4 | MediaPicker | **B · 单层滚动 + compact；并统一 body 锁定** | 先消双滚，再谈样式 |
| O5/O6 | 移动端 sheet | **B · compact**；触控场景可不显示滚动条 | 移动端系统滚动条常为 overlay，CSS 影响有限 |
| L1 | 说说时间线 | **B · content** | 长列表阅读，滑块宜安静 |
| L2 | TagSelector 下拉 | **B · compact** | 空间紧，细条更合适 |
| L3 | 原生 Select | **A · 保持原生** | 系统弹层，自绘性价比低 |
| F1/F2 | textarea | **A 或 B·compact（按控件统一）** | 短字段原生即可；若统一视觉可用 compact |
| L4 | RowMenu | 暂无滚动；若扩展则 **B·compact + max-h** | 布局约束优先于滚动条样式 |

---

## 5. 统一滚动条设计标准与实现规范

### 5.1 设计原则

1. **滚动行为优先原生**：滚动、拖拽、键盘、触控板逻辑交给浏览器；自定义集中在视觉与 overflow 策略。
2. **外观从产品气质推导**：Studio 为墨色中性 UI（`#2e2e2e` / `#f7f7f7` / 细边框），滚动条宜「安静、细、半透明」，避免彩色或高对比装饰条。
3. **同一视觉层级同一粗细档**：同屏并列的滚动口（如编辑区与侧栏）粗细档位宜接近，避免一边细条一边系统粗条。
4. **可发现性与克制平衡**：需要横向滚动的工具条，若隐藏滚动条，建议提供边缘渐隐或适度留白暗示；内容型纵向滚动宜始终可见细滑块。
5. **最小实现**：优先 CSS 变量 + 少量工具 class；不引入 JS 滚动库；vendor 能不改则不改。

### 5.2 技术选型规范

| 规则 | 建议 |
|------|------|
| 主路径 | CSS：`scrollbar-width` + `scrollbar-color`（标准）+ `::-webkit-scrollbar` 系列（Chromium/Safari） |
| 禁止（当前阶段） | 为「好看」引入 JS 自定义滚动条组件 |
| 允许 | 浏览器原生 `select`、`textarea` 保持系统默认，或仅套用同一 token class |
| Firefox | 使用 `scrollbar-width: thin`（compact 档）/ `auto`（content 档）+ `scrollbar-color: thumb track` |
| Webkit | `width/height`、`thumb`（border-radius、background）、`track`（透明或极弱）、可选 `:hover` / `:active` |
| 不建议 | 仅写 webkit 而不写标准属性；或 `!important` 满天飞覆盖 vendor（优先选择器权重与层叠位置） |
| vendor 编辑器 | Studio 层对 `.editor-scrollport` 及预览 `pre` 做覆盖即可；避免 fork OverType 只为滚动条 |

### 5.3 Token 规范（建议）

在现有基础上补齐，仍落在 `:root`：

| Token | 建议含义 | 当前值 / 建议 |
|-------|----------|----------------|
| `--scroll-thumb` | 默认滑块 | `rgba(46, 46, 46, 0.22)`（已有） |
| `--scroll-thumb-hover` | 悬停/拖拽滑块 | `rgba(46, 46, 46, 0.36)`（已有，建议接入） |
| `--scroll-track` | 轨道 | 建议 `transparent` 或 `rgba(46, 46, 46, 0.04)` |
| `--scroll-size-compact` | 紧凑档宽度 | 建议 `6px`（与现 editor-scrollport 一致） |
| `--scroll-size-content` | 内容档宽度 | 建议 `8px`～`10px`，或 `auto` + 颜色弱化（二选一，团队定一档） |

暗色若未来引入，建议仅覆盖上述 token，不复制一套 class 结构。

### 5.4 视觉规范（按档位）

| 档位 | 用途 | 宽度倾向 | 滑块 | 轨道 | hover |
|------|------|----------|------|------|-------|
| **compact** | 下拉、抽屉、sheet、编辑滚动口、媒体弹窗、代码块 | 6px | `--scroll-thumb`，圆角 999px | 透明 | 使用 `--scroll-thumb-hover` |
| **content** | 主内容、侧栏、时间线、表格纵向 | 8～10px 或系统宽+弱色 | 同 token，透明度可略高一档 | 透明 | 同 token hover |
| **hidden** | Tabs 等装饰性横向滚动 | — | 不显示 | — | — |

表格横向（H3）建议与 **content** 同色，高度/粗细对齐该档横向规范（webkit `height`）。

### 5.5 交互行为规范

| 行为 | 规范建议 |
|------|----------|
| 滚动链 | 内容区：默认允许链式滚动（当前 OverType 注释亦倾向允许 scroll-through） |
| 浮层 overscroll | Modal/Drawer/Sheet 内部建议评估 `overscroll-behavior: contain`，减少底层联动（移动端需真机验证） |
| body 锁定 | 任何遮罩型浮层打开时锁定 `body` 滚动；关闭时恢复。Drawer/CommentAudit 已有，MediaPicker 等宜对齐 |
| 双滚动口 | 同一交互面尽量只保留一层主滚动（如 MediaPicker 外层撑高、仅网格滚） |
| sticky | sticky 头（时间线日期、编辑工具栏）必须挂在**同一滚动容器**内，避免找错 scrollport |
| 移动端 | 优先系统 overlay 滚动条；`no-scrollbar` 用于横向工具条仍可接受；可补 `-webkit-overflow-scrolling: touch`（已用于 tabs/toolbar） |
| 焦点与键盘 | 不自定义时系统行为已满足；若隐藏滚动条，仍须保证容器可通过键盘滚动（tabindex/原生可滚内容） |
| 动效 | 滚动条本身不建议入场动画；滑块 hover 颜色过渡 ≤150ms 即可 |

### 5.6 命名与 class 约定（建议）

| Class | 职责 | 使用约定 |
|-------|------|----------|
| `.studio-scroll` | **内容档**统一入口 | 所有业务纵向内容滚动口默认挂载；CSS 从「空操作」改为内容档样式 |
| `.studio-scroll-compact`（建议新增） | **紧凑档** | 下拉、抽屉 body、sheet、媒体网格、编辑滚动口可挂此档 |
| `.editor-scrollport` | 编辑区滚动语义 + sticky 布局职责 | 可保留语义 class；视觉上并入 compact，内部调用同一 token/样式块，避免再分叉一套颜色 |
| `.no-scrollbar` | **隐藏档** | 仅用于 Tabs 等横向装饰滚动；新业务慎用 |
| 原生控件 | 不强制挂 class | `select` 弹层保持系统行为 |

实现层面建议：用一份 CSS 放在 `index.css` 的组件层，**一处定义、多处挂载**，避免每个页面手写 overflow 时各自为政。

### 5.7 源码落点建议（规范向，本次不改代码）

| 优先级 | 落点 | 建议 |
|--------|------|------|
| P0 | `index.css` | 扩展 token；重定义 `.studio-scroll` 为 content 档；新增 compact 档；`editor-scrollport` 对齐 compact 并接入 hover |
| P0 | 统一挂载 | S2 `admin-inner`、L1 时间线、S3 侧栏 nav、H3 表格 wrapper 挂 content 或 compact |
| P1 | 浮层 | O1 `.drawer-body`、O5/O6 sheet、O4 MediaPicker 网格挂 compact；MediaPicker 补 body 锁定、消双滚 |
| P1 | 下拉 | L2 TagSelector 挂 compact |
| P2 | Tabs | 保留隐藏或加右缘渐隐提示（设计二选一） |
| P2 | 表单 textarea | 全站统一：要么全原生，要么全 compact，避免半套 |
| P3 | vendor OverType | 仅在 Studio CSS 覆盖预览代码块滚动条；无强需求不改 vendor |
| — | L3 Select | 保持原生，不写自定义滚动 |

### 5.8 验收用例（建议落地时先写再改）

| 用例 | 预期 |
|------|------|
| 文章列表在 1366×768 与 1920×1080 | 主内容可滚；滑块为 content 档，无双滚动条 |
| 侧边栏菜单在缩放 150% | 导航可滚且样式与 content 一致 |
| 文章编辑长文 | 工具栏 sticky 正常；仅 editor-scrollport 出现 compact 滑块；hover 变深 |
| 打开评论抽屉 | body 不可滚；抽屉内 compact 滑块；Esc 可关 |
| 打开图床弹窗 | 仅一层主滚动；关闭后 body 恢复 |
| TagSelector 多选项 | 下拉 max-h 内 compact 滚动，键盘选择不因滚动条跳动 |
| 设置页多 Tab | 横向标签可滑；按选定策略「无滚动条但有暗示」或「细条」 |
| Firefox + Chromium 各测一遍 | 均有可见滑块，宽度档位符合规范，无只有 webkit 才好看的缺口 |

---

## 6. 系统性对比小结

| 问题 | 结论倾向 |
|------|----------|
| 滚动条该原生还是自定义？ | **逻辑原生 + 外观 CSS 轻量自定义** 为主路径 |
| 是否需要 JS 滚动组件？ | 当前场景倾向 **不需要**；虚拟列表等需求出现后再评估 |
| 何时必须隐藏滚动条？ | 仅横向工具条等 **装饰性、短行程** 滚动；内容型滚动不建议隐藏 |
| 何时保持完全原生？ | 系统弹层（`select`）、以及团队明确要求「零样式」的输入控件 |
| 如何统一而不伤可维护性？ | **token + 2～3 档 class + 全站挂载约定**，而不是每页手写 |

---

## 7. 附录：场景速查表

| ID | 简称 | 档位建议 | 控制方式 | 优先级 |
|----|------|----------|----------|--------|
| S2 | 主内容 | content | CSS | P0 |
| S3 | 侧栏导航 | content（可 compact） | CSS | P0 |
| H1/H2 | Tabs 横向 | hidden（+提示） | CSS | P2 |
| H3 | 列表表格横向 | content | CSS | P1 |
| E1 | 编辑滚动口 | compact | CSS（完善现有） | P0 |
| E2/E3 | 元信息栏 | compact | CSS | P1 |
| E4 | OverType 内部 | 保持库行为 | 原生/边界 | P3 |
| E5 | 预览代码块 | compact | CSS 覆盖 | P2 |
| O1/O2 | 抽屉 | compact | CSS | P1 |
| O3/O4 | 图床弹窗 | compact + 单层滚动 | CSS + 交互修正 | P1 |
| O5/O6 | 移动端 sheet | compact | CSS | P1 |
| L1 | 说说时间线 | content | CSS | P0 |
| L2 | 标签下拉 | compact | CSS | P1 |
| L3 | 原生 Select | — | 原生 | — |
| F1/F2 | textarea | 统一策略 | 原生或 compact | P2 |

---

*文档版本：v1 · 审查对象：apps/studio · 交付性质：分析与规范，不含代码变更*
