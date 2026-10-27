/**
 * default 主题（纸墨）的静态资源常量。
 *
 * 为什么 CSS 是模板字符串常量而不是外部文件：
 * 主题要编译进 Worker，多一个静态文件就多一条资源路由与一次请求；
 * 而这份样式是编译期常量，不是用户输入，内联进 `<head>` 反而少一次往返（FCP 更早）。
 * 用户可配置的颜色/宽度不进这里，而是由 buildRootCss() 生成一小段 `:root` 覆盖，
 * 这样样式主体永远可被缓存，且颜色值有白名单校验（见 settings.ts 的 color()）。
 */
import type { ThemeContext, ThemeSettingField } from "../types";
import { bodyFont, color, lighten, num } from "./settings";

/**
 * 基础样式。规矩：
 * - 不 @import 远程字体（离线可跑，也没有第三方请求）；
 * - 颜色全部走 CSS 变量，方便暗色模式与用户配色；
 * - 正文最大宽度按 ch 定，中英混排都在 40 字上下换行，接近纸质阅读的舒适区。
 */
export const STYLES = `
/* ---------------------------------------------------------------- 变量 */
:root {
  /* 用户配色优先，未配置时用兜底色（暗色模式取各自的亮版本） */
  --tp-primary: var(--tp-primary-base, #24435a);
  --tp-primary-soft: rgba(36, 67, 90, 0.08);
  --tp-accent: var(--tp-accent-base, #a8422d);
  --tp-paper: #fbf9f4;
  --tp-paper-alt: #f4f0e6;
  --tp-paper-sink: #eeeadf;
  --tp-ink: #211f1c;
  --tp-ink-soft: #56524a;
  --tp-ink-faint: #8b8478;
  --tp-rule: #e3ddd0;
  --tp-rule-strong: #d2c9b8;
  --tp-code-bg: #1c2024;
  --tp-code-ink: #e8e4db;
  --tp-code-rule: #2c3238;
  --tp-radius-sm: 4px;
  --tp-radius: 8px;
  --tp-radius-lg: 12px;
  --tp-shadow: 0 1px 2px rgba(33, 31, 28, 0.05), 0 8px 24px -16px rgba(33, 31, 28, 0.24);
  --tp-width: 72ch;
  --tp-page: 1120px;
  --tp-gap: 2.5rem;
  --tp-font-sans: "Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, -apple-system, "Segoe UI", sans-serif;
  --tp-font-serif: "Noto Serif SC", "Songti SC", "Source Han Serif SC", SimSun, Georgia, "Times New Roman", serif;
  --tp-font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  --tp-font-body: var(--tp-font-sans);
  color-scheme: light;
}

/* ---------------------------------------------------------------- 重置 */
*,
*::before,
*::after {
  box-sizing: border-box;
}

html {
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
  scroll-behavior: smooth;
}

body {
  margin: 0;
  background-color: var(--tp-paper);
  color: var(--tp-ink);
  font-family: var(--tp-font-body);
  font-size: 17px;
  line-height: 1.75;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

img,
picture,
video,
canvas,
svg {
  max-width: 100%;
  height: auto;
}

h1,
h2,
h3,
h4,
h5,
h6 {
  margin: 0 0 0.5em;
  font-weight: 650;
  line-height: 1.32;
  letter-spacing: -0.005em;
}

p {
  margin: 0 0 1em;
}

a {
  color: var(--tp-primary);
  text-decoration: none;
  text-underline-offset: 0.18em;
  text-decoration-thickness: 1px;
}

a:hover {
  text-decoration: underline;
}

a:focus-visible,
button:focus-visible,
input:focus-visible,
textarea:focus-visible,
summary:focus-visible,
[tabindex]:focus-visible {
  outline: 2px solid var(--tp-accent);
  outline-offset: 2px;
  border-radius: var(--tp-radius-sm);
}

hr {
  border: 0;
  border-top: 1px solid var(--tp-rule);
  margin: 2rem 0;
}

button {
  font: inherit;
  color: inherit;
}

::selection {
  background: var(--tp-primary);
  color: #fff;
}

/* ---------------------------------------------------------------- 骨架 */
.tp-skip {
  position: absolute;
  left: -9999px;
  top: 0;
  z-index: 100;
  padding: 0.6em 1em;
  background: var(--tp-ink);
  color: var(--tp-paper);
  border-radius: 0 0 var(--tp-radius) 0;
}

.tp-skip:focus {
  left: 0;
}

.tp-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.tp-main {
  flex: 1 0 auto;
  width: 100%;
  max-width: var(--tp-page);
  margin: 0 auto;
  padding: 2.25rem 1.5rem 4rem;
}

.tp-main.is-narrow {
  max-width: calc(var(--tp-width) + 12rem);
}

.tp-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 19rem;
  gap: var(--tp-gap);
  align-items: start;
}

.tp-layout-no-sidebar {
  grid-template-columns: minmax(0, 1fr);
}

.tp-page-head {
  margin-bottom: 2rem;
  padding-bottom: 1.25rem;
  border-bottom: 1px solid var(--tp-rule);
}

.tp-page-head h1 {
  font-size: clamp(1.6rem, 3.4vw, 2.1rem);
  margin-bottom: 0.35rem;
}

.tp-page-head .tp-page-desc {
  margin: 0;
  color: var(--tp-ink-soft);
  font-size: 0.95rem;
}

/* ---------------------------------------------------------------- 头部 */
.site-header {
  position: sticky;
  top: 0;
  z-index: 20;
  background: var(--tp-paper);
  background: color-mix(in srgb, var(--tp-paper) 88%, transparent);
  backdrop-filter: saturate(140%) blur(8px);
  border-bottom: 1px solid var(--tp-rule);
}

.site-header-inner {
  display: flex;
  align-items: center;
  gap: 1.25rem;
  width: 100%;
  max-width: var(--tp-page);
  margin: 0 auto;
  padding: 0.85rem 1.5rem;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  margin-right: auto;
  font-family: var(--tp-font-serif);
  font-size: 1.18rem;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: var(--tp-ink);
}

.brand:hover {
  text-decoration: none;
  color: var(--tp-primary);
}

.brand-logo {
  width: 30px;
  height: 30px;
  border-radius: var(--tp-radius-sm);
  object-fit: cover;
}

.brand-mark {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: var(--tp-radius-sm);
  background: var(--tp-ink);
  color: var(--tp-paper);
  font-size: 0.95rem;
  font-family: var(--tp-font-serif);
}

.site-nav ul {
  display: flex;
  align-items: center;
  gap: 0.15rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.site-nav > ul > li {
  position: relative;
}

.site-nav a,
.site-nav .nav-summary {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.35rem 0.6rem;
  border-radius: var(--tp-radius-sm);
  color: var(--tp-ink-soft);
  font-size: 0.94rem;
  white-space: nowrap;
  cursor: pointer;
}

.site-nav a:hover,
.site-nav .nav-summary:hover {
  text-decoration: none;
  color: var(--tp-ink);
  background: var(--tp-paper-sink);
}

.site-nav a[aria-current="page"] {
  color: var(--tp-ink);
  font-weight: 650;
  box-shadow: inset 0 -2px 0 var(--tp-accent);
}

/* 子菜单用原生 details：JS 关闭时也能展开、也能键盘操作 */
.nav-sub {
  position: relative;
}

.nav-sub > summary {
  list-style: none;
  padding: 0.3rem 0.45rem;
  border-radius: var(--tp-radius-sm);
  color: var(--tp-ink-faint);
  cursor: pointer;
  font-size: 0.8rem;
}

.nav-sub > summary::-webkit-details-marker {
  display: none;
}

.nav-sub > summary::after {
  content: "＋";
}

.nav-sub[open] > summary::after {
  content: "－";
}

.nav-sub ul {
  position: absolute;
  right: 0;
  top: calc(100% + 0.35rem);
  display: block;
  min-width: 10.5rem;
  padding: 0.35rem;
  background: var(--tp-paper);
  border: 1px solid var(--tp-rule);
  border-radius: var(--tp-radius);
  box-shadow: var(--tp-shadow);
}

.nav-sub ul a {
  display: block;
  padding: 0.35rem 0.5rem;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.theme-toggle {
  display: inline-grid;
  place-items: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 1px solid var(--tp-rule-strong);
  border-radius: 50%;
  background: transparent;
  color: var(--tp-ink-soft);
  cursor: pointer;
}

.theme-toggle:hover {
  color: var(--tp-ink);
  border-color: var(--tp-ink-faint);
}

.theme-toggle svg {
  width: 17px;
  height: 17px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.theme-toggle .icon-moon {
  display: none;
}

:root[data-theme="dark"] .theme-toggle .icon-moon,
:root[data-theme="dark"] .theme-toggle .icon-sun {
  display: none;
}

:root[data-theme="dark"] .theme-toggle .icon-sun {
  display: block;
}

/* 跟随系统暗色、且用户还没手动切换过：同样显示"切到浅色"的太阳图标 */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) .theme-toggle .icon-moon {
    display: none;
  }

  :root:not([data-theme]) .theme-toggle .icon-sun {
    display: block;
  }
}

/* ---------------------------------------------------------------- 首页横幅 */
.hero {
  padding: 1.5rem 0 2rem;
  margin-bottom: 2rem;
  border-bottom: 1px solid var(--tp-rule);
}

.hero h1 {
  font-family: var(--tp-font-serif);
  font-size: clamp(1.85rem, 4.6vw, 2.85rem);
  line-height: 1.25;
  letter-spacing: -0.01em;
  margin-bottom: 0.75rem;
}

.hero p {
  max-width: 56ch;
  margin: 0;
  color: var(--tp-ink-soft);
  font-size: 1.03rem;
}

.hero-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1.4rem;
  margin-top: 1.1rem;
  padding: 0;
  list-style: none;
  color: var(--tp-ink-faint);
  font-size: 0.86rem;
}

.hero-stats strong {
  color: var(--tp-ink-soft);
  font-family: var(--tp-font-mono);
  font-weight: 600;
}

/* ---------------------------------------------------------------- 文章卡片 */
.section-label {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin: 0 0 1rem;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--tp-ink-faint);
}

.section-label::after {
  content: "";
  flex: 1;
  height: 1px;
  background: var(--tp-rule);
}

.pinned-zone {
  margin-bottom: 2.5rem;
  padding: 1.25rem 1.35rem 0.35rem;
  background: var(--tp-paper-alt);
  border: 1px solid var(--tp-rule);
  border-radius: var(--tp-radius-lg);
}

.post-list {
  display: flex;
  flex-direction: column;
  gap: 2rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.post-card {
  display: grid;
  gap: 1.25rem;
  padding-bottom: 2rem;
  border-bottom: 1px solid var(--tp-rule);
}

.post-card:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.post-card.has-cover {
  grid-template-columns: minmax(0, 1fr) 13.5rem;
  align-items: start;
}

.post-card-cover {
  display: block;
  order: 2;
  overflow: hidden;
  border-radius: var(--tp-radius);
  background: var(--tp-paper-sink);
  aspect-ratio: 16 / 10;
}

.post-card-cover img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.4s ease;
}

.post-card:hover .post-card-cover img {
  transform: scale(1.03);
}

.post-card-pin {
  display: inline-block;
  margin-right: 0.5rem;
  padding: 0.05rem 0.45rem;
  border-radius: var(--tp-radius-sm);
  background: var(--tp-accent);
  color: #fff;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  vertical-align: 0.18em;
}

.post-card-title {
  margin: 0 0 0.5rem;
  font-family: var(--tp-font-serif);
  font-size: 1.42rem;
  line-height: 1.4;
}

.post-card-title a {
  color: var(--tp-ink);
}

.post-card-title a:hover {
  color: var(--tp-primary);
  text-decoration: none;
}

.post-card-excerpt {
  margin: 0 0 0.75rem;
  color: var(--tp-ink-soft);
  font-size: 0.96rem;
  line-height: 1.72;
}

.entry-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem 0.9rem;
  margin: 0;
  padding: 0;
  list-style: none;
  color: var(--tp-ink-faint);
  font-size: 0.82rem;
}

.entry-meta li {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

.entry-meta time {
  font-family: var(--tp-font-mono);
  font-size: 0.78rem;
}

.entry-meta .meta-sep {
  color: var(--tp-rule-strong);
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0.7rem 0 0;
  padding: 0;
  list-style: none;
}

.chip {
  display: inline-block;
  padding: 0.1rem 0.55rem;
  border: 1px solid var(--tp-rule-strong);
  border-radius: 999px;
  color: var(--tp-ink-soft);
  font-size: 0.78rem;
  line-height: 1.6;
}

.chip:hover {
  text-decoration: none;
  border-color: var(--tp-primary);
  color: var(--tp-primary);
}

.empty-state {
  padding: 3rem 1rem;
  text-align: center;
  color: var(--tp-ink-faint);
  border: 1px dashed var(--tp-rule-strong);
  border-radius: var(--tp-radius);
}

/* ---------------------------------------------------------------- 侧栏 */
.sidebar {
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
  position: sticky;
  top: 5rem;
  font-size: 0.9rem;
}

.widget {
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--tp-rule);
}

.widget:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.widget-title {
  margin: 0 0 0.85rem;
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--tp-ink-faint);
}

.widget ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.widget-list li {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.3rem 0;
  border-bottom: 1px dotted var(--tp-rule);
}

.widget-list li:last-child {
  border-bottom: 0;
}

.widget-list a {
  color: var(--tp-ink-soft);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.widget-list a:hover {
  color: var(--tp-primary);
  text-decoration: none;
}

.widget-count {
  flex: none;
  color: var(--tp-ink-faint);
  font-family: var(--tp-font-mono);
  font-size: 0.76rem;
}

.tag-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.tag-cloud .tag-w1 {
  font-size: 0.8rem;
}

.tag-cloud .tag-w2 {
  font-size: 0.9rem;
}

.tag-cloud .tag-w3 {
  font-size: 1rem;
}

.tag-cloud .tag-w4 {
  font-size: 1.1rem;
  font-weight: 650;
}

.tag-cloud .tag-w4,
.tag-cloud .tag-w3 {
  color: var(--tp-ink);
}

.recent-comment {
  padding: 0.55rem 0;
  border-bottom: 1px dotted var(--tp-rule);
}

.recent-comment:last-child {
  border-bottom: 0;
}

.recent-comment-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.2rem;
  font-size: 0.8rem;
}

.recent-comment-author {
  color: var(--tp-ink);
  font-weight: 600;
}

.recent-comment-date {
  color: var(--tp-ink-faint);
  font-family: var(--tp-font-mono);
}

.recent-comment-body {
  margin: 0;
  color: var(--tp-ink-soft);
  font-size: 0.84rem;
  line-height: 1.65;
}

.widget-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.6rem;
}

.widget-stat {
  padding: 0.55rem 0.7rem;
  background: var(--tp-paper-alt);
  border-radius: var(--tp-radius-sm);
}

.widget-stat strong {
  display: block;
  font-family: var(--tp-font-mono);
  font-size: 1.05rem;
}

.widget-stat span {
  color: var(--tp-ink-faint);
  font-size: 0.76rem;
}

/* ---------------------------------------------------------------- 分页 */
.pager {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin: 2.5rem 0 0;
  padding-top: 1.5rem;
  border-top: 1px solid var(--tp-rule);
  font-size: 0.88rem;
}

.pager-pages {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.pager-pages a,
.pager-pages span {
  display: inline-grid;
  place-items: center;
  min-width: 2rem;
  height: 2rem;
  padding: 0 0.45rem;
  border-radius: var(--tp-radius-sm);
  font-family: var(--tp-font-mono);
  font-size: 0.84rem;
  color: var(--tp-ink-soft);
}

.pager-pages a:hover {
  text-decoration: none;
  background: var(--tp-paper-sink);
  color: var(--tp-ink);
}

.pager-pages [aria-current="page"] {
  background: var(--tp-ink);
  color: var(--tp-paper);
}

.pager-gap {
  color: var(--tp-ink-faint);
}

.pager-jump {
  display: flex;
  gap: 0.75rem;
}

.pager-jump a {
  padding: 0.3rem 0.7rem;
  border: 1px solid var(--tp-rule-strong);
  border-radius: var(--tp-radius-sm);
  color: var(--tp-ink-soft);
}

.pager-jump a:hover {
  text-decoration: none;
  border-color: var(--tp-primary);
  color: var(--tp-primary);
}

.pager-jump .is-disabled {
  padding: 0.3rem 0.7rem;
  border: 1px solid var(--tp-rule);
  border-radius: var(--tp-radius-sm);
  color: var(--tp-ink-faint);
}

.pager-total {
  margin: 2rem 0 0;
  padding-top: 1.25rem;
  border-top: 1px solid var(--tp-rule);
  color: var(--tp-ink-faint);
  font-size: 0.84rem;
}

/* ---------------------------------------------------------------- 文章页 */
.post-header {
  margin-bottom: 2rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--tp-rule);
}

.post-title {
  font-family: var(--tp-font-serif);
  font-size: clamp(1.75rem, 4vw, 2.5rem);
  line-height: 1.3;
  letter-spacing: -0.012em;
  margin-bottom: 0.85rem;
}

.post-subtitle {
  margin: 0 0 0.9rem;
  color: var(--tp-ink-soft);
  font-size: 1.02rem;
}

.post-byline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem 1rem;
  margin: 0;
  padding: 0;
  list-style: none;
  color: var(--tp-ink-faint);
  font-size: 0.85rem;
}

.post-byline strong {
  color: var(--tp-ink-soft);
  font-weight: 600;
}

.post-byline time {
  font-family: var(--tp-font-mono);
  font-size: 0.8rem;
}

.post-cover {
  margin: 1.75rem 0 0;
}

.post-cover img {
  display: block;
  width: 100%;
  border-radius: var(--tp-radius-lg);
}

.post-cover figcaption {
  margin-top: 0.5rem;
  color: var(--tp-ink-faint);
  font-size: 0.8rem;
  text-align: center;
}

.post-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 15rem;
  gap: var(--tp-gap);
  align-items: start;
}

/* 没有目录时不要留下 15rem 的空列 */
.post-layout.tp-layout-no-sidebar {
  grid-template-columns: minmax(0, 1fr);
}

.post-aside {
  position: sticky;
  top: 5rem;
}

.toc {
  padding: 0.9rem 1rem;
  background: var(--tp-paper-alt);
  border: 1px solid var(--tp-rule);
  border-radius: var(--tp-radius);
  font-size: 0.86rem;
}

.toc > summary {
  cursor: pointer;
  font-weight: 650;
  letter-spacing: 0.02em;
  color: var(--tp-ink-soft);
}

.toc ul {
  margin: 0.7rem 0 0;
  padding: 0;
  list-style: none;
  border-left: 1px solid var(--tp-rule-strong);
}

.toc li {
  margin: 0;
}

.toc a {
  display: block;
  padding: 0.2rem 0 0.2rem 0.7rem;
  margin-left: -1px;
  border-left: 2px solid transparent;
  color: var(--tp-ink-soft);
  line-height: 1.55;
}

.toc a:hover {
  text-decoration: none;
  border-left-color: var(--tp-accent);
  color: var(--tp-ink);
}

.toc .toc-depth-3 a {
  padding-left: 1.5rem;
  font-size: 0.94em;
  color: var(--tp-ink-faint);
}

.toc .toc-depth-4 a {
  padding-left: 2.2rem;
  font-size: 0.9em;
  color: var(--tp-ink-faint);
}

.locked-notice {
  padding: 2.5rem 1.5rem;
  text-align: center;
  background: var(--tp-paper-alt);
  border: 1px dashed var(--tp-rule-strong);
  border-radius: var(--tp-radius);
  color: var(--tp-ink-soft);
}

.post-fields {
  margin: 2rem 0 0;
  padding: 1rem 1.15rem;
  background: var(--tp-paper-alt);
  border-radius: var(--tp-radius);
  font-size: 0.88rem;
}

.post-fields dt {
  color: var(--tp-ink-faint);
  font-size: 0.76rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.post-fields dd {
  margin: 0.1rem 0 0.7rem;
}

.post-fields dd:last-child {
  margin-bottom: 0;
}

.post-nav {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  gap: 1rem;
  margin: 2.5rem 0 0;
  padding: 0;
  list-style: none;
}

.post-nav a {
  display: block;
  height: 100%;
  padding: 0.9rem 1.05rem;
  border: 1px solid var(--tp-rule);
  border-radius: var(--tp-radius);
  color: var(--tp-ink);
}

.post-nav a:hover {
  text-decoration: none;
  border-color: var(--tp-primary);
}

.post-nav .post-nav-hint {
  display: block;
  margin-bottom: 0.2rem;
  color: var(--tp-ink-faint);
  font-size: 0.75rem;
  letter-spacing: 0.08em;
}

.post-nav .post-nav-title {
  font-family: var(--tp-font-serif);
  font-size: 0.98rem;
  line-height: 1.5;
}

.related {
  margin-top: 2.5rem;
}

.related-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.related-list li {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.55rem 0;
  border-bottom: 1px dotted var(--tp-rule);
}

.related-list li:last-child {
  border-bottom: 0;
}

.related-list time {
  flex: none;
  color: var(--tp-ink-faint);
  font-family: var(--tp-font-mono);
  font-size: 0.76rem;
}

/* ---------------------------------------------------------------- 正文 */
.md-body {
  font-size: 1.02rem;
  line-height: 1.78;
  overflow-wrap: break-word;
  word-break: break-word;
}

.md-body > :first-child {
  margin-top: 0;
}

.md-body > :last-child {
  margin-bottom: 0;
}

.md-body h2,
.md-body h3,
.md-body h4 {
  margin: 2.2em 0 0.7em;
  font-family: var(--tp-font-serif);
  scroll-margin-top: 5rem;
}

.md-body h2 {
  font-size: 1.45rem;
  padding-bottom: 0.35rem;
  border-bottom: 1px solid var(--tp-rule);
}

.md-body h3 {
  font-size: 1.2rem;
}

.md-body h4 {
  font-size: 1.05rem;
}

.md-body h2:hover .md-anchor,
.md-body h3:hover .md-anchor {
  opacity: 1;
}

.md-body ul,
.md-body ol {
  margin: 0 0 1em;
  padding-left: 1.5em;
}

.md-body li {
  margin: 0.3em 0;
}

.md-body li > ul,
.md-body li > ol {
  margin: 0.3em 0 0.4em;
}

.md-body blockquote {
  margin: 1.6em 0;
  padding: 0.2em 1.1em;
  border-left: 3px solid var(--tp-accent);
  background: linear-gradient(90deg, var(--tp-paper-alt), transparent 85%);
  color: var(--tp-ink-soft);
}

.md-body blockquote p:last-child {
  margin-bottom: 0;
}

.md-body :not(pre) > code {
  padding: 0.12em 0.38em;
  border-radius: var(--tp-radius-sm);
  background: var(--tp-paper-sink);
  border: 1px solid var(--tp-rule);
  font-family: var(--tp-font-mono);
  font-size: 0.88em;
}

.md-body a {
  border-bottom: 1px solid var(--tp-rule-strong);
  border-bottom-color: color-mix(in srgb, var(--tp-primary) 40%, transparent);
}

.md-body a:hover {
  text-decoration: none;
  border-bottom-color: var(--tp-primary);
}

.md-body img.md-image {
  display: block;
  margin: 1.6em auto;
  border-radius: var(--tp-radius);
  cursor: zoom-in;
}

.md-body hr {
  margin: 2.4em 0;
}

.md-body .md-heading {
  position: relative;
}

/* 代码块：深色底 + 横向滚动；复制按钮由渐进增强脚本接管，无 JS 时只是不响应 */
.md-code {
  margin: 1.7em 0;
  background: var(--tp-code-bg);
  border-radius: var(--tp-radius);
  overflow: hidden;
  box-shadow: var(--tp-shadow);
}

.md-code figcaption {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.45rem 0.8rem;
  border-bottom: 1px solid var(--tp-code-rule);
  color: #9aa3ad;
  font-family: var(--tp-font-mono);
  font-size: 0.74rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.md-copy {
  padding: 0.15rem 0.55rem;
  border: 1px solid var(--tp-code-rule);
  border-radius: var(--tp-radius-sm);
  background: transparent;
  color: #b9c1ca;
  font-family: var(--tp-font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  cursor: pointer;
}

.md-copy:hover {
  color: #fff;
  border-color: #5b6570;
}

.md-copy.is-done {
  color: #8fd6a0;
  border-color: #3f6b4c;
}

.md-code pre {
  margin: 0;
  padding: 1rem 1.1rem;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  color: var(--tp-code-ink);
  font-family: var(--tp-font-mono);
  font-size: 0.86rem;
  line-height: 1.68;
  tab-size: 2;
}

.md-code code {
  font-family: inherit;
  background: none;
  border: 0;
  padding: 0;
}

/* 表格：外层可横向滚动，避免窄屏把正文撑破 */
.md-table-wrap {
  margin: 1.7em 0;
  overflow-x: auto;
  border: 1px solid var(--tp-rule);
  border-radius: var(--tp-radius);
}

.md-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.92rem;
}

.md-table th,
.md-table td {
  padding: 0.6rem 0.85rem;
  border-bottom: 1px solid var(--tp-rule);
  text-align: left;
}

.md-table thead th {
  background: var(--tp-paper-alt);
  font-weight: 650;
  white-space: nowrap;
}

.md-table tbody tr:nth-child(even) {
  background: var(--tp-paper-alt);
  background: color-mix(in srgb, var(--tp-paper-alt) 55%, transparent);
}

.md-table tbody tr:last-child td {
  border-bottom: 0;
}

/* highlight.js 令牌配色（自带，不引外部主题文件） */
.hljs-comment,
.hljs-quote {
  color: #7d8792;
  font-style: italic;
}

.hljs-keyword,
.hljs-selector-tag,
.hljs-literal,
.hljs-doctag {
  color: #c792ea;
}

.hljs-string,
.hljs-regexp,
.hljs-addition,
.hljs-attribute {
  color: #a8d18d;
}

.hljs-number,
.hljs-symbol,
.hljs-bullet {
  color: #f0a86b;
}

.hljs-title,
.hljs-section,
.hljs-name {
  color: #79b8ff;
}

.hljs-attr,
.hljs-variable,
.hljs-template-variable,
.hljs-property {
  color: #e2c08d;
}

.hljs-built_in,
.hljs-type,
.hljs-class .hljs-title {
  color: #6fd1c8;
}

.hljs-meta,
.hljs-selector-id,
.hljs-selector-class {
  color: #e39c9c;
}

.hljs-deletion {
  color: #f0736a;
}

.hljs-emphasis {
  font-style: italic;
}

.hljs-strong {
  font-weight: 700;
}

/* ---------------------------------------------------------------- 评论 */
.comments {
  margin-top: 3rem;
  padding-top: 2rem;
  border-top: 1px solid var(--tp-rule);
}

.comments-title {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  font-family: var(--tp-font-serif);
  font-size: 1.2rem;
  margin-bottom: 1.25rem;
}

.comments-title span {
  color: var(--tp-ink-faint);
  font-family: var(--tp-font-mono);
  font-size: 0.82rem;
}

.comment-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.comment-list .comment-list {
  margin: 1rem 0 0 1.1rem;
  padding-left: 1rem;
  border-left: 1px solid var(--tp-rule);
}

.comment-item {
  padding: 1rem 0;
  border-bottom: 1px solid var(--tp-rule);
}

.comment-item:last-child {
  border-bottom: 0;
}

.comment-head {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.4rem;
}

.comment-avatar {
  flex: none;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--tp-paper-sink);
}

.comment-avatar-fallback {
  display: grid;
  place-items: center;
  flex: none;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--tp-paper-sink);
  color: var(--tp-ink-faint);
  font-size: 0.8rem;
  font-weight: 700;
}

.comment-author {
  color: var(--tp-ink);
  font-weight: 600;
  font-size: 0.92rem;
}

.comment-owner {
  padding: 0 0.35rem;
  border-radius: var(--tp-radius-sm);
  background: var(--tp-primary-soft);
  color: var(--tp-primary);
  font-size: 0.7rem;
  font-weight: 600;
}

.comment-date {
  margin-left: auto;
  color: var(--tp-ink-faint);
  font-family: var(--tp-font-mono);
  font-size: 0.76rem;
}

.comment-body {
  margin: 0;
  color: var(--tp-ink-soft);
  font-size: 0.94rem;
  line-height: 1.72;
  white-space: pre-wrap;
}

.comments-closed,
.notice {
  margin: 1rem 0 0;
  padding: 0.75rem 1rem;
  border-radius: var(--tp-radius);
  font-size: 0.9rem;
}

.comments-closed {
  background: var(--tp-paper-alt);
  color: var(--tp-ink-faint);
  text-align: center;
}

.notice {
  background: var(--tp-primary-soft);
  border: 1px solid var(--tp-rule-strong);
  border-color: color-mix(in srgb, var(--tp-primary) 28%, transparent);
  color: var(--tp-primary);
}

.comment-form {
  margin-top: 2rem;
  padding: 1.35rem 1.4rem;
  background: var(--tp-paper-alt);
  border: 1px solid var(--tp-rule);
  border-radius: var(--tp-radius-lg);
}

.comment-form h3 {
  font-family: var(--tp-font-serif);
  font-size: 1.05rem;
  margin-bottom: 1rem;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: 0.85rem;
}

.form-field {
  margin: 0 0 0.85rem;
  min-width: 0;
}

.form-field label {
  display: block;
  margin-bottom: 0.3rem;
  color: var(--tp-ink-soft);
  font-size: 0.82rem;
}

.form-field .field-hint {
  color: var(--tp-ink-faint);
  font-size: 0.76rem;
}

.form-field input,
.form-field textarea {
  width: 100%;
  padding: 0.55rem 0.7rem;
  border: 1px solid var(--tp-rule-strong);
  border-radius: var(--tp-radius-sm);
  background: var(--tp-paper);
  color: var(--tp-ink);
  font: inherit;
  font-size: 0.92rem;
}

.form-field textarea {
  min-height: 8rem;
  resize: vertical;
  line-height: 1.7;
}

.form-field input::placeholder,
.form-field textarea::placeholder {
  color: var(--tp-ink-faint);
}

.form-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-top: 0.35rem;
}

.btn-primary {
  padding: 0.5rem 1.3rem;
  border: 1px solid var(--tp-ink);
  border-radius: var(--tp-radius-sm);
  background: var(--tp-ink);
  color: var(--tp-paper);
  font-size: 0.92rem;
  cursor: pointer;
}

.btn-primary:hover {
  background: var(--tp-primary);
  border-color: var(--tp-primary);
}

.btn-ghost {
  padding: 0.45rem 1rem;
  border: 1px solid var(--tp-rule-strong);
  border-radius: var(--tp-radius-sm);
  background: transparent;
  color: var(--tp-ink-soft);
  font-size: 0.9rem;
  cursor: pointer;
}

/* 蜜罐字段：正常用户看不见、读屏也跳过，但表单会提交 */
.hp-field {
  position: absolute;
  left: -9999px;
  width: 1px;
  height: 1px;
  overflow: hidden;
}

.turnstile-slot {
  margin: 0.5rem 0 1rem;
}

/* ---------------------------------------------------------------- 归档 */
.timeline {
  margin: 0;
  padding: 0;
  list-style: none;
}

.timeline-year {
  margin-bottom: 2.25rem;
}

.timeline-year-head {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  margin-bottom: 0.6rem;
  padding-bottom: 0.4rem;
  border-bottom: 1px solid var(--tp-rule);
}

.timeline-year-head h2 {
  margin: 0;
  font-family: var(--tp-font-mono);
  font-size: 1.15rem;
  letter-spacing: 0.04em;
}

.timeline-year-head span {
  color: var(--tp-ink-faint);
  font-size: 0.8rem;
}

.timeline-items {
  margin: 0;
  padding: 0;
  list-style: none;
}

.timeline-items li {
  display: flex;
  align-items: baseline;
  gap: 1rem;
  padding: 0.45rem 0;
  border-bottom: 1px dotted var(--tp-rule);
}

.timeline-items li:last-child {
  border-bottom: 0;
}

.timeline-date {
  flex: none;
  width: 3.4rem;
  color: var(--tp-ink-faint);
  font-family: var(--tp-font-mono);
  font-size: 0.8rem;
}

.timeline-link {
  color: var(--tp-ink);
}

.timeline-link:hover {
  color: var(--tp-primary);
}

.timeline-comments {
  margin-left: auto;
  color: var(--tp-ink-faint);
  font-family: var(--tp-font-mono);
  font-size: 0.76rem;
}

/* ---------------------------------------------------------------- 分类 / 标签页 */
.term-header {
  margin-bottom: 2rem;
  padding-bottom: 1.25rem;
  border-bottom: 1px solid var(--tp-rule);
}

.term-kind {
  display: inline-block;
  margin-bottom: 0.4rem;
  color: var(--tp-ink-faint);
  font-size: 0.76rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.term-name {
  font-family: var(--tp-font-serif);
  font-size: clamp(1.5rem, 3.2vw, 2rem);
  margin-bottom: 0.4rem;
}

.term-desc {
  margin: 0;
  color: var(--tp-ink-soft);
  font-size: 0.95rem;
  max-width: 60ch;
}

.term-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
  margin: 1rem 0 0;
}

.term-nav-group {
  min-width: 10rem;
}

.term-nav-title {
  display: block;
  margin-bottom: 0.35rem;
  color: var(--tp-ink-faint);
  font-size: 0.76rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

/* ---------------------------------------------------------------- 瞬间 */
.moment-list {
  display: grid;
  gap: 1rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.moment-card {
  padding: 1.1rem 1.25rem;
  background: var(--tp-paper-alt);
  border: 1px solid var(--tp-rule);
  border-radius: var(--tp-radius-lg);
}

.moment-card-head {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.moment-card-head h2 {
  margin: 0;
  font-family: var(--tp-font-serif);
  font-size: 1.05rem;
}

.moment-card-head time {
  margin-left: auto;
  color: var(--tp-ink-faint);
  font-family: var(--tp-font-mono);
  font-size: 0.78rem;
}

.moment-body {
  margin: 0;
  color: var(--tp-ink-soft);
  font-size: 0.95rem;
}

.moment-foot {
  margin-top: 0.65rem;
  font-size: 0.82rem;
}

/* ---------------------------------------------------------------- 项目 */
.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
  gap: 1.25rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.project-card {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--tp-paper);
  border: 1px solid var(--tp-rule);
  border-radius: var(--tp-radius-lg);
  overflow: hidden;
  transition: border-color 0.2s ease, transform 0.2s ease;
}

.project-card:hover {
  border-color: var(--tp-rule-strong);
  transform: translateY(-2px);
}

.project-cover {
  display: block;
  aspect-ratio: 16 / 9;
  background: var(--tp-paper-sink);
}

.project-cover img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.project-body {
  padding: 0.9rem 1rem 1.05rem;
}

.project-title {
  margin: 0 0 0.35rem;
  font-family: var(--tp-font-serif);
  font-size: 1.05rem;
}

.project-title a {
  color: var(--tp-ink);
}

.project-excerpt {
  margin: 0;
  color: var(--tp-ink-soft);
  font-size: 0.88rem;
  line-height: 1.65;
}

.project-foot {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  padding: 0 1rem 1rem;
  margin-top: auto;
}

/* ---------------------------------------------------------------- 搜索 */
.search-form {
  display: flex;
  gap: 0.6rem;
  margin: 0 0 1.75rem;
}

.search-form .form-field {
  flex: 1;
  margin: 0;
}

.search-form input[type="search"] {
  width: 100%;
  padding: 0.6rem 0.85rem;
  border: 1px solid var(--tp-rule-strong);
  border-radius: var(--tp-radius-sm);
  background: var(--tp-paper);
  color: var(--tp-ink);
  font: inherit;
}

.search-form button {
  align-self: flex-end;
}

.search-summary {
  margin: 0 0 1.25rem;
  color: var(--tp-ink-faint);
  font-size: 0.86rem;
}

.search-summary strong {
  color: var(--tp-ink);
}

.search-result {
  padding: 1rem 0;
  border-bottom: 1px solid var(--tp-rule);
}

.search-result:last-child {
  border-bottom: 0;
}

.search-result h2 {
  margin: 0 0 0.3rem;
  font-family: var(--tp-font-serif);
  font-size: 1.1rem;
}

.search-result h2 a {
  color: var(--tp-ink);
}

.search-result p {
  margin: 0;
  color: var(--tp-ink-soft);
  font-size: 0.92rem;
}

/* ---------------------------------------------------------------- 错误页 */
.error-page {
  max-width: 34rem;
  margin: 4rem auto;
  text-align: center;
}

.error-code {
  font-family: var(--tp-font-mono);
  font-size: clamp(3rem, 12vw, 5.5rem);
  font-weight: 700;
  line-height: 1;
  color: var(--tp-rule-strong);
  letter-spacing: -0.03em;
}

.error-title {
  margin: 0.75rem 0 0.5rem;
  font-family: var(--tp-font-serif);
  font-size: 1.5rem;
}

.error-message {
  color: var(--tp-ink-soft);
  margin-bottom: 1.5rem;
}

/* ---------------------------------------------------------------- 页脚 */
.site-footer {
  border-top: 1px solid var(--tp-rule);
  background: var(--tp-paper-alt);
}

.site-footer-inner {
  width: 100%;
  max-width: var(--tp-page);
  margin: 0 auto;
  padding: 2rem 1.5rem;
  font-size: 0.85rem;
  color: var(--tp-ink-soft);
}

.footer-top {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.85rem;
}

.footer-brand {
  font-family: var(--tp-font-serif);
  font-size: 1rem;
  font-weight: 650;
  color: var(--tp-ink);
}

.footer-social {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 1rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.footer-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 1rem;
  margin: 0;
  padding: 0;
  list-style: none;
  color: var(--tp-ink-faint);
  font-size: 0.8rem;
}

.footer-meta a {
  color: var(--tp-ink-faint);
}

.footer-meta a:hover {
  color: var(--tp-primary);
}

.site-colophon {
  margin: 0.85rem 0 0;
  color: var(--tp-ink-faint);
  font-size: 0.76rem;
  letter-spacing: 0.02em;
}

/* ---------------------------------------------------------------- 灯箱（脚本注入） */
.tp-lightbox {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: none;
  place-items: center;
  padding: 2rem;
  background: rgba(18, 18, 17, 0.9);
}

.tp-lightbox.is-open {
  display: grid;
}

.tp-lightbox-inner {
  position: relative;
  max-width: min(1100px, 100%);
  max-height: 100%;
}

.tp-lightbox-img {
  display: block;
  max-width: 100%;
  max-height: calc(100vh - 6rem);
  margin: 0 auto;
  border-radius: var(--tp-radius);
}

.tp-lightbox-close {
  position: absolute;
  top: -2.5rem;
  right: 0;
  padding: 0.3rem 0.8rem;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: var(--tp-radius-sm);
  background: transparent;
  color: #f2efe9;
  font-size: 0.85rem;
  cursor: pointer;
}

/* ---------------------------------------------------------------- 工具类 */
.visually-hidden {
  position: absolute !important;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

.stack > * + * {
  margin-top: 1rem;
}

.text-soft {
  color: var(--tp-ink-soft);
}

/* ---------------------------------------------------------------- 暗色 */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    --tp-paper: #16181a;
    --tp-paper-alt: #1d2023;
    --tp-paper-sink: #24282c;
    --tp-ink: #eae6de;
    --tp-ink-soft: #b3ada2;
    --tp-ink-faint: #837d73;
    --tp-rule: #2b2f34;
    --tp-rule-strong: #3a4047;
    --tp-primary: var(--tp-primary-dark, #8fb6cf);
    --tp-primary-soft: rgba(143, 182, 207, 0.12);
    --tp-accent: var(--tp-accent-dark, #d97757);
    --tp-shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 10px 30px -18px rgba(0, 0, 0, 0.8);
    color-scheme: dark;
  }
}

:root[data-theme="dark"] {
  --tp-paper: #16181a;
  --tp-paper-alt: #1d2023;
  --tp-paper-sink: #24282c;
  --tp-ink: #eae6de;
  --tp-ink-soft: #b3ada2;
  --tp-ink-faint: #837d73;
  --tp-rule: #2b2f34;
  --tp-rule-strong: #3a4047;
  --tp-primary: var(--tp-primary-dark, #8fb6cf);
  --tp-primary-soft: rgba(143, 182, 207, 0.12);
  --tp-accent: var(--tp-accent-dark, #d97757);
  --tp-shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 10px 30px -18px rgba(0, 0, 0, 0.8);
  color-scheme: dark;
}

/* 用户显式选了浅色时，压过系统偏好 */
:root[data-theme="light"] {
  color-scheme: light;
}

/* ---------------------------------------------------------------- 响应式 */
@media (max-width: 1024px) {
  .tp-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .sidebar {
    position: static;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: 1.5rem;
    margin-top: 2.5rem;
    padding-top: 1.75rem;
    border-top: 1px solid var(--tp-rule);
  }

  .widget {
    border-bottom: 0;
    padding-bottom: 0;
  }

  .post-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .post-aside {
    position: static;
    order: -1;
    margin-bottom: 1.5rem;
  }
}

@media (max-width: 768px) {
  body {
    font-size: 16px;
  }

  .tp-main {
    padding: 1.5rem 1.1rem 3rem;
  }

  .site-header-inner {
    flex-wrap: wrap;
    gap: 0.6rem;
    padding: 0.7rem 1.1rem;
  }

  .brand {
    font-size: 1.05rem;
  }

  .site-nav {
    order: 3;
    width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .site-nav ul {
    gap: 0;
  }

  .site-nav a,
  .site-nav .nav-summary {
    padding: 0.3rem 0.5rem;
    font-size: 0.88rem;
  }

  .nav-sub ul {
    right: auto;
    left: 0;
  }

  .post-card.has-cover {
    grid-template-columns: minmax(0, 1fr);
  }

  .post-card-cover {
    order: 0;
    aspect-ratio: 16 / 9;
  }

  .post-card-title {
    font-size: 1.24rem;
  }

  .hero {
    padding-top: 0.75rem;
  }

  .hero-stats {
    gap: 0.3rem 1rem;
    font-size: 0.8rem;
  }

  .md-body {
    font-size: 1rem;
  }

  .md-code pre {
    font-size: 0.82rem;
  }

  .comment-list .comment-list {
    margin-left: 0.5rem;
    padding-left: 0.7rem;
  }

  .comment-form {
    padding: 1rem;
  }

  .pager {
    flex-direction: column;
    align-items: flex-start;
  }

  .timeline-items li {
    gap: 0.6rem;
  }

  .timeline-comments {
    display: none;
  }

  .site-footer-inner {
    padding: 1.5rem 1.1rem;
  }
}

/* ---------------------------------------------------------------- 打印 */
@media print {
  :root {
    --tp-paper: #fff;
    --tp-ink: #000;
    --tp-ink-soft: #333;
    --tp-ink-faint: #666;
  }

  .site-header,
  .site-nav,
  .sidebar,
  .post-aside,
  .site-footer,
  .pager,
  .comments,
  .comment-form,
  .tp-lightbox,
  .theme-toggle,
  .post-nav,
  .related,
  .tp-skip {
    display: none !important;
  }

  body {
    background: #fff;
    font-size: 11pt;
  }

  .tp-main {
    max-width: none;
    padding: 0;
  }

  .post-layout,
  .tp-layout {
    display: block;
  }

  .md-code {
    background: #f4f4f4;
    box-shadow: none;
    border: 1px solid #ddd;
  }

  .md-code pre,
  .md-code figcaption {
    color: #000;
  }

  .md-copy {
    display: none;
  }

  .md-body a::after {
    content: " (" attr(href) ")";
    font-size: 0.8em;
    color: #555;
  }
}
`;

/**
 * 主题设置覆盖层：把用户配色与版心宽度注入 `:root`。
 *
 * 只输出单个 `:root { ... }` 块；所有值都经过白名单/夹取，不能让设置值逃逸出这个块
 * （`<style>` 是原始文本元素，浏览器不会对其中内容做实体解码）。
 */
export function buildRootCss(ctx: ThemeContext): string {
  const primary = color(ctx, "primaryColor", "#24435a");
  const accent = color(ctx, "accentColor", "#a8422d");
  const width = num(ctx, "contentWidth", 720, 560, 1080);
  const font = bodyFont(ctx);

  // 只写"源变量"：浅色模式用 base，暗色模式用派生出来的亮版本，
  // 这样用户在浅色下挑的深色强调色不会在暗色背景上糊成一片。
  const lines = [
    ":root {",
    `  --tp-primary-base: ${primary};`,
    `  --tp-primary-dark: ${lighten(primary)};`,
    `  --tp-accent-base: ${accent};`,
    `  --tp-accent-dark: ${lighten(accent)};`,
    `  --tp-width: ${width}px;`,
    `  --tp-font-body: ${font};`,
    "}",
  ];
  return lines.join("\n");
}

/**
 * 渐进增强脚本。
 *
 * 设计底线：JS 关闭时页面必须完全可读可用。
 * 因此这里只做四件"锦上添花"的事——暗色切换、目录折叠提示、代码复制、图片灯箱；
 * 目录折叠用原生 <details>，脚本不参与；评论、分页、搜索全是普通表单与链接。
 */
export const SCRIPTS = `
(function () {
  var root = document.documentElement;
  var STORE_KEY = "tp-color-scheme";

  /* 暗色切换：按钮默认 hidden，只有脚本能跑时才显示，避免出现点了没反应的死控件 */
  var toggle = document.getElementById("tp-theme-toggle");
  if (toggle) {
    var stored = null;
    try {
      stored = window.localStorage.getItem(STORE_KEY);
    } catch (err) {
      stored = null;
    }
    if (stored === "dark" || stored === "light") {
      root.setAttribute("data-theme", stored);
    }
    var prefersDark = function () {
      return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    };
    var sync = function () {
      var isDark = root.getAttribute("data-theme")
        ? root.getAttribute("data-theme") === "dark"
        : prefersDark();
      toggle.setAttribute("aria-pressed", isDark ? "true" : "false");
      toggle.setAttribute("aria-label", isDark ? "切换到浅色模式" : "切换到深色模式");
    };
    toggle.hidden = false;
    sync();
    toggle.addEventListener("click", function () {
      var current = root.getAttribute("data-theme");
      var next = current === "dark" ? "light" : current === "light" ? "dark" : prefersDark() ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try {
        window.localStorage.setItem(STORE_KEY, next);
      } catch (err) {
        /* 隐私模式下 localStorage 可能抛错，切换本身仍然生效 */
      }
      sync();
    });
  }

  /* 代码复制 */
  var copyButtons = document.querySelectorAll(".md-copy[data-copy]");
  for (var i = 0; i < copyButtons.length; i++) {
    (function (button) {
      button.addEventListener("click", function () {
        var figure = button.closest(".md-code");
        var code = figure ? figure.querySelector("pre code") : null;
        if (!code) return;
        var text = code.textContent || "";
        var done = function () {
          var original = "复制";
          button.textContent = "已复制";
          button.classList.add("is-done");
          window.setTimeout(function () {
            button.textContent = original;
            button.classList.remove("is-done");
          }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, function () {});
          return;
        }
        /* 老浏览器 / 非安全上下文回退 */
        var area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "readonly");
        area.style.position = "fixed";
        area.style.top = "-1000px";
        document.body.appendChild(area);
        area.select();
        try {
          document.execCommand("copy");
          done();
        } catch (err) {
          /* 复制失败时不做破坏性提示 */
        }
        document.body.removeChild(area);
      });
    })(copyButtons[i]);
  }

  /* 图片灯箱：只增强正文图片，键盘也能打开（Enter / 空格） */
  var lightbox = null;
  var closeLightbox = function () {
    if (!lightbox) return;
    lightbox.classList.remove("is-open");
    document.body.style.removeProperty("overflow");
  };
  var openLightbox = function (src, alt) {
    if (!lightbox) {
      lightbox = document.createElement("div");
      lightbox.className = "tp-lightbox";
      lightbox.setAttribute("role", "dialog");
      lightbox.setAttribute("aria-modal", "true");
      lightbox.setAttribute("aria-label", "图片预览");

      var inner = document.createElement("div");
      inner.className = "tp-lightbox-inner";

      var image = document.createElement("img");
      image.className = "tp-lightbox-img";
      image.alt = "";

      var close = document.createElement("button");
      close.type = "button";
      close.className = "tp-lightbox-close";
      close.textContent = "关闭";

      inner.appendChild(image);
      inner.appendChild(close);
      lightbox.appendChild(inner);
      document.body.appendChild(lightbox);

      lightbox.__image = image;
      close.addEventListener("click", closeLightbox);
      lightbox.addEventListener("click", function (event) {
        if (event.target === lightbox) closeLightbox();
      });
      document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") closeLightbox();
      });
    }
    lightbox.__image.src = src;
    lightbox.__image.alt = alt || "";
    lightbox.classList.add("is-open");
    document.body.style.overflow = "hidden";
    var closeButton = lightbox.querySelector(".tp-lightbox-close");
    if (closeButton) closeButton.focus();
  };

  var images = document.querySelectorAll(".md-body img.md-image");
  for (var j = 0; j < images.length; j++) {
    (function (image) {
      image.setAttribute("tabindex", "0");
      image.setAttribute("role", "button");
      image.addEventListener("click", function () {
        openLightbox(image.currentSrc || image.src, image.alt);
      });
      image.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openLightbox(image.currentSrc || image.src, image.alt);
        }
      });
    })(images[j]);
  }
})();
`;

/** 主题设置项声明，manifest 与后台「外观」表单共用。 */
export const SETTINGS: ThemeSettingField[] = [
  {
    key: "primaryColor",
    label: "主色（链接与强调）",
    type: "color",
    default: "#24435a",
    help: "十六进制色值，例如 #24435a。文字色由主题按可读性自动配对。",
  },
  {
    key: "accentColor",
    label: "点缀色（引用条、置顶标）",
    type: "color",
    default: "#a8422d",
  },
  {
    key: "bodyFont",
    label: "正文字体",
    type: "select",
    default: "sans",
    options: [
      { value: "sans", label: "黑体（无衬线）" },
      { value: "serif", label: "宋体（衬线，长文更稳）" },
      { value: "kai", label: "楷体" },
    ],
    help: "只使用系统已装字体，不请求远程字体，离线可用。",
  },
  {
    key: "contentWidth",
    label: "正文版心宽度（像素）",
    type: "number",
    default: 720,
    min: 560,
    max: 1080,
    help: "约 72ch 的中文阅读宽度；超出范围会按上下限夹取。",
  },
  {
    key: "showToc",
    label: "文章页显示目录",
    type: "boolean",
    default: true,
    help: "仅当正文含二级及以上标题时输出。",
  },
  {
    key: "showReadingTime",
    label: "显示阅读时长与字数",
    type: "boolean",
    default: true,
  },
  {
    key: "heroTitle",
    label: "首页主标题",
    type: "text",
    default: "纸上写字，慢慢读",
    help: "留空则回落到站点标题。",
  },
  {
    key: "heroSubtitle",
    label: "首页副标题",
    type: "textarea",
    default: "这里放长文、笔记与零散的想法。没有推荐算法，只有时间顺序。",
    help: "留空则不显示。",
  },
  {
    key: "footerNote",
    label: "页脚补充说明",
    type: "text",
    default: "",
    help: "留空则只显示站点信息与备案号。",
  },
  {
    key: "enableDarkMode",
    label: "启用暗色切换按钮",
    type: "boolean",
    default: true,
    help: "关闭后仍会跟随系统的 prefers-color-scheme。",
  },
  {
    key: "showSidebar",
    label: "首页显示侧栏",
    type: "boolean",
    default: true,
  },
];
