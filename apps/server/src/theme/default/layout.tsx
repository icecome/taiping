/**
 * default 主题（纸墨）的文档外壳。
 *
 * 分工：layout 只负责 `<html>` / `<head>` / 页头 / 页脚 / 注入点；
 * 各页面把自己的 JSX 作为 children 交给它。这样新增页面不会复制一份 head 拼装逻辑，
 * 也就不会出现"某个页面忘了输出 canonical"这类问题。
 */
import type { Child } from "hono/jsx";
import { raw } from "hono/html";
import type { NavLink, PageMeta, ThemeContext } from "../types";
import { currentYear, flag, str } from "./settings";
import { buildRootCss, STYLES } from "./styles";

/* ---------------------------------------------------------------- 导航 */

/** 去掉查询串与末尾斜杠，用于判断当前页是否命中导航项。 */
function normalizePath(value: string): string {
  const withoutHash = value.split("#")[0] ?? "";
  const withoutQuery = withoutHash.split("?")[0] ?? "";
  const trimmed = withoutQuery.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

/** 外链不参与高亮；首页精确匹配，其余按前缀匹配（/category/tech 命中 /category）。 */
function isActive(currentPath: string, href: string): boolean {
  if (!href || href.startsWith("#") || /^[a-z]+:\/\//i.test(href)) return false;
  const current = normalizePath(currentPath);
  const target = normalizePath(href);
  if (target === "/") return current === "/";
  return current === target || current.startsWith(`${target}/`);
}

function NavAnchor({ item, currentPath }: { item: NavLink; currentPath: string }) {
  const active = isActive(currentPath, item.href);
  return (
    <a
      href={item.href}
      target={item.target}
      rel={item.target === "_blank" ? "noopener noreferrer" : undefined}
      aria-current={active ? "page" : undefined}
    >
      {item.icon ? <span class="nav-icon" aria-hidden="true">{item.icon}</span> : null}
      {item.label}
    </a>
  );
}

function NavItem({ item, currentPath }: { item: NavLink; currentPath: string }) {
  // 有子项时，父项本身仍是真链接（可以直接点进去），子项挂在原生 <details> 里：
  // JS 关闭也能展开、能吃键盘焦点，不需要再写一套 dropdown 脚本。
  if (item.children.length === 0) {
    return (
      <li>
        <NavAnchor item={item} currentPath={currentPath} />
      </li>
    );
  }

  return (
    <li>
      <NavAnchor item={item} currentPath={currentPath} />
      <details class="nav-sub">
        <summary aria-label={`展开「${item.label}」子菜单`} />
        <ul>
          {item.children.map((child) => (
            <li>
              <NavAnchor item={child} currentPath={currentPath} />
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}

function SiteHeader({ ctx }: { ctx: ThemeContext }) {
  const { identity, nav, currentPath } = ctx;
  const darkMode = flag(ctx, "enableDarkMode", true);
  const initial = (identity.title || "太").slice(0, 1);

  return (
    <header class="site-header">
      <div class="site-header-inner">
        <a class="brand" href={`${ctx.basePath}/`}>
          {identity.logo ? (
            <img class="brand-logo" src={identity.logo} alt="" aria-hidden="true" width={30} height={30} />
          ) : (
            <span class="brand-mark" aria-hidden="true">{initial}</span>
          )}
          <span class="brand-text">{identity.title}</span>
        </a>

        {nav.length > 0 ? (
          <nav class="site-nav" aria-label="主导航">
            <ul>
              {nav.map((item) => NavItem({ item, currentPath }))}
            </ul>
          </nav>
        ) : null}

        <div class="header-actions">
          {darkMode ? (
            // hidden 由脚本移除：JS 不可用时这个按钮不出现，避免留下点了没反应的控件。
            // 暗色本身仍然由 CSS 的 prefers-color-scheme 兜底。
            <button
              type="button"
              id="tp-theme-toggle"
              class="theme-toggle"
              aria-label="切换深色模式"
              aria-pressed="false"
              hidden
            >
              <svg class="icon-sun" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="4.2" />
                <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4L17 7M7 17l-1.6 1.6" />
              </svg>
              <svg class="icon-moon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5 8.8 8.8 0 1 0 20.5 14.6z" />
              </svg>
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}

/* ---------------------------------------------------------------- 页脚 */

function SiteFooter({ ctx }: { ctx: ThemeContext }) {
  const { identity } = ctx;
  const note = str(ctx, "footerNote", "");
  const social = identity.socialLinks ?? [];
  const year = currentYear();

  return (
    <footer class="site-footer">
      <div class="site-footer-inner">
        <div class="footer-top">
          <span class="footer-brand">{identity.title}</span>
          {social.length > 0 ? (
            <ul class="footer-social">
              {social.map((link) => (
                <li>
                  <a href={link.href} target="_blank" rel="noopener noreferrer">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <p class="footer-copy">
          {identity.footerText ? identity.footerText : `© ${year} ${identity.title}`}
          {identity.copyright ? <span class="footer-copyright"> · {identity.copyright}</span> : null}
        </p>

        {note ? <p class="footer-note">{note}</p> : null}

        <ul class="footer-meta">
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
          <li>
            <a href={`${ctx.basePath}/sitemap.xml`}>Sitemap</a>
          </li>
        </ul>

        <p class="site-colophon">
          {ctx.theme.name} · 太平 CMS
        </p>

        {/*
          页脚插件注入点：内容由服务端 plugin hook 渲染好后传入，主题只做位置与容器。
          它必须是原样插入（raw），否则插件输出的 <script>/<div> 会被当成文本转义。
        */}
        {ctx.footerExtraHtml ? raw(ctx.footerExtraHtml) : null}
      </div>
    </footer>
  );
}

/* ---------------------------------------------------------------- 文档 */

export function SiteLayout(ctx: ThemeContext, meta: PageMeta, children: Child): Child {
  const { identity } = ctx;
  const siteTitle = identity.title || "";
  const pageTitle = meta.title && meta.title !== siteTitle ? `${meta.title} · ${siteTitle}` : siteTitle;
  const description = meta.description || identity.description || "";
  const lang = identity.language || "zh-CN";
  const ogImage = meta.ogImage || identity.logo || "";
  const twitterCard = ogImage ? "summary_large_image" : "summary";
  const bodyClass = ["tp-shell", meta.bodyClass ?? ""].filter(Boolean).join(" ");

  return (
    <>
      {raw("<!doctype html>")}
      <html lang={lang}>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>{pageTitle}</title>
          {description ? <meta name="description" content={description} /> : null}
          {/* noindex 由页面显式声明（搜索结果页、密码页等），不在这里猜测 */}
          {meta.noindex ? <meta name="robots" content="noindex,nofollow" /> : null}
          {meta.canonical ? <link rel="canonical" href={meta.canonical} /> : null}

          <meta property="og:site_name" content={siteTitle} />
          <meta property="og:title" content={meta.title || siteTitle} />
          {description ? <meta property="og:description" content={description} /> : null}
          <meta property="og:type" content={meta.ogType ?? "website"} />
          {meta.canonical ? <meta property="og:url" content={meta.canonical} /> : null}
          {ogImage ? <meta property="og:image" content={ogImage} /> : null}
          <meta name="twitter:card" content={twitterCard} />
          {meta.authorName ? <meta name="twitter:creator" content={meta.authorName} /> : null}
          {meta.publishedTime ? <meta property="article:published_time" content={meta.publishedTime} /> : null}
          {meta.modifiedTime ? <meta property="article:modified_time" content={meta.modifiedTime} /> : null}

          <link rel="alternate" type="application/rss+xml" title={`${siteTitle} RSS`} href={`${ctx.basePath}/rss.xml`} />

          {/*
            主题样式：编译期常量，不是用户输入；用 raw 插入是因为 <style> 是原始文本元素，
            JSX 默认转义会把 CSS 里的 > 和 & 变成 &gt; / &amp; 从而失效。
          */}
          <style dangerouslySetInnerHTML={{ __html: ctx.theme.styles || STYLES }} />
          <style dangerouslySetInnerHTML={{ __html: buildRootCss(ctx) }} />

          {/*
            页头插件注入点：服务端插件产出的是 <meta>/<link>/<script> 片段，
            在 <head> 里没有合法包裹元素，因此必须原样插入。
          */}
          {ctx.headExtraHtml ? raw(ctx.headExtraHtml) : null}
          {meta.headHtml ? raw(meta.headHtml) : null}

          {identity.favicon ? <link rel="icon" href={identity.favicon} /> : null}
        </head>

        <body class={bodyClass}>
          <a class="tp-skip" href="#main">跳到正文</a>
          <SiteHeader ctx={ctx} />
          <main class="tp-main" id="main">
            {children}
          </main>
          <SiteFooter ctx={ctx} />

          {/*
            渐进增强脚本来自 manifest.scripts（已自带 <script> 包裹），原样插入。
            它是编译期常量，不是用户输入；JS 关闭时页面所有功能仍然可用。
          */}
          {ctx.theme.scripts ? raw(ctx.theme.scripts) : null}
        </body>
      </html>
    </>
  );
}
