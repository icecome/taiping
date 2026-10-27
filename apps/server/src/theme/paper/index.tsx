/**
 * 主题「素纸」（paper）—— 极简 zine。
 *
 * 存在意义有两个：
 * 1. 可用性演示：换主题只改"显示层"，同一份 view model 能渲染出完全不同的版式；
 * 2. 一个真实能用的极简主题：单列、无侧栏、无目录、无花活。
 *
 * 刻意放在一个文件里（约 400 行），不拆模块：极简主题的价值就是"一眼能读完"。
 * 主题不 import 兄弟主题的任何代码，两个主题互不依赖，删掉任一个都不影响另一个。
 */
import type { Child } from "hono/jsx";
import type { JSX as HonoJSX } from "hono/jsx/jsx-runtime";
import { raw } from "hono/html";
import type {
  ArchiveView,
  CommentNode,
  ContentSummary,
  ContentDetail,
  ErrorView,
  HomeView,
  MomentView,
  NavLink,
  PageMeta,
  PageView,
  PaginationView,
  PostView,
  ProjectView,
  SearchView,
  TermView,
  Theme,
  ThemeContext,
  ThemeManifest,
  ThemeSettingField,
} from "../types";

/* ================================================================ 设置读取 */

function text(ctx: ThemeContext, key: string, fallback: string): string {
  const value = ctx.settings[key];
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  return fallback;
}

function number(ctx: ThemeContext, key: string, fallback: number, min: number, max: number): number {
  const value = ctx.settings[key];
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function toggle(ctx: ThemeContext, key: string, fallback: boolean): boolean {
  const value = ctx.settings[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true" || value === "1" || value === "on";
  return fallback;
}

/** 把十六进制色按比例混白：暗色背景上复用同一个强调色需要更亮的版本。 */
function lighten(hex: string, amount = 0.42): string {
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex);
  if (!match) return hex;
  let body = match[1]!;
  if (body.length === 3) {
    body = body
      .split("")
      .map((char) => char + char)
      .join("");
  }
  const value = Number.parseInt(body, 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  const mixed = channels
    .map((channel) => Math.round(channel + (255 - channel) * amount))
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("");
  return `#${mixed}`;
}

/** 只接受十六进制色值：值会拼进 <style>，必须白名单。 */
function accentColor(ctx: ThemeContext): string {
  const value = text(ctx, "accentColor", "#1a6f5a");
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value) ? value : "#1a6f5a";
}

/* ================================================================ 格式化 */

function isoDay(value: string | null): string {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function yearOf(value: string | null): string {
  return isoDay(value).slice(0, 4);
}

function clip(value: string, limit: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length <= limit ? clean : `${clean.slice(0, limit).trimEnd()}…`;
}

/* ================================================================ 样式 */

const STYLES = `
:root {
  --p-ink: #1a1a1a;
  --p-muted: #6f6f6f;
  --p-faint: #9a9a9a;
  --p-line: #e4e2dd;
  --p-bg: #fdfcf9;
  --p-accent: var(--p-accent-light, #1a6f5a);
  --p-width: 40rem;
  color-scheme: light;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

html {
  -webkit-text-size-adjust: 100%;
}

body {
  margin: 0;
  background: var(--p-bg);
  color: var(--p-ink);
  font-family: "Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, -apple-system, sans-serif;
  font-size: 16.5px;
  line-height: 1.8;
  -webkit-font-smoothing: antialiased;
}

a {
  color: var(--p-accent);
  text-decoration: none;
  text-underline-offset: 0.16em;
}

a:hover {
  text-decoration: underline;
}

a:focus-visible,
button:focus-visible,
input:focus-visible,
textarea:focus-visible,
summary:focus-visible {
  outline: 2px solid var(--p-accent);
  outline-offset: 2px;
}

h1,
h2,
h3,
h4 {
  font-weight: 600;
  line-height: 1.4;
  margin: 0 0 0.6em;
}

p {
  margin: 0 0 1em;
}

img {
  max-width: 100%;
  height: auto;
}

hr {
  border: 0;
  border-top: 1px solid var(--p-line);
  margin: 2rem 0;
}

::selection {
  background: var(--p-accent);
  color: #fff;
}

.shell {
  width: 100%;
  max-width: var(--p-width);
  margin: 0 auto;
  padding: 0 1.25rem;
}

.top {
  padding: 2.5rem 0 1.5rem;
  border-bottom: 1px solid var(--p-line);
  margin-bottom: 2.5rem;
}

.top-brand {
  display: inline-block;
  font-size: 1.3rem;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: var(--p-ink);
}

.top-brand:hover {
  color: var(--p-accent);
  text-decoration: none;
}

.top-desc {
  margin: 0.4rem 0 0;
  color: var(--p-muted);
  font-size: 0.9rem;
}

.top-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem 1.1rem;
  margin: 0.9rem 0 0;
  padding: 0;
  list-style: none;
  font-size: 0.92rem;
}

.top-nav a {
  color: var(--p-muted);
}

.top-nav a[aria-current="page"] {
  color: var(--p-ink);
  border-bottom: 1px solid var(--p-accent);
}

.foot {
  margin-top: 4rem;
  padding: 1.75rem 0 3rem;
  border-top: 1px solid var(--p-line);
  color: var(--p-faint);
  font-size: 0.82rem;
}

.foot p {
  margin: 0 0 0.4rem;
}

.foot-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem 1rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.page-title {
  font-size: 1.5rem;
  margin-bottom: 0.4rem;
}

.page-desc {
  color: var(--p-muted);
  font-size: 0.92rem;
  margin-bottom: 2rem;
  padding-bottom: 1.1rem;
  border-bottom: 1px solid var(--p-line);
}

.list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.list-item {
  padding: 1.15rem 0;
  border-bottom: 1px solid var(--p-line);
}

.list-item:last-child {
  border-bottom: 0;
}

.list-date {
  display: block;
  color: var(--p-faint);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.78rem;
  letter-spacing: 0.04em;
}

.list-title {
  display: block;
  margin: 0.1rem 0 0.3rem;
  font-size: 1.12rem;
  font-weight: 600;
  color: var(--p-ink);
}

.list-title:hover {
  color: var(--p-accent);
  text-decoration: none;
}

.list-excerpt {
  margin: 0;
  color: var(--p-muted);
  font-size: 0.92rem;
}

.meta {
  margin: 0.4rem 0 0;
  color: var(--p-faint);
  font-size: 0.78rem;
}

.meta span + span::before {
  content: " · ";
}

.post {
  margin-bottom: 3rem;
}

.post h1 {
  font-size: 1.7rem;
  margin-bottom: 0.5rem;
}

.post-head {
  padding-bottom: 1.25rem;
  margin-bottom: 1.75rem;
  border-bottom: 1px solid var(--p-line);
}

.body {
  overflow-wrap: break-word;
}

.body h2 {
  font-size: 1.28rem;
  margin: 2.2em 0 0.6em;
}

.body h3 {
  font-size: 1.1rem;
  margin: 1.9em 0 0.5em;
}

.body ul,
.body ol {
  padding-left: 1.35em;
  margin: 0 0 1em;
}

.body li {
  margin: 0.25em 0;
}

.body blockquote {
  margin: 1.6em 0;
  padding: 0 0 0 1em;
  border-left: 2px solid var(--p-accent);
  color: var(--p-muted);
}

.body :not(pre) > code {
  padding: 0.1em 0.3em;
  background: #f1efe9;
  border-radius: 3px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.88em;
}

.body img.md-image {
  display: block;
  margin: 1.5em auto;
  border-radius: 4px;
}

.body .md-code {
  margin: 1.6em 0;
  background: #17191b;
  border-radius: 6px;
  overflow: hidden;
}

.body .md-code figcaption {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.35rem 0.7rem;
  color: #9aa1a8;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.72rem;
  border-bottom: 1px solid #262a2e;
}

.body .md-copy {
  display: none;
  padding: 0.1rem 0.5rem;
  border: 1px solid #333a40;
  border-radius: 3px;
  background: transparent;
  color: #b7bfc6;
  font-size: 0.72rem;
  cursor: pointer;
}

.body .md-code pre {
  margin: 0;
  padding: 0.9rem 1rem;
  overflow-x: auto;
  color: #e6e2da;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.84rem;
  line-height: 1.65;
}

.body .md-code code {
  background: none;
  padding: 0;
}

.body .md-table-wrap {
  margin: 1.6em 0;
  overflow-x: auto;
  border: 1px solid var(--p-line);
  border-radius: 4px;
}

.body .md-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.body .md-table th,
.body .md-table td {
  padding: 0.5rem 0.7rem;
  border-bottom: 1px solid var(--p-line);
  text-align: left;
}

.body .md-table tbody tr:nth-child(even) {
  background: #f7f5f0;
}

.hljs-comment,
.hljs-quote {
  color: #7d8792;
  font-style: italic;
}

.hljs-keyword,
.hljs-literal,
.hljs-selector-tag {
  color: #c792ea;
}

.hljs-string,
.hljs-attribute,
.hljs-addition {
  color: #a8d18d;
}

.hljs-number,
.hljs-symbol {
  color: #f0a86b;
}

.hljs-title,
.hljs-section,
.hljs-name {
  color: #79b8ff;
}

.hljs-attr,
.hljs-variable,
.hljs-property {
  color: #e2c08d;
}

.hljs-built_in,
.hljs-type {
  color: #6fd1c8;
}

.note {
  margin: 1rem 0;
  padding: 0.6rem 0.9rem;
  background: #f5f3ee;
  border-radius: 4px;
  color: var(--p-muted);
  font-size: 0.9rem;
}

.pager {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: 2.5rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--p-line);
  font-size: 0.86rem;
}

.pager-pages {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.pager-pages [aria-current="page"] {
  color: var(--p-ink);
  font-weight: 700;
}

.comments {
  margin-top: 3rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--p-line);
}

.comments h2 {
  font-size: 1.1rem;
}

.comment-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.comment-list .comment-list {
  margin-left: 1rem;
  padding-left: 0.9rem;
  border-left: 1px solid var(--p-line);
}

.comment {
  padding: 0.85rem 0;
  border-bottom: 1px solid var(--p-line);
}

.comment:last-child {
  border-bottom: 0;
}

.comment-head {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  font-size: 0.86rem;
}

.comment-author {
  font-weight: 600;
}

.comment-owner {
  color: var(--p-accent);
  font-size: 0.72rem;
}

.comment-date {
  margin-left: auto;
  color: var(--p-faint);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.74rem;
}

.comment-body {
  margin: 0.3rem 0 0;
  color: var(--p-muted);
  font-size: 0.92rem;
  white-space: pre-wrap;
}

.form {
  margin-top: 1.75rem;
}

.form h3 {
  font-size: 1rem;
  margin-bottom: 0.75rem;
}

.field {
  margin: 0 0 0.7rem;
}

.field label {
  display: block;
  margin-bottom: 0.25rem;
  color: var(--p-muted);
  font-size: 0.82rem;
}

.field input,
.field textarea {
  width: 100%;
  padding: 0.45rem 0.6rem;
  border: 1px solid #d5d2ca;
  border-radius: 3px;
  background: #fff;
  color: var(--p-ink);
  font: inherit;
  font-size: 0.92rem;
}

.field textarea {
  min-height: 7rem;
  resize: vertical;
}

.form-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  gap: 0.7rem;
}

.submit {
  padding: 0.45rem 1.1rem;
  border: 1px solid var(--p-ink);
  border-radius: 3px;
  background: var(--p-ink);
  color: var(--p-bg);
  font-size: 0.9rem;
  cursor: pointer;
}

.submit:hover {
  background: var(--p-accent);
  border-color: var(--p-accent);
}

.hp {
  position: absolute;
  left: -9999px;
  width: 1px;
  height: 1px;
  overflow: hidden;
}

.search-row {
  display: flex;
  gap: 0.6rem;
  margin-bottom: 1.5rem;
}

.search-row .field {
  flex: 1;
  margin: 0;
}

.moment-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.moment {
  padding: 1rem 0;
  border-bottom: 1px solid var(--p-line);
}

.moment-date {
  color: var(--p-faint);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.76rem;
}

.moment h2 {
  font-size: 1.02rem;
  margin: 0.15rem 0 0.3rem;
}

.project-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  gap: 1.25rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.project h2 {
  font-size: 1.05rem;
  margin-bottom: 0.25rem;
}

.project p {
  color: var(--p-muted);
  font-size: 0.9rem;
  margin: 0;
}

.timeline {
  margin: 0;
  padding: 0;
  list-style: none;
}

.timeline-year {
  margin: 0 0 1.75rem;
}

.timeline-year h2 {
  font-size: 0.95rem;
  color: var(--p-muted);
  letter-spacing: 0.08em;
  margin-bottom: 0.4rem;
}

.timeline-items {
  margin: 0;
  padding: 0;
  list-style: none;
}

.timeline-items li {
  display: flex;
  gap: 0.9rem;
  padding: 0.35rem 0;
  font-size: 0.95rem;
}

.timeline-items .d {
  flex: none;
  width: 3rem;
  color: var(--p-faint);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.78rem;
}

.error {
  padding: 4rem 0;
  text-align: center;
}

.error-code {
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 3.5rem;
  color: var(--p-line);
  line-height: 1;
}

.error h1 {
  font-size: 1.3rem;
  margin: 0.6rem 0 0.4rem;
}

.error p {
  color: var(--p-muted);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

@media (prefers-color-scheme: dark) {
  :root {
    --p-ink: #e8e5df;
    --p-muted: #a9a49b;
    --p-faint: #7c776f;
    --p-line: #2c2f31;
    --p-bg: #16181a;
    --p-accent: var(--p-accent-dark, #7fc4ae);
    color-scheme: dark;
  }

  .field input,
  .field textarea {
    background: #1d2023;
    border-color: #343a3e;
  }

  .note,
  .body :not(pre) > code {
    background: #1f2224;
  }

  .body .md-table tbody tr:nth-child(even) {
    background: #1c1f21;
  }
}

@media print {
  .top-nav,
  .foot,
  .comments,
  .pager {
    display: none !important;
  }

  body {
    background: #fff;
    color: #000;
  }
}
`;

const SETTINGS: ThemeSettingField[] = [
  {
    key: "accentColor",
    label: "强调色",
    type: "color",
    default: "#1a6f5a",
    help: "链接与引用条的颜色，只接受十六进制值。",
  },
  {
    key: "maxWidth",
    label: "内容最大宽度（像素）",
    type: "number",
    default: 640,
    min: 480,
    max: 900,
    help: "单列文本的版心宽度，默认约 40rem。",
  },
  {
    key: "showMeta",
    label: "显示日期与阅读信息",
    type: "boolean",
    default: true,
  },
];

/* ================================================================ 片段 */

function isActive(currentPath: string, href: string): boolean {
  if (!href || /^[a-z]+:\/\//i.test(href)) return false;
  const strip = (value: string): string => {
    const path = (value.split("#")[0] ?? "").split("?")[0] ?? "";
    return path.replace(/\/+$/, "") || "/";
  };
  const current = strip(currentPath);
  const target = strip(href);
  if (target === "/") return current === "/";
  return current === target || current.startsWith(`${target}/`);
}

function TopNav({ ctx }: { ctx: ThemeContext }) {
  if (ctx.nav.length === 0) return null;
  const flatten = (items: NavLink[]): NavLink[] => {
    const out: NavLink[] = [];
    for (const item of items) {
      out.push(item);
      if (item.children.length > 0) out.push(...flatten(item.children));
    }
    return out;
  };
  return (
    <nav aria-label="主导航">
      <ul class="top-nav">
        {flatten(ctx.nav).map((item) => (
          <li>
            <a
              href={item.href}
              target={item.target}
              rel={item.target === "_blank" ? "noopener noreferrer" : undefined}
              aria-current={isActive(ctx.currentPath, item.href) ? "page" : undefined}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Footer({ ctx }: { ctx: ThemeContext }) {
  const { identity } = ctx;
  return (
    <footer class="foot">
      <p>
        {identity.footerText ? identity.footerText : `© ${new Date().getUTCFullYear()} ${identity.title}`}
        {identity.copyright ? ` · ${identity.copyright}` : ""}
      </p>
      <ul class="foot-links">
        {identity.icpNumber ? (
          <li>
            <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">
              {identity.icpNumber}
            </a>
          </li>
        ) : null}
        {identity.policeNumber ? <li>{identity.policeNumber}</li> : null}
        <li>
          <a href={`${ctx.basePath}/rss.xml`}>RSS</a>
        </li>
        {identity.socialLinks.map((link) => (
          <li>
            <a href={link.href} target="_blank" rel="noopener noreferrer">
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </footer>
  );
}

function Layout(ctx: ThemeContext, meta: PageMeta, children: Child) {
  const { identity } = ctx;
  const siteTitle = identity.title || "";
  const title = meta.title && meta.title !== siteTitle ? `${meta.title} · ${siteTitle}` : siteTitle;
  const description = meta.description || identity.description || "";
  const accent = accentColor(ctx);
  const width = number(ctx, "maxWidth", 640, 480, 900);
  const rootVars = `:root{--p-accent-light:${accent};--p-accent-dark:${lighten(accent)};--p-width:${width}px;}`;

  return (
    <>
      {raw("<!doctype html>")}
      <html lang={identity.language || "zh-CN"}>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>{title}</title>
          {description ? <meta name="description" content={description} /> : null}
          {meta.noindex ? <meta name="robots" content="noindex,nofollow" /> : null}
          {meta.canonical ? <link rel="canonical" href={meta.canonical} /> : null}
          <meta property="og:site_name" content={siteTitle} />
          <meta property="og:title" content={meta.title || siteTitle} />
          {description ? <meta property="og:description" content={description} /> : null}
          <meta property="og:type" content={meta.ogType ?? "website"} />
          {meta.canonical ? <meta property="og:url" content={meta.canonical} /> : null}
          {meta.ogImage || identity.logo ? <meta property="og:image" content={meta.ogImage || identity.logo} /> : null}
          <meta name="twitter:card" content={meta.ogImage || identity.logo ? "summary_large_image" : "summary"} />
          <link rel="alternate" type="application/rss+xml" title={`${siteTitle} RSS`} href={`${ctx.basePath}/rss.xml`} />
          {identity.favicon ? <link rel="icon" href={identity.favicon} /> : null}
          {/* CSS 是编译期常量；<style> 为原始文本元素，需原样插入（不能用 JSX 转义） */}
          <style dangerouslySetInnerHTML={{ __html: ctx.theme.styles || STYLES }} />
          <style dangerouslySetInnerHTML={{ __html: rootVars }} />
          {/* 插件注入点：服务端已渲染好的 <meta>/<link> 片段 */}
          {ctx.headExtraHtml ? raw(ctx.headExtraHtml) : null}
          {meta.headHtml ? raw(meta.headHtml) : null}
        </head>
        <body>
          <div class="shell">
            <header class="top">
              <a class="top-brand" href={`${ctx.basePath}/`}>
                {identity.title}
              </a>
              {identity.description ? <p class="top-desc">{identity.description}</p> : null}
              <TopNav ctx={ctx} />
            </header>

            <main id="main">{children}</main>

            <Footer ctx={ctx} />
            {ctx.footerExtraHtml ? raw(ctx.footerExtraHtml) : null}
          </div>
        </body>
      </html>
    </>
  );
}

function Pager({ pagination }: { pagination: PaginationView }) {
  if (pagination.totalPages <= 1) {
    return pagination.total > 0 ? <p class="meta">共 {pagination.total} 条</p> : null;
  }
  return (
    <nav class="pager" aria-label="分页">
      <div>
        {pagination.prevUrl ? <a href={pagination.prevUrl} rel="prev">← 上一页</a> : <span class="meta">上一页</span>}
      </div>
      <ul class="pager-pages">
        {pagination.pages.map((item) =>
          item.page === 0 ? (
            <li aria-hidden="true">…</li>
          ) : item.page === pagination.page ? (
            <li aria-current="page">{item.page}</li>
          ) : (
            <li>
              <a href={item.url}>{item.page}</a>
            </li>
          ),
        )}
      </ul>
      <div>
        {pagination.nextUrl ? <a href={pagination.nextUrl} rel="next">下一页 →</a> : <span class="meta">下一页</span>}
      </div>
    </nav>
  );
}

function PostMeta({ post, ctx }: { post: ContentSummary; ctx: ThemeContext }) {
  if (!toggle(ctx, "showMeta", true)) return null;
  return (
    <p class="meta">
      <span>{isoDay(post.publishedAt) || "未发布"}</span>
      <span>{post.readingMinutes} 分钟</span>
      {post.commentCount > 0 ? <span>{post.commentCount} 评论</span> : null}
    </p>
  );
}

function PostList({ posts, ctx }: { posts: ContentSummary[]; ctx: ThemeContext }) {
  if (posts.length === 0) return <p class="note">这里还没有内容。</p>;
  return (
    <ul class="list">
      {posts.map((post) => (
        <li class="list-item">
          <span class="list-date">{isoDay(post.publishedAt) || "未发布"}</span>
          <a class="list-title" href={post.url}>
            {post.title || "无标题"}
          </a>
          {post.excerpt ? <p class="list-excerpt">{clip(post.excerpt, 100)}</p> : null}
          <PostMeta post={post} ctx={ctx} />
        </li>
      ))}
    </ul>
  );
}

function Body({ content }: { content: ContentDetail }) {
  if (content.locked) {
    return <p class="note">这篇内容受密码保护。</p>;
  }
  return (
    /*
     * 正文 HTML 由服务端渲染并过滤（marked 已关闭原生 HTML 透传），
     * 这是主题里唯一使用 dangerouslySetInnerHTML 的地方。
     */
    <div class="body" dangerouslySetInnerHTML={{ __html: content.html }} />
  );
}

/** 评论：深度由服务端裁好，这里只负责递归画。 */
function CommentItem({ node }: { node: CommentNode }): HonoJSX.Element {
  return (
    <li class="comment">
      <div class="comment-head">
        {node.authorUrl ? (
          <a class="comment-author" href={node.authorUrl} target="_blank" rel="noopener noreferrer nofollow ugc">
            {node.authorName}
          </a>
        ) : (
          <span class="comment-author">{node.authorName}</span>
        )}
        {node.isOwner ? <span class="comment-owner">作者</span> : null}
        <span class="comment-date">{isoDay(node.createdAt)}</span>
      </div>
      <p class="comment-body">{node.body}</p>
      {node.replies.length > 0 ? (
        <ul class="comment-list">
          {node.replies.map((reply) => (
            <CommentItem node={reply} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function Comments({ view, ctx }: { view: PostView; ctx: ThemeContext }) {
  return (
    <section class="comments" id="comments" aria-label="评论区">
      <h2>评论（{view.commentCount}）</h2>
      {view.notice ? (
        <p class="note" role="status">
          {view.notice}
        </p>
      ) : null}
      {view.comments.length > 0 ? (
        <ul class="comment-list">
          {view.comments.map((node) => (
            <CommentItem node={node} />
          ))}
        </ul>
      ) : (
        <p class="meta">还没有评论。</p>
      )}

      {view.commentsOpen ? (
        <form class="form" method="post" action={`${ctx.basePath}/comment`}>
          <h3>发表评论</h3>
          <div class="form-row">
            <p class="field">
              <label for="p-name">昵称</label>
              <input id="p-name" name="name" type="text" required maxlength={40} autocomplete="nickname" />
            </p>
            <p class="field">
              <label for="p-email">邮箱</label>
              <input id="p-email" name="email" type="email" required maxlength={120} autocomplete="email" />
            </p>
            <p class="field">
              <label for="p-url">网站</label>
              <input id="p-url" name="url" type="url" maxlength={200} autocomplete="url" />
            </p>
          </div>
          <p class="field">
            <label for="p-body">内容</label>
            <textarea id="p-body" name="body" rows={5} required maxlength={4000} />
          </p>
          {/* 蜜罐：读屏与非脚本用户都碰不到 */}
          <div class="hp" aria-hidden="true">
            <label for="p-website">请勿填写</label>
            <input id="p-website" name="website" type="text" tabindex={-1} autocomplete="off" />
          </div>
          <input type="hidden" name="contentId" value={view.content.id} />
          <input type="hidden" name="parentId" value="" />
          <button type="submit" class="submit">
            发表评论
          </button>
        </form>
      ) : (
        <p class="note">评论已关闭。</p>
      )}
    </section>
  );
}

/* ================================================================ 页面 */

function Home(ctx: ThemeContext, view: HomeView) {
  // 置顶项排在前面；按 id 去重，避免上层把置顶文章同时放进 posts 时同一篇出现两遍。
  const seen = new Set<string>();
  const posts: ContentSummary[] = [];
  for (const post of [...view.pinned, ...view.posts]) {
    if (seen.has(post.id)) continue;
    seen.add(post.id);
    posts.push(post);
  }
  return (
    <>
      {view.pagination.page === 1 ? (
        <p class="page-desc">{ctx.identity.description || "按时间倒序排列。"}</p>
      ) : (
        <p class="page-desc">第 {view.pagination.page} 页</p>
      )}
      <PostList posts={posts} ctx={ctx} />
      <Pager pagination={view.pagination} />
    </>
  );
}

function Archive(ctx: ThemeContext, view: ArchiveView) {
  const groups: { year: string; posts: ContentSummary[] }[] = [];
  for (const post of view.posts) {
    const year = yearOf(post.publishedAt) || "未标注";
    const last = groups[groups.length - 1];
    if (last && last.year === year) last.posts.push(post);
    else groups.push({ year, posts: [post] });
  }
  return (
    <>
      <h1 class="page-title">{view.title || "归档"}</h1>
      {view.description ? <p class="page-desc">{view.description}</p> : <p class="page-desc" />}
      {groups.length === 0 ? (
        <p class="note">还没有可归档的内容。</p>
      ) : (
        <ul class="timeline">
          {groups.map((group) => (
            <li class="timeline-year">
              <h2>{group.year}</h2>
              <ul class="timeline-items">
                {group.posts.map((post) => (
                  <li>
                    <span class="d">{isoDay(post.publishedAt).slice(5)}</span>
                    <a href={post.url}>{post.title || "无标题"}</a>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      <Pager pagination={view.pagination} />
    </>
  );
}

function Term(ctx: ThemeContext, view: TermView) {
  return (
    <>
      <h1 class="page-title">{view.term.name}</h1>
      <p class="page-desc">
        {view.term.description ? `${view.term.description} · ` : ""}
        {view.term.count} 篇内容
      </p>
      {view.children.length > 0 ? (
        <p class="meta">
          子分类：
          {view.children.map((child) => (
            <>
              <a href={child.url}>{child.name}</a>{" "}
            </>
          ))}
        </p>
      ) : null}
      <PostList posts={view.posts} ctx={ctx} />
      <Pager pagination={view.pagination} />
    </>
  );
}

function Post(ctx: ThemeContext, view: PostView) {
  const { content } = view;
  return (
    <>
      <article class="post">
        <header class="post-head">
          <h1>{content.title || "无标题"}</h1>
          <PostMeta post={content} ctx={ctx} />
        </header>
        <Body content={content} />
      </article>
      <Comments view={view} ctx={ctx} />
    </>
  );
}

function Page(ctx: ThemeContext, view: PageView) {
  return (
    <>
      <article class="post">
        <header class="post-head">
          <h1>{view.content.title || "无标题"}</h1>
        </header>
        <Body content={view.content} />
      </article>
      {view.children.length > 0 ? (
        <ul class="list">
          {view.children.map((child) => (
            <li class="list-item">
              <a class="list-title" href={child.url}>
                {child.title}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

function Moments(ctx: ThemeContext, view: MomentView) {
  return (
    <>
      <h1 class="page-title">瞬间</h1>
      <p class="page-desc">短内容记录。</p>
      {view.moments.length === 0 ? (
        <p class="note">还没有记录。</p>
      ) : (
        <ul class="moment-list">
          {view.moments.map((moment) => (
            <li class="moment">
              <span class="moment-date">{isoDay(moment.publishedAt)}</span>
              <h2>
                <a href={moment.url}>{moment.title || isoDay(moment.publishedAt)}</a>
              </h2>
              <p>{clip(moment.excerpt, 140)}</p>
            </li>
          ))}
        </ul>
      )}
      <Pager pagination={view.pagination} />
    </>
  );
}

function Projects(ctx: ThemeContext, view: ProjectView) {
  return (
    <>
      <h1 class="page-title">项目</h1>
      <p class="page-desc">做过的东西。</p>
      {view.projects.length === 0 ? (
        <p class="note">还没有项目。</p>
      ) : (
        <ul class="project-list">
          {view.projects.map((project) => (
            <li class="project">
              <h2>
                <a href={project.url}>{project.title || "无标题"}</a>
              </h2>
              <p>{clip(project.excerpt, 80)}</p>
            </li>
          ))}
        </ul>
      )}
      <Pager pagination={view.pagination} />
    </>
  );
}

function Search(ctx: ThemeContext, view: SearchView) {
  return (
    <>
      <h1 class="page-title">搜索</h1>
      <form class="search-row" method="get" action={`${ctx.basePath}/search`} role="search">
        <p class="field">
          <label for="p-q">关键词</label>
          <input id="p-q" name="q" type="search" value={view.query} autocomplete="off" />
        </p>
        <button type="submit" class="submit">
          搜索
        </button>
      </form>
      {view.query ? (
        <p class="meta" role="status">
          「{view.query}」共 {view.total} 条结果，用时 {view.tookMs} 毫秒。
        </p>
      ) : null}
      {view.results.length === 0 ? (
        view.query ? <p class="note">没有匹配的内容。</p> : null
      ) : (
        <PostList posts={view.results} ctx={ctx} />
      )}
    </>
  );
}

function ErrorPage(ctx: ThemeContext, view: ErrorView) {
  return (
    <div class="error">
      <p class="error-code">{view.status}</p>
      <h1>{view.title || "出错了"}</h1>
      <p>{view.message || "这个页面暂时打不开。"}</p>
      <p>
        <a href={`${ctx.basePath}/`}>返回首页</a>
      </p>
    </div>
  );
}

/* ================================================================ 导出 */

const manifest: ThemeManifest = {
  id: "paper",
  name: "素纸",
  version: "1.0.0",
  author: "太平",
  description: "单列纯文本的极简主题：无侧栏、无目录、无脚本，只有一个版心。",
  supports: {
    darkMode: false,
    toc: false,
    sidebar: false,
    comments: true,
    moments: true,
    projects: true,
  },
  settings: SETTINGS,
  styles: STYLES,
  // 无前端脚本：极简主题连渐进增强都不需要
  scripts: "",
};

export const paperTheme: Theme = {
  manifest,
  render: {
    layout: Layout,
    home: Home,
    archive: Archive,
    term: Term,
    post: Post,
    page: Page,
    moments: Moments,
    projects: Projects,
    search: Search,
    error: ErrorPage,
  },
};
