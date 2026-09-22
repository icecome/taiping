# taiping_blog 审查报告索引

> **审查日期：** 2026-09-21
> **审查对象：** taiping_blog —— 部署在 Cloudflare Workers 内的轻量博客管理系统
> **审查范围：** 全量源码（131 文件 / 约 17570 行 SLOC，排除依赖与生成物）
> **审查性质：** 只读分析，全过程未修改任何代码或配置文件
> **审查轮次：** 首轮

---

## 报告清单

| # | 报告 | 内容 | 核心结论 |
|---|------|------|---------|
| 1 | [01-architecture-review.md](./01-architecture-review.md) | 架构一致性审查：设计基线溯源、五维度建模、Delta 对比、健康度评分 | 健康度 **76/100 🟡**；裁决**分阶段演进**；2 个 P0 |
| 2 | [02-code-reuse-assessment.md](./02-code-reuse-assessment.md) | 代码复用阶梯评估：12 个代码单元的 7 步决策 | 1 项 HIGH 复用失效；markdown / 加密 / 限流三项复用决策正确 |
| 3 | [03-comprehensive-code-review.md](./03-comprehensive-code-review.md) | SPEAR 综合代码审查 + OWASP 安全审计 | 加权 **55/100 🟡**；**REQUEST_CHANGES**；1 个 CRITICAL + 6 个 MAJOR |

---

## 三项结论的交叉关系

三份报告针对同一代码库的不同维度，存在若干**互相印证**的发现，值得一并看待：

**发现一：加密语义在项目内不一致（三份报告均涉及）**

架构审查将其判为 P0（RSS 未过滤加密文章）；代码审查将其判为 M-S1 MAJOR。同一代码库中对 `encrypt` 标记存在**三处判据**：搜索索引正确过滤（`packages/renderer/src/search.ts:26`）、文章卡片正确遮蔽摘要（`themes/zhuosu/src/components.ts:167`）、RSS **遗漏过滤**（`apps/edge/src/routes/public.ts:282`）。这不是单点疏忽，而是「同一约束在多处实现」缺少统一出口的结构问题。

**发现二：类型契约存在静默失效（架构审查 P0 = 代码审查 M-A1）**

`apps/edge/src/routes/public.ts:265` 的 `as unknown as Post[]` 双重强转绕过了类型系统，导致 taxonomy 列表页的字段读取全部返回 `undefined`。三份报告从不同角度收敛到同一处：架构维度看是「层间契约失效」，代码维度看是「snake_case↔camelCase 映射缺失」，复用维度看是「`PostRow`/`rowToPost` 未作为共享映射层导出」。

**发现三：已建立的正确抽象未被使用（复用报告的独立发现）**

`packages/shared-utils/src/slug.ts` 提供了 `slugify`，但全仓搜索显示**只有测试文件引用它**，两处生产代码（`posts.ts:154`、`terms.ts:26`）各自内联了等价逻辑。同类问题还有 `services/auth.ts:88-100` 的 `verifyAdminPassword` 恒定时间比较实现——代码审查发现它从未被调用，而登录路径（同文件第 20 行）用的是不安全的 `!==`。

这类「抽象已就位但未被采纳」的问题在单份报告中容易被低估，因为每一处看起来都是小问题；但三份报告合起来看，它反映的是**迁移未完成**——共享包被引入，既有内联实现未同步清理。

---

## 优先行动建议

综合三份报告，建议按以下顺序推进。判断依据是「危害 × 修复成本」：

### 立即处理（安全阻塞，修复成本均 < 1 人/天）

1. **评论 `website` 协议校验收紧** — `packages/content-model/src/comment.ts:33-37`，并在 `themes/zhuosu/src/components.ts:209` 补渲染侧检查以覆盖存量数据（代码审查 C-01）
2. **RSS 增加 `!post.encrypt` 过滤** — `apps/edge/src/routes/public.ts:282`（架构 P0 / 代码 M-S1）
3. **登录改用已有的 `verifyAdminPassword`** — `apps/edge/src/services/auth.ts:20`（代码 M-S2）
4. **`fetch` 入口调用 `assertEnv`** — `apps/edge/src/index.ts:40`（代码 M-S5）

### 本周处理

5. **修复 taxonomy 行映射** — `services/terms.ts:85-97` 补 `rowToPost`，移除 `public.ts:265` 强转（架构 P0 / 代码 M-A1）
6. **IP 取值优先级修正** — `routes/api.ts:49`（代码 M-S3）
7. **`formatDate` 时区统一** — `packages/shared-utils/src/date.ts:11-15`（复用 HIGH / 代码 m-01）

### 中期

8. 合并 Cookie 解析、统一 slug 生成与 ID 生成（复用报告 MEDIUM 项）
9. 拆分 `MomentListPage.tsx`，抽出路由层的 XML 组装（架构 P1 / 代码 m-07）
10. **补测试** — `apps/edge` 服务层与全部路由零覆盖，是可靠性维度 4/10 的根因

---

## 审查方法与证据基线

**技术栈识别**：基于 `package.json` / `pnpm-workspace.yaml` / 各子包构建文件判定（构建文件优先于目录名）。

| 层 | 包 | 技术 |
|----|-----|------|
| L4 客户端 | `apps/studio` | React 19 + Vite + Tailwind + React Query |
| L3 路由 | `apps/edge` | Hono 4 |
| L2 渲染 | `packages/renderer` + `themes/zhuosu` | markdown-it + sanitize-html + Hono JSX |
| L1 契约 | `packages/content-model` | zod |
| L0 数据 | — | D1（SQLite），可选 KV / R2 |

**设计基线来源**：`docs/architecture-design.md` v2.0（574 行）。文档齐全，属 Level 1（理想）情况，未启用逆向推测。

**核对命令与结果**

```
pnpm -r test      → 25 tests passed（content-model 8 / shared-utils 8 / renderer 5 / edge 4 / studio 0）
pnpm typecheck    → 6/6 包通过（tsc --noEmit 全绿）
git check-ignore  → .dev.vars 与 .wrangler 均已忽略，无密钥入库
```

**SLOC 口径**：约 17570 行，使用 `wc -l` 兜底统计（本机无 `cloc`），**含空行与注释，为近似值**，置信度中。

**未启用的分析**：仓库无任何 git 提交（`git log` 返回 `fatal: ... does not have any commits yet`），全部文件处于 untracked 状态，因此**变更热点分析不适用**。

---

## 未验证项汇总

各报告的详细声明见其「未验证项声明」章节，此处汇总跨报告的共性缺口：

| 缺口 | 影响范围 | 原因 |
|------|---------|------|
| Workers 运行时 CPU 与渲染耗时 | 架构 / 性能评分 | 需真实边缘环境部署 |
| D1 真实查询性能 | 架构 / 性能评分 | 需生产级数据量 |
| 并发与竞态行为 | 代码审查 M-R1 | 未执行并发压力测试，仅静态分析 |
| 跨站请求的实际可利用性 | 代码审查 M-S4 | 未在真实浏览器构造请求验证 |
| 前端视觉与交互正确性 | 全部 | 未运行应用；`apps/studio` 零测试覆盖 |
| `apps/studio/public/theme/**` 来源 | 架构 / 复用 | 可能同步的 `scripts/` 目录已被 gitignore |
| `vendor/` 与 `overtypeplus` 依赖 | 全部 | 第三方代码，未审计 |
| 变更热点 | 架构审查 | 仓库无 git 历史 |

---

## 附：本轮审查使用的技能

| 技能 | 职责 | 对应报告 |
|------|------|---------|
| architecture-review-assistant | 架构建模、Delta 偏离检测、健康度评分与三档裁决 | 01 |
| code-reuse-ladder | 7 步复用决策阶梯，逐代码单元评估 | 02 |
| comprehensive-code-review | SPEAR 评分、OWASP 安全审计、证据驱动验证、误报防控 | 03 |

**组合方式**：三者属**并行分工**关系——各负责一个维度，结果汇总于本索引。技能间无输出依赖（非流水线）。报告骨架采用架构审查的强制三部分格式（结论摘要 / 问题清单 / 改进建议），代码审查的 SPEAR 评分与问题编号体系（`C-`/`M-x`/`m-`/`n-`/`Q-`）在各报告内独立适用。
