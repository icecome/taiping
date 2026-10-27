/**
 * 主题「纸墨」（default）—— 中文长文阅读优先的 editorial 主题。
 *
 * 目录结构：
 *   index.tsx     契约入口：manifest + render 绑定（registry.ts 从这里取 defaultTheme）
 *   layout.tsx    <html> / <head> / 页头 / 页脚 / 插件注入点
 *   pages.tsx     九个页面渲染器
 *   components.tsx 卡片、分页、侧栏、目录、评论等可复用片段
 *   styles.ts     CSS 常量、设置覆盖层、渐进增强脚本、设置项声明
 *   settings.ts   ctx.settings 的类型收敛与格式化工具
 *
 * 所有 renderer 都是同步纯函数：数据由上层装载，主题不碰 db / env / 网络。
 */
import type { Theme, ThemeManifest } from "../types";
import { SiteLayout } from "./layout";
import {
  renderArchive,
  renderError,
  renderHome,
  renderMoments,
  renderPage,
  renderPost,
  renderProjects,
  renderSearch,
  renderTerm,
} from "./pages";
import { SCRIPTS, SETTINGS, STYLES } from "./styles";

const manifest: ThemeManifest = {
  id: "default",
  name: "纸墨",
  version: "1.0.0",
  author: "太平",
  description: "类纸底色、中文长文排版优先的 editorial 主题，带侧栏、目录与暗色模式。",
  supports: {
    darkMode: true,
    toc: true,
    sidebar: true,
    comments: true,
    moments: true,
    projects: true,
  },
  settings: SETTINGS,
  styles: STYLES,
  // 脚本自带 <script> 包裹：注入方（layout 或上层渲染层）原样插进 body 末尾即可。
  // 纯渐进增强，JS 关闭时页面功能完整（详见 styles.ts 中 SCRIPTS 的说明）。
  scripts: `<script>\n${SCRIPTS}\n</script>`,
};

export const defaultTheme: Theme = {
  manifest,
  render: {
    layout: SiteLayout,
    home: renderHome,
    archive: renderArchive,
    term: renderTerm,
    post: renderPost,
    page: renderPage,
    moments: renderMoments,
    projects: renderProjects,
    search: renderSearch,
    error: renderError,
  },
};
