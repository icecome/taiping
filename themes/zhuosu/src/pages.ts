import { html, raw } from 'hono/html'
import { formatDate, nowIso } from '@taiping/shared-utils'
import { safeResourceSrc } from '@taiping/content-model/url'
import {
  ArticleCard,
  CommentForm,
  CommentList,
  EncryptGate,
  Layout,
  MomentsFeed,
  Pagination,
} from './components'
import type {
  ArchiveContext,
  GuestbookContext,
  IndexContext,
  ListContext,
  MomentsContext,
  NotFoundContext,
  PageContext,
  PostContext,
  TaxonomyContext,
} from './types'

export function renderIndex(ctx: IndexContext) {
  return Layout(
    ctx,
    html`<div class="article-list">
      ${ctx.posts.length
        ? ctx.posts.map((post) => ArticleCard(post))
        : html`<div class="guestbook-empty">还没有文章。</div>`}
    </div>
    ${Pagination(ctx.pagination)}`,
  )
}

export function renderList(ctx: ListContext) {
  return Layout(
    ctx,
    html`<div class="page-header">
        <h1 class="section-title">${ctx.heading}</h1>
      </div>
      <div class="article-list">
        ${ctx.posts.length
          ? ctx.posts.map((post) => ArticleCard(post))
          : html`<div class="guestbook-empty">暂无内容</div>`}
      </div>
      ${Pagination(ctx.pagination)}`,
  )
}

export function renderPost(ctx: PostContext) {
  const { post } = ctx
  const body = ctx.unlocked
    ? html`<div class="post-content">${raw(post.contentHtml)}</div>`
    : EncryptGate(post.encryptHint, post.encryptMessage)

  const reading = post.readingTime || '弹指可览'

  return Layout(
    { ...ctx, title: post.title, description: post.excerpt },
    html`<article>
      <header class="post-header">
        <h1 class="post-title">${post.title}</h1>
        <div class="post-meta">
          <time datetime="${post.publishedAt || post.createdAt}">${formatDate(post.publishedAt || post.createdAt, 'YYYY-MM-DD')}</time>
          <span class="meta-dot">·</span>
          <span class="meta-reading">${reading}</span>
        </div>
        ${post.cover && safeResourceSrc(post.cover)
          ? html`<div class="post-cover"><img src="${safeResourceSrc(post.cover)}" alt="${post.title}"></div>`
          : ''}
      </header>
      ${body}
      <footer class="post-footer">
        <div class="post-taxonomies">
          ${ctx.categories.length
            ? html`<div class="taxonomy-group">
                ${ctx.categories.map((c) => html`<a href="/categories/${c.slug}" class="tag">${c.name}</a>`)}
              </div>`
            : ''}
          ${ctx.tags.length
            ? html`<div class="taxonomy-group">
                ${ctx.tags.map((t) => html`<a href="/tags/${t.slug}" class="tag">${t.name}</a>`)}
              </div>`
            : ''}
        </div>
        <div class="post-feedback">
          <a
            class="post-feedback-link"
            href="/guestbook?ref=${encodeURIComponent('/posts/' + post.slug)}&title=${encodeURIComponent(post.title)}"
          >对这篇有话想说？去留言板</a>
        </div>
        <nav class="post-nav">
          <div class="post-nav-item">
            ${ctx.prev
              ? html`<a href="/posts/${ctx.prev.slug}" class="post-nav-link">
                  <span class="post-nav-label">前篇</span>
                  <span class="post-nav-title">${ctx.prev.title}</span>
                </a>`
              : ''}
          </div>
          <div class="post-nav-item">
            ${ctx.next
              ? html`<a href="/posts/${ctx.next.slug}" class="post-nav-link">
                  <span class="post-nav-label">后篇</span>
                  <span class="post-nav-title">${ctx.next.title}</span>
                </a>`
              : ''}
          </div>
        </nav>
      </footer>
    </article>`,
  )
}

export function renderArchives(ctx: ArchiveContext) {
  return Layout(
    { ...ctx, title: '归档' },
    html`<div class="page-header">
        <h1 class="section-title">归档</h1>
      </div>
      <div class="archives">
        ${ctx.groups.map(
          (group) => html`<h2 class="archive-year">${group.label}</h2>
            <div class="archive-list">
              ${group.posts.map(
                (post) => html`<a href="/posts/${post.slug}" class="archive-item">
                  <span class="archive-item-date">${formatDate(post.publishedAt, 'MM月DD日')}</span>
                  <span class="archive-item-title">${post.title}</span>
                </a>`,
              )}
            </div>`,
        )}
      </div>`,
  )
}

export function renderTaxonomy(ctx: TaxonomyContext) {
  const heading = ctx.term
    ? ctx.termType === 'category'
      ? `分类：${ctx.term.name}`
      : `标签：${ctx.term.name}`
    : ctx.termType === 'category'
      ? '分类'
      : '标签'
  return Layout(
    { ...ctx, title: heading },
    html`<div class="page-header">
        <h1 class="section-title">${heading}</h1>
      </div>
      ${!ctx.term
        ? html`<div class="taxonomy-list">
            ${ctx.terms.map(
              (t) => html`<a class="taxonomy-item" href="/${ctx.termType === 'category' ? 'categories' : 'tags'}/${t.slug}">
                <span>${t.name}</span>
                <span class="taxonomy-count">${t.count}</span>
              </a>`,
            )}
          </div>`
        : html`<div class="article-list">${ctx.posts.map((post) => ArticleCard(post))}</div>`}`,
  )
}

export function renderMoments(ctx: MomentsContext) {
  return Layout(
    { ...ctx, title: ctx.settings.momentsTitle || '说说' },
    html`<div class="moments-header">
        <h1 class="moments-title">${ctx.settings.momentsTitle || '说说'}</h1>
        ${ctx.settings.momentsSignature
          ? html`<p class="moments-signature">${ctx.settings.momentsSignature}</p>`
          : ''}
      </div>
      ${MomentsFeed(ctx.moments)}
      ${ctx.pagination ? Pagination(ctx.pagination) : ''}`,
  )
}

export function renderGuestbook(ctx: GuestbookContext) {
  return Layout(
    { ...ctx, title: '访客留言' },
    html`<div class="page-header">
        <h1 class="section-title">访客留言</h1>
        <div class="section-desc">${formatDate(nowIso(), 'YYYY-MM-DD')} · 弹指可览</div>
      </div>
      <div class="guestbook-intro">
        <p>欢迎留下你的想法，无论是鼓励、建议还是吐槽，我都会认真阅读。</p>
      </div>
      <h2 class="guestbook-section-title">留言板</h2>
      <p class="guestbook-desc">在这里可以自由发表你的看法。留言需要经过审核后才会公开显示。</p>
      <section class="guestbook-section" id="guestbook-section">
        <h2 class="guestbook-section-title">精选留言</h2>
        ${ctx.enabled
          ? html`${CommentList(ctx.comments, '访客留言 | ' + ctx.settings.title)}
              ${CommentForm('guestbook', 'guestbook', { editorId: 'gb-editor' })}`
          : html`<div class="guestbook-empty">留言板已关闭。</div>`}
      </section>`,
  )
}

export function renderPage(ctx: PageContext) {
  return Layout(
    { ...ctx, title: ctx.post.title },
    html`<article>
      <header class="post-header">
        <h1 class="post-title">${ctx.post.title}</h1>
      </header>
      <div class="post-content">${raw(ctx.post.contentHtml)}</div>
    </article>`,
  )
}

export function renderNotFound(ctx: NotFoundContext) {
  return Layout(
    { ...ctx, title: '页面不存在' },
    html`<div class="not-found">
      <h1>404</h1>
      <p>这里空空如也。</p>
      <a href="/">回到首页</a>
    </div>`,
  )
}
