# 说说页面与后台样式问题修复记录

> **修复日期：** 2026-09-21
> **问题来源：** 用户报告（滚动条位移 / 说说输入框无响应 / 作者身份异常）
> **分析框架：** debug-rca（5W2H 根因分析 + 关联性审查 + 逆向验证）
> **验证结果：** typecheck 6/6 通过；测试 51 通过（无回归）

---

## 一、修复总览

| # | 问题 | 根因类型 | 状态 |
|---|------|---------|------|
| 1 | 跨页面切换时横向位移 | CSS 缺失属性 | ✅ 已修复 |
| 2 | 说说输入框能聚焦但敲字无反应 | 状态机死锁（真 BUG） | ✅ 已修复 |
| 3 | 说说作者显示为「管」 | 字段未写入 + 硬编码回退（真 BUG） | ✅ 已修复 |
| — | `!focus:shadow-none` 无效 Tailwind 语法 | 顺带修正 | ✅ 已修复 |

---

## 二、需先更正的一处误判

排查初期我用 PowerShell 的 `Get-Content` 读取源码，看到大量乱码：

```
杩欎竴鍒荤殑鎯虫硶鈥?   （应为「这一刻的想法…」）
```

一度据此推断项目存在**全局编码损坏**，并扫描出约 70 个「乱码文件」。

**该结论作废。** 用正确编码重读后确认：

```powershell
$content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
$content.Contains('这一刻的想法')   # → True
$content.Contains('杩欎竴')          # → False

Get-Content $path -Raw
  .Contains('这一刻的想法')          # → False
  .Contains('杩欎竴')                # → True
```

**根因是测量方法错误**：PowerShell 5.1 的 `Get-Content` 使用系统 ANSI（GBK）代码页解码 UTF-8 文件，产生乱码。项目源码编码本身是干净的。

> **教训记录**：本环境中读取含中文的源码，必须显式指定 `[System.Text.Encoding]::UTF8`，不可依赖 `Get-Content` 的默认行为。

---

## 三、问题 1：滚动条占位导致跨页面横向位移

### 5W2H 分析

| 维度 | 内容 | 证据 |
|------|------|------|
| **What** | 有滚动条的页面与无滚动条的页面之间切换时，整个视口内容横向约 8px 位移 | 用户描述 |
| **Why** | 滚动条挂在文档级，出现/消失时改变视口内容宽度；未预留槽位 | `index.css` 的 `html, body { overflow-y: auto }` |
| **Where** | `apps/studio/src/styles/index.css`（后台样式入口） | 全仓 grep 确认无 `scrollbar-gutter` |
| **When** | 导航切换时；页面高度跨越视口高度临界点时 | — |
| **Who** | 后台使用者 | — |
| **How** | `overflow-y: auto` → 内容高于视口时滚动条挤占 8px → 内容区变窄 → 布局重排 | `html::-webkit-scrollbar { width: 8px }` |
| **How much** | 观感问题，不影响功能 | — |

**根因**：文档级滚动条 + 未预留槽位。并非某一处写错，而是**缺少 `scrollbar-gutter` 这一属性**。

### 关联性审查

| 项 | 结论 |
|----|------|
| 前台主题是否受影响 | **否**。`themes/zhuosu/src/styles/style.css:112` 已用 `html { overflow-y: scroll }` 强制恒显滚动条，天然无位移 |
| 侧边栏定位是否受影响 | 需关注。`index.css:494` 有注释「祖先不得 overflow:auto/hidden，否则 sticky 会钉在容器内部」。本次仅改 `scrollbar-gutter`，**不改 overflow 值**，故不影响 sticky |
| 移动端影响 | 移动端滚动条本身不占位（overlay 模式），属性无害 |

### 修复

```css
html {
  /* 预留滚动条槽位：有/无滚动条的页面切换时避免内容横向位移 */
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: var(--scroll-thumb) transparent;
}
```

**为何选择此方案而非 `overflow-y: scroll`**：后者会让无滚动条页面也显示灰色轨道，观感较差。`scrollbar-gutter: stable` 只预留空间、不渲染轨道，且保留原生滚动语义。

**代价**：无滚动条的页面右侧恒留 8px 空白。经权衡可接受。

---

## 四、问题 2：说说输入框能聚焦但敲字无反应

### 5W2H 分析

| 维度 | 内容 | 证据 |
|------|------|------|
| **What** | 桌面端说说撰写卡的 textarea 可点击、可聚焦，但键盘输入无任何反应 | 用户描述「能聚焦，但敲字无反应」 |
| **Why** | reducer 在 `idle` 模式丢弃输入，且桌面端无入口切换到 `creating` | 见下方「双向锁定」 |
| **Where** | `apps/studio/src/features/moment/composeState.ts`（reducer）+ `MomentListPage.tsx`（挂载逻辑） | — |
| **When** | 页面加载后、未恢复草稿、未点击 FAB 时 | — |
| **Who** | 桌面端使用者 | — |
| **How** | 见下方触发路径 | — |
| **How much** | 核心功能不可用——无法发布说说 | **严重** |

### 根因：双向锁定

**第一重：reducer 丢弃 idle 下的输入**

```ts
case 'PATCH_DRAFT':
  if (state.mode === 'idle') return state   // ← 输入被静默丢弃
  return { ...state, draft: { ...state.draft, ...action.patch } }
```

**第二重：桌面端无入口离开 idle**

ComposeCard 在桌面左栏**无条件渲染**（`MomentListPage.tsx` 中无外层条件判断），因此 textarea 始终可见可聚焦。但唯一的 `compose.enterCreate()` 调用点只有两处：

1. **移动端 FAB** —— 桌面端被 `@media (min-width: 768px) { .moment-fab { display: none !important } }` 隐藏
2. **草稿恢复路径** —— 仅当 localStorage 存在草稿时触发

**触发路径**：

```
页面加载 → composeState.mode = 'idle'
         → 桌面端 ComposeCard 渲染（textarea 可见）
         → 用户点击聚焦 ✓
         → 敲键盘 → onChange → dispatch(PATCH_DRAFT)
         → reducer 见 mode === 'idle' → 返回原 state
         → 输入被丢弃，界面无变化 ✗
```

**为何偶发可用**：若 localStorage 有草稿，恢复流程会调用 `enterCreate()`，此时输入生效。这解释了问题的间歇性。

**旁证**：`MomentListPage.tsx` 中该 textarea 的 `!focus:shadow-none` 是无效 Tailwind v3 语法（`!` 不能置于变体前缀），说明此区域近期被改动过，与「前期修改说说页面时产生」吻合。

### 关联性审查

| 项 | 结论 |
|----|------|
| 移动端是否受影响 | 否。移动端走 `composeSheetOpen` 路径，由 FAB 触发 `enterCreate()` |
| 草稿恢复路径是否被破坏 | 否。`enterCreate()` 幂等（`ENTER_CREATE` 返回全新 state），重复调用安全 |
| `enterCreate` 引用是否稳定 | 是。`actions` 为 `useMemo(..., [])`，身份稳定，`[]`-deps effect 捕获安全 |
| 是否影响其他页面 | 否。`composeState` 仅 `MomentListPage` 使用 |

### 修复

```ts
useEffect(() => {
  if (draftChecked.current) return
  draftChecked.current = true

  // 桌面端撰写卡常驻可见，须进入创建模式，否则 PATCH_DRAFT 在 idle 下被丢弃（输入无反应）
  if (!isMobileSheet) compose.enterCreate()

  const stored = loadDraft()
  if (!stored) return
  // ...原有草稿恢复逻辑
}, [])
```

**为何选择挂载时自动激活**：桌面端「撰写卡常驻」的设计本意即「打开即可写」。挂载时进入创建模式最贴合原意，改动最小（1 行），且不影响移动端与草稿恢复。

---

## 五、问题 3：说说作者显示为「管」

### 5W2H 分析

| 维度 | 内容 | 证据 |
|------|------|------|
| **What** | 新建说说的头像显示「管」，历史说说显示「徐」，同一页面上两种标识并存 | 用户截图 |
| **Why** | 新建时 `author` 从未写入（存空串），前端用硬编码 `'管'` 兜底 | 见下 |
| **Where** | `composeState.ts`（toPayload）+ `moments.ts`（createMoment）+ `MomentListPage.tsx`（渲染） | — |
| **When** | 通过后台 SPA 新建的说说 | — |
| **Who** | 所有后台发布的说说 | — |
| **How** | `toPayload()` 不含 author → 服务端 `input.author \|\| ''` 存空串 → 渲染时 `(author \|\| '管')` | — |
| **How much** | 数据质量 + 一致性；`管` 并非真实作者标识 | 中等 |

### 根因链路（三段）

1. **前端未发送**：`composeState.ts` 的 `toPayload()` 返回对象中**无 `author` 字段**
2. **服务端存空串**：`apps/edge/src/services/moments.ts` 的 `createMoment` 执行 `.bind(..., input.author || '', ...)`
3. **前端硬编码回退**：`MomentListPage.tsx` 渲染 `(moment.author || '管').charAt(0)`

**关键澄清**：`管` **不是**管理员身份标识，只是一个写死的字符。真实的管理员标识在侧边栏（`Administrator` / `管理员`），与头像无关。

### 真实数据验证

直接读取本地 D1 数据库（`apps/edge/.wrangler/state/v3/d1/.../*.sqlite`）确认：

**历史记录**（`mom_1ab5b6c865544adb`）：
```
mom_1ab5b6c865544adb废物，科三又挂了。\n<!-- more --><p>...</p>\n[]徐宋柏published["生活吐槽"]2026-09-18T06:37:59.666Z
                                  ↑ pictures    ↑ author ↑ status
```

**新建记录**（`mom_6eb73bf2ed1b4a8d`，对应截图中 09-22 那条）：
```
mom_6eb73bf2ed1b4a8d阳光穿透，金粉撒在圆桌。侧是<p>...</p>\n[]published["阳光"]2026-09-22T03:01:29.765Z
                                                            ↑ author 位置为空
```

对比确认：历史数据（从 Hugo 站点迁移）带 `author=徐宋柏`，新建数据 `author` 为空。

### 关联性审查

| 项 | 结论 |
|----|------|
| 前台是否受影响 | 否。`themes/zhuosu/src/components.ts` 用 `m.author ? ... : ''` 条件渲染，空作者不显示，无硬编码 |
| 其他调用 `toPayload` 的位置 | 仅 `handlePublish` 一处 |
| 修改 `toPayload` 签名是否破坏兼容 | 否。author 为可选参数，省略时行为同前 |
| 是否存在未预期的作者来源 | 无。`settings.author` 默认 `徐宋柏`，与历史数据一致 |

### 修复（三处）

**1. 前端注入作者**（`MomentListPage.tsx`）

```ts
// 作者来源：无多用户体系，站点设置中的作者即当前发布者
const settings = useQuery({
  queryKey: ['settings'],
  queryFn: () => api.settings.get(),
})
const authorName = settings.data?.author?.trim() ?? ''
```

**2. `toPayload` 接受 author 参数**（`composeState.ts`）

```ts
const toPayload = useCallback(
  (author?: string): { /* ... */ author?: string; status: 'published' } => ({
    // ...
    author: author?.trim() || undefined,
    status: 'published',
  }),
  [state.draft],
)
```

**为何用参数注入而非在 hook 内取 settings**：保持 `composeState` 无副作用、不依赖网络请求，便于测试与复用。

**3. 移除硬编码回退**（`MomentListPage.tsx`）

```ts
// 无作者时不显示头像，与前台 MomentsFeed 的条件渲染保持一致
const authorInitial = moment.author?.trim().charAt(0) ?? ''
// ...
{authorInitial ? (
  <div className="w-8 h-8 rounded-full bg-primary ...">{authorInitial}</div>
) : null}
```

**布局安全性**：内容区使用 `flex-1`，头像缺失时自动占满宽度，不产生错位。

---

## 六、遗留事项

### 存量数据的作者字段仍为空

本次修复只保证**新发布的说说**带作者。数据库中已存在的空作者记录（如截图中的 09-22 那条）不会自动回填，修复后将显示**无头像**，与历史记录的「徐」并存。

如需统一，需一次性数据回填。我**未执行**该操作，因为：

1. 写操作会修改你的数据，属不可逆行为
2. 回填值需你确认（是用 `settings.author`（徐宋柏），还是保留空值不显示头像）

回填 SQL 参考（**未执行**）：

```sql
UPDATE moments SET author = '徐宋柏' WHERE author IS NULL OR author = '';
```

若确定执行，建议先备份 `apps/edge/.wrangler/state/v3/d1/` 下的 sqlite 文件。

### 其他观察

- `apps/studio/src/styles/index.css` 中存在多处 `!important`（如 `.overtype-editor-host` 系列）。与本次问题无关，未改动。
- 前台 `style.css` 使用 `overflow-y: scroll` 而非 `scrollbar-gutter`，两种方案效果等价，未统一（避免无关改动）。

---

## 七、Phase 5 逆向验证

| 检查项 | 结果 |
|--------|------|
| **符号闭合** | ✅ 6 个包 typecheck 通过；JSX 条件渲染的三元与括号成对 |
| **类型一致性** | ✅ `toPayload(author?: string)` 可选参数不破坏既有调用；`settings.data?.author?.trim() ?? ''` 处理了 loading/undefined |
| **错误处理** | ✅ `settings` 查询失败时 `authorName` 为空串，`toPayload` 返回 `author: undefined`，与修复前行为一致（不会崩溃） |
| **边界条件** | ✅ author 为 `''` / `undefined` / 纯空格时均正确判定为「无作者」 |
| **引用稳定性** | ✅ 已确认 `enterCreate` 来自 `useMemo(..., [])`，`[]`-deps effect 捕获安全 |
| **幂等性** | ✅ `enterCreate()` 重复调用返回全新 state，与草稿恢复路径共存无冲突 |
| **变更边界** | ✅ 仅改 3 个文件 + 1 处 CSS；未新增 TODO；未删除测试；未改动无关逻辑 |
| **回归** | ✅ 51 个测试全部通过，无新增失败 |

### 未能完成的验证

**未在浏览器中实测输入行为。** 环境未安装 Playwright，且不便为此引入重型依赖。本次通过**静态代码路径推演 + 真实数据库记录比对**验证：

- 输入问题：已确认 reducer 的 `idle` 守卫、确认 `enterCreate` 的两个调用点、确认 FAB 在桌面端隐藏
- 作者问题：已从 SQLite 原始记录中比对新旧数据的 author 字段差异

**建议你在浏览器中确认**：打开后台说说页，直接点击撰写框输入文字，应可正常输入；发布后新说说的头像应显示「徐」（取自站点设置作者）。

---

## 八、修改文件清单

```
apps/studio/src/styles/index.css                    新增 scrollbar-gutter: stable
apps/studio/src/pages/MomentListPage.tsx            挂载自动 enterCreate / settings 查询 /
                                                     author 注入 / 移除硬编码回退 /
                                                     修正无效 Tailwind 类
apps/studio/src/features/moment/composeState.ts     toPayload 接受 author 参数
```
