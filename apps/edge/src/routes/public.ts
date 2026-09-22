import { Hono } from 'hono'
import { buildExcerptAndReading, findPrevNext, paginate } from '@taiping/renderer/derive'
import { renderMarkdownSafe } from '@taiping/renderer/markdown'
import { monthOf } from '@taiping/shared-utils/date'
import {
  renderArchives,
  renderGuestbook,
  renderIndex,
  renderMoments,
  renderNotFound,
  renderPage,
  renderPost,
  renderTaxonomy,
  type PostCardData,
} from '@taiping/theme-zhuosu'
import type { AppEnv } from '../lib/http'
import type { AppContext } from '../lib/http'
import { getSettings } from '../lib/settings'
import { getPostBySlug, getPostTerms, getPublishedPosts } from '../services/posts'
import { listPublicComments } from '../services/comments'
import { listPublishedMoments } from '../services/moments'
import { getTermBySlug, listTerms, listPostsByTermSlug } from '../services/terms'
import { verifyUnlockToken, unlockCookieName } from '../services/auth'
import type { Post } from '@taiping/content-model/post'
import type { SiteSettings } from '@taiping/content-model/settings'

const publicRoutes = new Hono<AppEnv>()

/** 站点地址未在设置中配置时的兜底：取当前请求的 origin */
function requestOrigin(c: AppContext): string {
  return new URL(c.req.url).origin
}

function toCard(post: Post, meta: { categories: PostCardData['categories']; tags: PostCardData['tags'] }): PostCardData {
  const derived = buildExcerptAndReading(post)
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: derived.excerpt,
    cover: post.cover,
    publishedAt: post.publishedAt,
    readingTime: derived.readingTime,
    categories: meta.categories,
    tags: meta.tags,
    encrypt: post.encrypt,
  }
}

async function loadCards(db: D1Database, posts: Post[]): Promise<PostCardData[]> {
  return Promise.all(
    posts.map(async (post) => {
      const terms = await getPostTerms(db, post.id)
      return toCard(post, terms)
    }),
  )
}

async function pageParam(c: { req: { query: (k: string) => string | undefined } }): Promise<number> {
  return Number(c.req.query('page') ?? '1') || 1
}

publicRoutes.get('/', async (c) => {
  const settings = await getSettings(c.env.DB)
  const posts = await getPublishedPosts(c.env.DB, 'post')
  const page = await pageParam(c)
  const paged = paginate(posts, page, settings.postsPerPage)
  const cards = await loadCards(c.env.DB, paged.items)
  const html = renderIndex({
    settings,
    path: '/',
    title: settings.title,
    description: settings.description,
    posts: cards,
    pagination: { page: paged.page, totalPages: paged.totalPages, basePath: '/' },
  })
  return c.html(html)
})

publicRoutes.get('/posts/:slug', async (c) => {
  const settings = await getSettings(c.env.DB)
  const post = await getPostBySlug(c.env.DB, c.req.param('slug'), 'post')
  if (!post || post.status !== 'published') {
    return c.html(
      renderNotFound({ settings, path: c.req.path, title: '页面不存在' }),
      404,
    )
  }
  const terms = await getPostTerms(c.env.DB, post.id)
  const all = await getPublishedPosts(c.env.DB, 'post')
  const { prev: newer, next: older } = findPrevNext(all, post.id)
  // 对齐原版：前篇=时间更早，后篇=时间更晚
  const prev = older ? { slug: older.slug, title: older.title } : null
  const next = newer ? { slug: newer.slug, title: newer.title } : null
  const unlocked =
    !post.encrypt ||
    (await verifyUnlockToken(
      parseCookie(c.req.header('Cookie'), unlockCookieName(post.slug)),
      post.id,
      c.env.SESSION_SECRET,
    ))
  const contentHtml = unlocked ? renderMarkdownSafe(post.contentMd) : ''
  return c.html(
    renderPost({
      settings,
      path: c.req.path,
      title: post.title,
      description: post.excerpt,
      post: { ...post, contentHtml },
      categories: terms.categories,
      tags: terms.tags,
      prev,
      next,
      comments: [],
      unlocked,
      canComment: false,
    }),
  )
})

publicRoutes.get('/pages/:slug', async (c) => {
  const settings = await getSettings(c.env.DB)
  const slug = c.req.param('slug')
  if (slug === 'guestbook' || slug === 'links') {
    return c.redirect(slug === 'guestbook' ? '/guestbook' : '/pages/links')
  }
  const post = await getPostBySlug(c.env.DB, slug, 'page')
  if (!post || post.status !== 'published') {
    return c.html(renderNotFound({ settings, path: c.req.path, title: '页面不存在' }), 404)
  }
  const comments = await listPublicComments(c.env.DB, 'post', post.id)
  return c.html(
    renderPage({
      settings,
      path: c.req.path,
      title: post.title,
      description: post.excerpt,
      post: { ...post, contentHtml: renderMarkdownSafe(post.contentMd) },
      comments,
      canComment: settings.guestbookEnabled && (post.template === 'guestbook' || slug === 'about'),
    }),
  )
})

publicRoutes.get('/archives', async (c) => {
  const settings = await getSettings(c.env.DB)
  const posts = await getPublishedPosts(c.env.DB, 'post')
  const cards = await loadCards(c.env.DB, posts)
  const groupBy = settings.archiveGroupBy
  const map = new Map<string, PostCardData[]>()
  for (const card of cards) {
    const key =
      groupBy === 'month'
        ? monthOf(card.publishedAt)
        : card.publishedAt
          ? card.publishedAt.slice(0, 4)
          : '未标注'
    const list = map.get(key) ?? []
    list.push(card)
    map.set(key, list)
  }
  const groups = [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, list]) => ({
      key,
      label: key,
      posts: list,
    }))
  return c.html(
    renderArchives({
      settings,
      path: '/archives',
      title: '归档',
      groups,
    }),
  )
})

publicRoutes.get('/moments', async (c) => {
  const settings = await getSettings(c.env.DB)
  const page = await pageParam(c)
  const pageSize = 5
  const all = await listPublishedMoments(c.env.DB, 500)
  const paged = paginate(all, page, pageSize)
  return c.html(
    renderMoments({
      settings,
      path: '/moments',
      title: '说说',
      moments: paged.items,
      pagination: {
        page: paged.page,
        totalPages: paged.totalPages,
        basePath: '/moments',
      },
    }),
  )
})

publicRoutes.get('/guestbook', async (c) => {
  const settings = await getSettings(c.env.DB)
  const comments = await listPublicComments(c.env.DB, 'guestbook', 'guestbook', {
    featuredOnly: false,
  })
  return c.html(
    renderGuestbook({
      settings,
      path: '/guestbook',
      title: '留言',
      comments,
      enabled: settings.guestbookEnabled,
    }),
  )
})

publicRoutes.get('/categories', async (c) => {
  const settings = await getSettings(c.env.DB)
  const terms = await listTerms(c.env.DB, 'category')
  const withCounts = await Promise.all(
    terms.map(async (term) => {
      const posts = await listPostsByTermSlug(c.env.DB, 'category', term.slug)
      return { ...term, count: posts.length }
    }),
  )
  return c.html(
    renderTaxonomy({
      settings,
      path: '/categories',
      title: '分类',
      termType: 'category',
      terms: withCounts,
      posts: [],
    }),
  )
})

publicRoutes.get('/categories/:slug', async (c) => renderTermPage(c, 'category'))

publicRoutes.get('/tags', async (c) => {
  const settings = await getSettings(c.env.DB)
  const terms = await listTerms(c.env.DB, 'tag')
  const withCounts = await Promise.all(
    terms.map(async (term) => {
      const posts = await listPostsByTermSlug(c.env.DB, 'tag', term.slug)
      return { ...term, count: posts.length }
    }),
  )
  return c.html(
    renderTaxonomy({
      settings,
      path: '/tags',
      title: '标签',
      termType: 'tag',
      terms: withCounts,
      posts: [],
    }),
  )
})

publicRoutes.get('/tags/:slug', async (c) => renderTermPage(c, 'tag'))

async function renderTermPage(c: AppContext, type: 'category' | 'tag') {
  const settings = await getSettings(c.env.DB)
  const slug = c.req.param('slug') ?? ''
  const term = await getTermBySlug(c.env.DB, type, slug)
  if (!term) {
    return c.html(renderNotFound({ settings, path: c.req.path, title: '未找到' }), 404)
  }
  const posts = await listPostsByTermSlug(c.env.DB, type, slug)
  const cards = await loadCards(c.env.DB, posts)
  return c.html(
    renderTaxonomy({
      settings,
      path: c.req.path,
      title: term.name,
      termType: type,
      term,
      terms: [{ ...term, count: cards.length }],
      posts: cards,
    }),
  )
}

publicRoutes.get('/rss.xml', async (c) => {
  const settings = await getSettings(c.env.DB)
  const all = await getPublishedPosts(c.env.DB, 'post')
  // 加密文章不下发：其摘要可能由正文派生，与 search.ts 的可见性判据保持一致
  const posts = all.filter((post) => !post.encrypt)
  // 站点地址优先取设置项；未配置时回落到请求自身 origin
  const siteUrl = settings.url || requestOrigin(c)
  const items = posts
    .slice(0, 20)
    .map((post) => {
      const derived = buildExcerptAndReading(post)
      const link = `${siteUrl.replace(/\/$/, '')}/posts/${post.slug}`
      return `    <item>
      <title><![CDATA[${post.title}]]></title>
      <link>${link}</link>
      <guid>${link}</guid>
      <pubDate>${new Date(post.publishedAt || post.createdAt).toUTCString()}</pubDate>
      <description><![CDATA[${derived.excerpt}]]></description>
    </item>`
    })
    .join('\n')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title><![CDATA[${settings.title}]]></title>
    <link>${siteUrl}</link>
    <description><![CDATA[${settings.description || settings.title}]]></description>
    <language>zh-CN</language>
${items}
  </channel>
</rss>`
  return c.body(xml, 200, { 'Content-Type': 'application/rss+xml; charset=utf-8' })
})

publicRoutes.get('/sitemap.xml', async (c) => {
  const settings = await getSettings(c.env.DB)
  const siteUrl = (settings.url || requestOrigin(c)).replace(/\/$/, '')
  const posts = await getPublishedPosts(c.env.DB, 'post')
  const pages = await getPublishedPosts(c.env.DB, 'page')
  const urls = [
    `${siteUrl}/`,
    `${siteUrl}/archives`,
    `${siteUrl}/moments`,
    `${siteUrl}/guestbook`,
    ...posts.map((p) => `${siteUrl}/posts/${p.slug}`),
    ...pages.map((p) => `${siteUrl}/pages/${p.slug}`),
  ]
  const body = urls.map((url) => `  <url><loc>${url}</loc></url>`).join('\n')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`
  return c.body(xml, 200, { 'Content-Type': 'application/xml; charset=utf-8' })
})

function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined
  const parts = header.split(';').map((p) => p.trim())
  const hit = parts.find((p) => p.startsWith(`${name}=`))
  return hit ? hit.slice(name.length + 1) : undefined
}

export default publicRoutes
