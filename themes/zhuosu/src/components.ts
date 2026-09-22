import { html, raw } from 'hono/html'
import type { ThemeMeta } from './types'
import { formatDate } from '@taiping/shared-utils/date'
import { isSafeExternalUrl } from '@taiping/content-model/comment'

/**
 * 用户可控 URL 的渲染侧防护。
 * 契约层已拒绝不安全协议，此处兜住入库早于该约束的历史数据。
 */
function safeExternalHref(value: string | undefined): string | undefined {
  return value && isSafeExternalUrl(value) ? value : undefined
}

export function Layout(meta: ThemeMeta, main: ReturnType<typeof html>) {
  const { settings } = meta
  const pageTitle = meta.title
    ? meta.title === settings.title
      ? settings.title
      : `${meta.title} | ${settings.title}`
    : settings.title
  return html`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${pageTitle}</title>
  <meta name="description" content="${meta.description || settings.description || settings.subtitle || ''}">
  <link rel="alternate" type="application/rss+xml" title="${settings.title}" href="/rss.xml">
  <link rel="preconnect" href="https://fontsapi.zeoseven.com" crossorigin>
  <link rel="stylesheet" href="https://fontsapi.zeoseven.com/22/main/result.css" media="print" onload="this.media='all'">
  <link rel="stylesheet" href="https://fontsapi.zeoseven.com/285/main/result.css" media="print" onload="this.media='all'">
  <noscript>
    <link rel="stylesheet" href="https://fontsapi.zeoseven.com/22/main/result.css">
    <link rel="stylesheet" href="https://fontsapi.zeoseven.com/285/main/result.css">
  </noscript>
  <link rel="stylesheet" href="/theme/styles/style.css">
  <link rel="stylesheet" href="/theme/styles/paper-texture.css">
  <link rel="stylesheet" href="/theme/styles/guestbook.css">
  <link rel="stylesheet" href="/theme/styles/post-encrypt.css">
  <link rel="stylesheet" href="/theme/styles/code-toolbar.css">
  <link rel="stylesheet" href="/theme/styles/lightbox.css">
  <link rel="stylesheet" href="/theme/styles/zhuosu.css">
</head>
<body class="paper-texture">
  <a class="skip-link" href="#main-content">跳到主内容</a>
  <div class="page-wrapper">
    <main class="main-content" id="main-content">
      ${main}
    </main>
    ${SidebarNav(meta)}
  </div>
  ${SearchModal()}
  <script src="/theme/scripts/main.js" defer></script>
  <script src="/theme/scripts/search.js" defer></script>
  <script src="/theme/scripts/theme-toggle.js" defer></script>
  <script src="/theme/scripts/overtype/overtype.min.js" defer></script>
  <script src="/theme/scripts/guestbook.js" defer></script>
  <script src="/theme/scripts/moment.js" defer></script>
  <script src="/theme/scripts/code-toolbar.js" defer></script>
  <script src="/theme/scripts/spoiler.js" defer></script>
  <script src="/theme/scripts/lightbox-core.js" defer></script>
  <script src="/theme/scripts/lightbox-gallery.js" defer></script>
</body>
</html>`
}

function SidebarNav(meta: ThemeMeta) {
  const { settings, path } = meta
  return html`<aside class="sidebar">
    <a href="/" class="sidebar-site-title">${settings.title}</a>
    ${settings.subtitle ? html`<p class="sidebar-site-desc">${settings.subtitle}</p>` : ''}

    <nav>
      <ul class="sidebar-nav">
        ${settings.navigation.map(
          (item) => html`<li>
            <a href="${item.url}" class="${isActive(path, item.url) ? 'active' : ''}">${item.name}</a>
          </li>`,
        )}
      </ul>
    </nav>

    <div class="sidebar-theme-toggle">
      <button class="theme-toggle" type="button" aria-label="切换明暗主题" aria-pressed="false">
        <svg class="icon-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <svg class="icon-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
      </button>
      <button class="theme-toggle search-toggle" type="button" aria-label="站内搜索">
        <svg class="icon-search" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      </button>
    </div>

    <div class="sidebar-social">
      ${SocialIcons(settings.social)}
    </div>

    <div class="sidebar-footer">
      <div class="sidebar-footer-copy">
        ${settings.footer ? html`<p>${settings.footer}</p>` : ''}
        <p>&copy; ${new Date().getFullYear()} ${settings.title}</p>
        ${settings.icp ? html`<p>${settings.icp}</p>` : ''}
      </div>
    </div>
  </aside>`
}

function SocialIcons(social: Array<{ name: string; url: string }>) {
  const byName = new Map(social.map((s) => [s.name.toLowerCase(), s]))
  const ordered: Array<{ name: string; url: string }> = []
  const github = byName.get('github')
  if (github) ordered.push(github)
  const rss = byName.get('rss')
  ordered.push(rss ?? { name: 'RSS', url: '/rss.xml' })
  const email =
    byName.get('email') ??
    social.find((s) => s.url.startsWith('mailto:') || s.url.includes('@'))
  if (email) ordered.push(email)
  for (const item of social) {
    if (!ordered.some((o) => o.url === item.url)) ordered.push(item)
  }

  return ordered.map((item) => {
    const key = item.name.toLowerCase()
    if (key === 'github') {
      return html`<a href="${item.url}" target="_blank" rel="noopener" title="GitHub" aria-label="GitHub">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.167 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.341-3.369-1.341-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"/></svg>
      </a>`
    }
    if (key === 'rss' || item.url.includes('rss')) {
      return html`<a href="${item.url}" target="_blank" rel="noopener" title="RSS" aria-label="RSS">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="6.18" cy="17.82" r="2.18"/><path d="M4 4.44v2.83c7.03 0 12.73 5.7 12.73 12.73h2.83c0-8.59-6.97-15.56-15.56-15.56zm0 5.66v2.83c3.9 0 7.07 3.17 7.07 7.07h2.83c0-5.47-4.43-9.9-9.9-9.9z"/></svg>
      </a>`
    }
    if (key === 'email' || item.url.startsWith('mailto:') || item.url.includes('@')) {
      const href = item.url.startsWith('mailto:') ? item.url : `mailto:${item.url}`
      return html`<a href="${href}" title="Email" aria-label="Email">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
      </a>`
    }
    return html`<a href="${item.url}" target="_blank" rel="noopener" title="${item.name}" aria-label="${item.name}">${item.name}</a>`
  })
}

function SearchModal() {
  return html`<div id="search-modal" class="search-modal" hidden>
    <div class="search-panel">
      <input type="search" id="search-input" placeholder="搜索标题或摘要…" autocomplete="off">
      <ul id="search-results" class="search-results"></ul>
    </div>
  </div>`
}

function isActive(path: string, url: string): boolean {
  if (url === '/') return path === '/' || path === ''
  return path === url || path.startsWith(`${url}/`)
}

/** 原版列表不展示头图 */
export function ArticleCard(post: {
  slug: string
  title: string
  excerpt: string
  cover?: string
  publishedAt?: string
  readingTime?: string
  categories?: Array<{ name: string; slug: string }>
  encrypt?: boolean
}) {
  void post.cover
  return html`<article class="article-item">
    <div class="article-item-body">
      <h2 class="article-item-title">
        <a href="/posts/${post.slug}">${post.title}</a>
      </h2>
      <time class="article-item-date" datetime="${post.publishedAt || ''}">${formatDate(post.publishedAt, 'YYYY-MM-DD')}</time>
      ${post.encrypt
        ? html`<p class="article-item-excerpt article-item-excerpt-encrypted"><span>这是一篇加密文章，请输入密码查看</span></p>`
        : post.excerpt
          ? html`<p class="article-item-excerpt">${post.excerpt}</p>`
          : ''}
    </div>
  </article>`
}

/** 原版分页：仅「前页 / 后页」，右对齐，无页码 */
export function Pagination(p: { page: number; totalPages: number; basePath: string }) {
  if (p.totalPages <= 1) return html``
  return html`<nav class="pagination" aria-label="分页">
    ${p.page > 1
      ? html`<a class="pagination-link" href="${pageHref(p.basePath, p.page - 1)}">前页</a>`
      : ''}
    ${p.page < p.totalPages
      ? html`<a class="pagination-link" href="${pageHref(p.basePath, p.page + 1)}">后页</a>`
      : ''}
  </nav>`
}

function pageHref(basePath: string, page: number): string {
  return page <= 1 ? basePath : `${basePath}?page=${page}`
}

export function CommentList(comments: Array<{
  nickname: string
  contentHtml: string
  createdAt: string
  isFeatured?: boolean
  website?: string
  replies?: Array<{
    id: string
    contentHtml: string
    replyType: string
    replyFromEmail: string
    createdAt: string
  }>
}>, sourceLabel?: string) {
  if (!comments.length) {
    return html`<div class="guestbook-empty">暂无留言</div>`
  }
  return html`<div class="guestbook-list">
    ${comments.map(
      (c) => html`<article class="guestbook-item${c.isFeatured ? ' is-featured' : ''}">
        <div class="guestbook-item-head">
          <span class="guestbook-item-name">${c.nickname}</span>
          ${sourceLabel ? html`<span class="guestbook-item-source">来自：${sourceLabel}</span>` : ''}
          ${safeExternalHref(c.website)
            ? html`<a class="guestbook-item-site" href="${safeExternalHref(c.website)}" target="_blank" rel="noopener">${c.website}</a>`
            : ''}
          <time class="guestbook-item-time" datetime="${c.createdAt}">${formatDate(c.createdAt, 'YYYY-MM-DD HH:mm')}</time>
        </div>
        <div class="guestbook-item-body">${raw(c.contentHtml)}</div>
        ${c.replies?.length
          ? html`<div class="guestbook-replies">
              ${c.replies.map(
                (r) => html`<div class="guestbook-reply guestbook-reply--${r.replyType === '博主' ? 'admin' : 'email'}">
                  <div class="guestbook-reply-head">
                    <span class="guestbook-reply-label">${r.replyType}</span>
                    <time class="guestbook-reply-time" datetime="${r.createdAt}">${formatDate(r.createdAt, 'YYYY-MM-DD HH:mm')}</time>
                  </div>
                  <div class="guestbook-reply-body">${raw(r.contentHtml)}</div>
                </div>`,
              )}
            </div>`
          : ''}
      </article>`,
    )}
  </div>`
}

export function CommentForm(targetType: string, targetId: string, opts: { editorId?: string; title?: string } = {}) {
  const editorId = opts.editorId || `gb-editor-${targetId}`
  return html`<form class="guestbook-form" data-target-type="${targetType}" data-target-id="${targetId}" autocomplete="off">
    ${opts.title !== '' ? html`<h3 class="guestbook-form-title">${opts.title || '写下你的留言'}</h3>` : ''}
    <div class="guestbook-row">
      <div class="guestbook-field guestbook-field--third">
        <label class="guestbook-label">昵称（必填） *</label>
        <input class="guestbook-input" name="nickname" required maxlength="40" placeholder="你的昵称">
      </div>
      <div class="guestbook-field guestbook-field--third">
        <label class="guestbook-label">邮箱（选填）</label>
        <input class="guestbook-input" name="email" type="email" placeholder="用于接收留言答复">
      </div>
      <div class="guestbook-field guestbook-field--third">
        <label class="guestbook-label">站点地址（选填）</label>
        <input class="guestbook-input" name="website" type="url" placeholder="https://blog.example.com">
      </div>
    </div>
    <div class="guestbook-field">
      <label class="guestbook-label">内容（必填） *</label>
      <div id="${editorId}" class="guestbook-editor"></div>
    </div>
    <div class="guestbook-submit-row">
      <button class="guestbook-submit" type="submit">提交留言</button>
      <span class="guestbook-status form-message" role="status" hidden></span>
    </div>
  </form>`
}

export function MomentsFeed(moments: Array<{
  id: string
  contentHtml: string
  createdAt: string
  author?: string
  pictures: Array<{ url: string; alt?: string }>
  videoUrl?: string
  linkUrl?: string
  linkText?: string
  tagNames?: string[]
}>) {
  if (!moments.length) return html`<div class="guestbook-empty">暂无说说</div>`
  return html`<div class="article-list">
    ${moments.map((m) => {
      const cols = m.pictures.length === 1 ? 1 : m.pictures.length === 3 || m.pictures.length >= 5 ? 3 : 2
      return html`<article class="article-item article-item--moment" data-moment-id="${m.id}">
        <div class="article-item-meta">
          ${m.author ? html`<span class="moment-author">${m.author}</span>` : ''}
          <time class="moment-time" datetime="${m.createdAt}">${formatDate(m.createdAt, 'YYYY-MM-DD HH:mm')}</time>
        </div>
        <div class="moment-text is-collapsed">
          <div class="post-content">${raw(m.contentHtml)}</div>
        </div>
        ${m.pictures.length === 1
          ? html`<div class="single-pic-container">
              <div class="single-pic-inner">
                <a href="${m.pictures[0]!.url}" class="article-gallery-link" data-src="${m.pictures[0]!.url}" data-alt="${m.pictures[0]!.alt || ''}">
                  <img src="${m.pictures[0]!.url}" alt="${m.pictures[0]!.alt || ''}" loading="lazy" class="single-pic">
                </a>
              </div>
            </div>`
          : m.pictures.length > 1
            ? html`<div class="pic-grid-container">
                <div class="pic-grid" data-columns="${cols}">
                  ${m.pictures.map(
                    (p) => html`<a href="${p.url}" class="grid-item article-gallery-link" data-src="${p.url}" data-alt="${p.alt || ''}">
                      <img src="${p.url}" alt="${p.alt || ''}" loading="lazy">
                    </a>`,
                  )}
                </div>
              </div>`
            : ''}
        ${m.linkUrl
          ? html`<div class="share-link-block">
              <a href="${m.linkUrl}" target="_blank" rel="noopener noreferrer" class="share-link-url">${m.linkText || m.linkUrl}</a>
            </div>`
          : ''}
        ${m.videoUrl ? renderVideo(m.videoUrl) : ''}
        <div class="moment-foot">
          ${m.tagNames?.length
            ? html`<div class="post-tags">${m.tagNames.map((t) => html`<span class="tag">${t}</span>`)}</div>`
            : html`<div></div>`}
          <div class="moment-actions">
            <button type="button" class="moment-comment-toggle" data-id="${m.id}" data-title="${m.author || ''}">留言</button>
          </div>
        </div>
      </article>`
    })}
  </div>`
}

function renderVideo(url: string) {
  const bilibili = matchBilibili(url)
  if (bilibili) {
    return html`<div class="video-container"><div class="bili-wrapper">
      <iframe
        src="//player.bilibili.com/player.html?isOutside=true&bvid=${bilibili}&page=1&autoplay=0&high_quality=1&danmaku=0"
        frameborder="0"
        allowfullscreen="true"
        loading="lazy"
        referrerpolicy="no-referrer"
      ></iframe>
    </div></div>`
  }
  return html`<div class="video-container">
    <video class="moment-video" src="${url}" controls preload="metadata"></video>
  </div>`
}

function matchBilibili(url: string): string | null {
  return url.match(/BV[A-Za-z0-9]+/)?.[0] ?? null
}

export function EncryptGate(hint?: string, message?: string) {
  return html`<div class="post-encrypt-gate encrypt-gate">
    <h2>此文章已加密</h2>
    <p>${message || '请输入密码后查看内容。'}</p>
    ${hint ? html`<p class="encrypt-hint">提示：${hint}</p>` : ''}
    <form id="unlock-form" class="unlock-form guestbook-form">
      <input type="password" name="password" class="guestbook-input" placeholder="访问密码" required autocomplete="current-password">
      <button type="submit" class="guestbook-submit">解锁</button>
      <p class="form-message guestbook-status" hidden></p>
    </form>
  </div>`
}
