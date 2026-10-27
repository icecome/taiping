/**
 * 主题契约（单一真值）
 *
 * 设计要点：
 * - 主题是**编译进 Worker 的 TSX 模块**，不是可上传的模板包。理由见 docs/03 的"主题与模板"一节：
 *   Workers 里做运行时可执行模板包需要把模板当真代码跑，安全与冷启动成本都不划算；
 *   编译进包的代价是换主题要重新部署，换来的是完整类型检查、零解析开销、无 RCE 面。
 * - 主题只负责"怎么显示"，不负责"取什么数据"。所有数据由 site/data.ts 装载成 view model
 *   后交给主题，主题不允许直接访问 db/env —— 这样换主题不会把查询逻辑一起换掉。
 * - 主题通过 manifest.settings 声明自己的配置项，后台「外观」页据此生成表单，
 *   与站点设置共用同一套字段定义。
 */
import type { Child } from "hono/jsx";
import type { SettingField } from "../shared/settings-schema";

export type ThemeSettingField = Omit<SettingField, "group">;

export interface ThemeManifest {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  /** 主题能力声明；缺失的能力由前台回落通用实现，不报错。 */
  supports: {
    darkMode: boolean;
    toc: boolean;
    /** 首页是否展示侧栏。 */
    sidebar: boolean;
    /** 是否自带评论样式（false 时用核心内置样式）。 */
    comments: boolean;
    /** 是否支持瞬间（短内容）流。 */
    moments: boolean;
    /** 是否支持项目展示页。 */
    projects: boolean;
  };
  settings: ThemeSettingField[];
  /** 主题 CSS，注入 <head>；允许内联，因为是编译期常量而非用户输入。 */
  styles: string;
  /** 可选的前端增强脚本（目录折叠、复制按钮、主题切换）。 */
  scripts?: string;
}

/* ------------------------------------------------------------------ 主题输入数据 */

export interface SiteIdentity {
  title: string;
  description: string;
  logo: string;
  favicon: string;
  language: string;
  footerText: string;
  icpNumber: string;
  policeNumber: string;
  copyright: string;
  socialLinks: { label: string; href: string }[];
  baseUrl: string;
}

export interface NavLink {
  label: string;
  href: string;
  target: "_self" | "_blank";
  icon: string | null;
  children: NavLink[];
}

export interface TermSummary {
  id: string;
  type: string;
  name: string;
  slug: string;
  url: string;
  count: number;
  description: string | null;
}

export interface ContentSummary {
  id: string;
  type: string;
  title: string;
  slug: string;
  url: string;
  excerpt: string;
  coverUrl: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
  readingMinutes: number;
  wordCount: number;
  viewCount: number;
  commentCount: number;
  isPinned: boolean;
  author: { id: string; name: string; avatarUrl: string | null } | null;
  categories: TermSummary[];
  tags: TermSummary[];
  /** 自定义字段回显（按字段定义顺序）。 */
  fields: { key: string; label: string; value: string }[];
}

export interface ContentDetail extends ContentSummary {
  /** 渲染并跑过插件 filter 后的正文 HTML。 */
  html: string;
  headings: { depth: number; text: string; id: string }[];
  /** 密码保护内容未解锁时为 true，此时 html 为空。 */
  locked: boolean;
  allowComment: boolean;
  /** 上一篇 / 下一篇，按发布时间。 */
  prev: { title: string; url: string } | null;
  next: { title: string; url: string } | null;
  related: ContentSummary[];
}

export interface CommentNode {
  id: string;
  authorName: string;
  authorUrl: string | null;
  avatarUrl: string | null;
  body: string;
  createdAt: string;
  isOwner: boolean;
  replies: CommentNode[];
}

export interface PaginationView {
  page: number;
  totalPages: number;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
  prevUrl: string | null;
  nextUrl: string | null;
  /** 页码链接，省略号用 page=0 表示。 */
  pages: { page: number; url: string }[];
}

export interface HomeView {
  posts: ContentSummary[];
  pinned: ContentSummary[];
  pagination: PaginationView;
  categories: TermSummary[];
  tags: TermSummary[];
  recentComments: { id: string; authorName: string; body: string; url: string; createdAt: string }[];
  archive: { year: string; count: number; url: string }[];
  stats: { posts: number; comments: number; categories: number; tags: number };
}

export interface ArchiveView {
  title: string;
  description: string;
  posts: ContentSummary[];
  pagination: PaginationView;
  categories: TermSummary[];
  tags: TermSummary[];
}

export interface TermView {
  term: TermSummary;
  posts: ContentSummary[];
  pagination: PaginationView;
  /** 分类树的兄弟/子分类，用于分类页导航。 */
  siblings: TermSummary[];
  children: TermSummary[];
}

export interface PostView {
  content: ContentDetail;
  comments: CommentNode[];
  commentCount: number;
  commentsOpen: boolean;
  /** 评论提交结果提示（重定向回来时携带）。 */
  notice: string | null;
}

export interface MomentView {
  moments: ContentSummary[];
  pagination: PaginationView;
}

export interface ProjectView {
  projects: ContentSummary[];
  pagination: PaginationView;
}

export interface SearchView {
  query: string;
  results: ContentSummary[];
  total: number;
  tookMs: number;
}

export interface PageView {
  content: ContentDetail;
  children: { title: string; url: string }[];
}

export interface ErrorView {
  status: number;
  title: string;
  message: string;
}

/** 传给 layout 的页面元信息。 */
export interface PageMeta {
  title: string;
  description: string;
  canonical: string;
  /** 传给 layout 追加到 <head> 的片段（RSS、og、JSON-LD）。 */
  headHtml?: string;
  noindex?: boolean;
  ogType?: "website" | "article";
  ogImage?: string | null;
  publishedTime?: string | null;
  modifiedTime?: string | null;
  authorName?: string | null;
  /** 页面级额外 CSS 类。 */
  bodyClass?: string;
}

/** 主题渲染入口所需的全部上下文。 */
export interface ThemeContext {
  identity: SiteIdentity;
  nav: NavLink[];
  theme: ThemeManifest;
  settings: Record<string, unknown>;
  /** 当前请求路径，用于导航高亮。 */
  currentPath: string;
  /** 站点根路径（部署在子路径时为前缀，否则为空串）。 */
  basePath: string;
  /** 页脚/头部插件注入点已渲染好的 HTML。 */
  headExtraHtml: string;
  footerExtraHtml: string;
}

export interface ThemeRenderers {
  layout: (ctx: ThemeContext, meta: PageMeta, children: Child) => Child;
  home: (ctx: ThemeContext, view: HomeView) => Child;
  archive: (ctx: ThemeContext, view: ArchiveView) => Child;
  term: (ctx: ThemeContext, view: TermView) => Child;
  post: (ctx: ThemeContext, view: PostView) => Child;
  page: (ctx: ThemeContext, view: PageView) => Child;
  moments: (ctx: ThemeContext, view: MomentView) => Child;
  projects: (ctx: ThemeContext, view: ProjectView) => Child;
  search: (ctx: ThemeContext, view: SearchView) => Child;
  error: (ctx: ThemeContext, view: ErrorView) => Child;
}

export interface Theme {
  manifest: ThemeManifest;
  render: ThemeRenderers;
}
