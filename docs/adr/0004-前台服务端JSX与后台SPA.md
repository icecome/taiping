# ADR 0004：前台服务端 JSX，后台 React SPA

- 状态：已采纳
- 日期：2026-10-26
- 相关：[docs/01-参考项目架构分析.md](../01-参考项目架构分析.md) 的 5.1

## 背景

两个参考项目走了两条不同的路：

- flare-stack-blog：TanStack Start，前台后台同一套 React 路由，全栈 SSR。
- LuyBlog：React SPA + 构建期生成的 HTML 骨架，前台实质是客户端渲染。

## 决策

**前台用 `hono/jsx` 在 Worker 上服务端渲染成纯 HTML；后台用 React + Vite 构建成独立 SPA，产物由同一个 Worker 当静态资源托管。**

两条边界：

1. **Worker 包里不含 React**。前台渲染是 JSX 语法在构建期被编译成字符串拼接，运行时没有虚拟 DOM、没有 hydration。
2. **后台挂在 `/admin`**，由 `site/router.ts` 的 `fallbackToAssetsOr404` 把所有 `/admin/*` 请求交给 `ASSETS` 返回 `index.html`，前端路由接管。

## 理由

| 维度 | 服务端 JSX | React SSR |
| --- | --- | --- |
| 包体 | 实测 1.45 MB / gzip 269 KB | 需要额外引入 React + 渲染器，量级翻倍 |
| 首屏 | 纯 HTML，无 JS | HTML + hydration |
| SEO | 完整 | 完整 |
| 主题可换性 | 主题是一组返回 JSX 的函数 | 需要理解框架的数据装载与序列化边界 |
| 交互上限 | 靠渐进增强脚本 | 高 |

博客前台的核心诉求是「快、可被收录、主题好改」，交互复杂度低。后台相反：表单、编辑器、拖拽排序、批量操作都需要组件与请求缓存。

## 后果

- 主题 renderer 必须同步（见 AGENTS.md 的 R2）：渲染链里没有 Promise，错误定位简单。
- 主题不接触 `db` / `env`：数据由 `site/data.ts` 装载成 view model 传入。换主题不会把查询逻辑一起换掉。
- 渐进增强脚本写在 `manifest.scripts`，无 JS 时页面仍可读、表单仍可提交（表单是原生 `<form>` + `POST`）。
- 后台开发期跑在 5173，靠 Vite proxy 把 `/api` 与 `/media` 转发到 8787；生产环境同源，无跨域。
