# ADR 0005：CSP 保留 `'unsafe-inline'`

- 状态：已采纳（有明确的退场条件）
- 日期：2026-10-26
- 相关：[docs/02-CMS架构设计方案.md](../02-CMS架构设计方案.md) 的 12 节

## 背景

`middleware/security.ts` 输出的 CSP 里 `style-src` 与 `script-src` 都带 `'unsafe-inline'`。这削弱了 CSP 对 XSS 的拦截能力，属于明确的让步，需要记录理由与退场条件。

两处内联是实打实存在的：

1. **前台主题**：`manifest.styles` 是一段 CSS 常量，注入 `<style>`；`manifest.scripts` 是一段渐进增强脚本（暗色切换、代码复制、图片灯箱），注入 `<script>`。
2. **后台 SPA**：Vite 构建产物在 `index.html` 里有内联的首屏注入脚本与样式。

## 决策

保留 `'unsafe-inline'`，同时把其它面的防护做到位：

- `default-src 'self'`，不允许外部脚本源；
- `frame-ancestors 'none'` 与 `X-Frame-Options: DENY` 防点击劫持；
- `form-action 'self'`、`base-uri 'self'`；
- 正文关闭 HTML 透传（ADR 0002），从源头减少可注入点；
- 评论纯文本 + 模板转义。

## 理由

- 换成 nonce 需要把主题的 CSS/脚本改成外链资源：主题要额外提供一个静态资源路由，`manifest.styles` / `scripts` 从字符串变成文件，主题作者门槛上升。
- 当前最大的注入面（正文 HTML）已经被 ADR 0002 关掉了。保留 `unsafe-inline` 的边际风险有限。
- 后台 SPA 的注入来自构建产物，不是用户输入。

## 退场条件

满足任意一条就应该去掉 `'unsafe-inline'` 并改用 nonce：

- 允许了任何形式的富文本 / 原生 HTML 输入（会打破 ADR 0002 的前提）；
- 前台引入了外部脚本（统计、评论第三方）；
- 主题机制改成可上传的第三方包。

## 后果

- 安全审查时要能解释这三处内联的来源，不要把它当成默认配置照抄。
- 新增任何内联脚本时，先问「能不能做成外部文件」；不能，再确认它不包含用户输入。
