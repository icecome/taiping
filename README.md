# taiping_blog

边缘运行时内的轻量博客管理系统：D1 为主存储，请求期 TSX 渲染，复刻拙素主题；同一 Worker 托管后台 SPA。

## 结构

```
packages/content-model   契约层（zod schema / 类型 / API 信封）
packages/renderer        markdown 管线与派生数据
packages/shared-utils    日期 / slug / 阅读时长等纯函数
themes/zhuosu            拙素主题 TSX + 样式脚本
apps/edge                Cloudflare Worker（前台渲染 + 管理/公开 API）
apps/studio              后台 React SPA
docs/                    架构与技术方案
```

## 快速开始

```powershell
pnpm install
pnpm -F @taiping/content-model test
pnpm -F @taiping/renderer test
pnpm -F @taiping/shared-utils test
pnpm typecheck
```

本地运行边缘应用前，复制并填写：

```powershell
Copy-Item apps/edge/.dev.vars.example apps/edge/.dev.vars
pnpm db:migrate:local
pnpm -F @taiping/edge dev
```

后台开发（另开终端）：

```powershell
pnpm -F @taiping/studio dev
```

- 前台：http://127.0.0.1:8787/
- 后台：http://127.0.0.1:8787/admin/ 或 Vite 代理下的 http://127.0.0.1:5173/

## 约定摘要

- 统一响应信封：`{ok:true,data}` / `{ok:false,error:{code,message,details}}`
- 管理接口挂载 `/api/admin/*`，鉴权中间件按前缀统一处理
- 环境变量在 `apps/edge/src/env.ts` 集中声明
- KV / R2 为可选绑定，首期仅 D1 必需
- 鉴权：账号口令存于 D1 `admins` 表（PBKDF2 哈希）+ 签名会话 Cookie；
  `ADMIN_USERNAME`/`ADMIN_PASSWORD` 仅用于首次播种，播种后可在后台「设置 → 账号」改口令
- 说说列表承载内容；留言表单组件统一；归档默认按年；媒体首期外链 URL

## 部署

```powershell
# 配置 wrangler 中的 D1 database_id 与 secrets 后
pnpm deploy
```
