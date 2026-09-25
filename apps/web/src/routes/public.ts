import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { getSiteSettings } from '../services/settings'
import { getPostBySlug, listPublishedPosts } from '../services/posts'
import { listMoments } from '../services/moments'
import { listMessages } from '../services/message-store'
import { toThemeComment } from '../services/messages'
import { themeRenderer } from '../theme/render'
import { buildSitemap } from '../lib/sitemap'

export const publicRoutes = new Hono<AppEnv>()

function pageFromQuery(raw: string | undefined): number {
  const n = Number(raw || '1')
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1
}

function escapeXml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function postCard(p: {
  id: string
  slug: string
  title: string
  excerpt: string
  cover?: string
  publishedAt?: string
  readingTime?: string
  categories: Array<{ id: string; name: string; slug: string }>
  tags: Array<{ id: string; name: string; slug: string }>
  encrypt?: boolean
}) {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    cover: p.cover,
    publishedAt: p.publishedAt,
    readingTime: p.readingTime,
    categories: p.categories,
    tags: p.tags,
    encrypt: p.encrypt,
  }
}

publicRoutes.get('/', async (c) => {
  const settings = await getSiteSettings(c.env.DB)
  const page = pageFromQuery(c.req.query('page'))
  const pageSize = settings.postsPerPage || 10
  const { posts, total } = await listPublishedPosts(c.env.DB, { page, pageSize })
  return c.html(
    themeRenderer.index({
      settings,
      posts,
      page,
      total,
      pageSize,
      basePath: '/',
    }),
  )
})

publicRoutes.get('/posts/:slug', async (c) => {
  const settings = await getSiteSettings(c.env.DB)
  const post = await getPostBySlug(c.env.DB, c.req.param('slug'))
  if (!post || post.status !== 'published') {
    return c.html(themeRenderer.notFound({ settings }), 404)
  }

  const cookieName = `tp_post_${post.id}`
  const unlocked =
    !post.password ||
    c.req.query('unlocked') === '1' ||
    Boolean(c.req.header('cookie')?.includes(`${cookieName}=1`))

  const comments =
    post.allowComment && settings.commentEnabled
      ? (
          await listMessages(c.env.DB, {
            target_type: 'post',
            target_id: post.id,
            page_url: `/posts/${post.slug}`,
            limit: 100,
          })
        ).map(toThemeComment)
      : []

  const siblings = await listPublishedPosts(c.env.DB, { page: 1, pageSize: 200 })
  const idx = siblings.posts.findIndex((p) => p.id === post.id)
  const prev =
    idx >= 0 && idx < siblings.posts.length - 1
      ? {
          slug: siblings.posts[idx + 1]!.slug,
          title: siblings.posts[idx + 1]!.title,
        }
      : null
  const next =
    idx > 0
      ? {
          slug: siblings.posts[idx - 1]!.slug,
          title: siblings.posts[idx - 1]!.title,
        }
      : null

  return c.html(
    themeRenderer.post({
      settings,
      post,
      comments,
      prev,
      next,
      unlocked,
    }),
  )
})

publicRoutes.get('/archives', async (c) => {
  const settings = await getSiteSettings(c.env.DB)
  const { posts } = await listPublishedPosts(c.env.DB, { page: 1, pageSize: 500 })
  const map = new Map<string, ReturnType<typeof postCard>[]>()
  for (const p of posts) {
    const key = (p.publishedAt || p.createdAt).slice(0, 7)
    const list = map.get(key) ?? []
    list.push(postCard(p))
    map.set(key, list)
  }
  const groups = [...map.entries()].map(([key, list]) => ({
    key,
    label: `${key.slice(0, 4)}年${key.slice(5)}月`,
    posts: list,
  }))
  return c.html(themeRenderer.archives({ settings, groups }))
})

publicRoutes.get('/categories', async (c) => {
  const settings = await getSiteSettings(c.env.DB)
  const rows = await c.env.DB.prepare(
    `SELECT id, name, slug, count FROM metas WHERE type = 'category' ORDER BY order_num, name`,
  ).all()
  const terms = (rows.results ?? []).map((r) => {
    const row = r as { id: number; name: string; slug: string; count: number }
    return {
      id: String(row.id),
      name: row.name,
      slug: row.slug,
      count: row.count,
    }
  })
  return c.html(
    themeRenderer.taxonomy({
      settings,
      termType: 'category',
      terms,
      posts: [],
    }),
  )
})

publicRoutes.get('/categories/:slug', async (c) => {
  const settings = await getSiteSettings(c.env.DB)
  const slug = c.req.param('slug')
  const meta = await c.env.DB.prepare(
    `SELECT id, name, slug FROM metas WHERE type = 'category' AND slug = ?`,
  )
    .bind(slug)
    .first<{ id: number; name: string; slug: string }>()

  const rows = await c.env.DB.prepare(
    `SELECT p.* FROM posts p
     INNER JOIN relationships r ON r.post_id = p.id
     INNER JOIN metas m ON m.id = r.meta_id
     WHERE m.type = 'category' AND m.slug = ? AND p.status = 'published' AND p.deleted = 0
     ORDER BY p.published_at DESC`,
  )
    .bind(slug)
    .all()

  const posts = (rows.results ?? []).map((r) => {
    const row = r as {
      id: number
      slug: string
      title: string
      excerpt: string
      cover: string
      reading_time: string
      published_at: string | null
      created_at: string
      password: string | null
    }
    return postCard({
      id: String(row.id),
      slug: row.slug,
      title: row.title,
      excerpt: row.excerpt,
      cover: row.cover || undefined,
      publishedAt: row.published_at || undefined,
      readingTime: row.reading_time || undefined,
      categories: [],
      tags: [],
      encrypt: Boolean(row.password),
    })
  })

  return c.html(
    themeRenderer.taxonomy({
      settings,
      termType: 'category',
      term: meta ? { id: String(meta.id), name: meta.name, slug: meta.slug } : undefined,
      terms: [],
      posts: posts as never,
    }),
  )
})

publicRoutes.get('/tags', async (c) => {
  const settings = await getSiteSettings(c.env.DB)
  const rows = await c.env.DB.prepare(
    `SELECT id, name, slug, count FROM metas WHERE type = 'tag' ORDER BY count DESC, name`,
  ).all()
  const terms = (rows.results ?? []).map((r) => {
    const row = r as { id: number; name: string; slug: string; count: number }
    return {
      id: String(row.id),
      name: row.name,
      slug: row.slug,
      count: row.count,
    }
  })
  return c.html(themeRenderer.taxonomy({ settings, termType: 'tag', terms, posts: [] }))
})

publicRoutes.get('/moments', async (c) => {
  const settings = await getSiteSettings(c.env.DB)
  const moments = await listMoments(c.env.DB)
  return c.html(themeRenderer.moments({ settings, moments }))
})

publicRoutes.get('/guestbook', async (c) => {
  const settings = await getSiteSettings(c.env.DB)
  const comments = (
    await listMessages(c.env.DB, {
      target_type: 'guestbook',
      target_id: 'guestbook',
      page_url: '/guestbook',
      limit: 100,
    })
  ).map(toThemeComment)
  return c.html(themeRenderer.guestbook({ settings, comments }))
})

publicRoutes.get('/sitemap.xml', async (c) => {
  const xml = await buildSitemap(c.env.DB)
  return c.body(xml, 200, { 'Content-Type': 'application/xml; charset=utf-8' })
})

publicRoutes.get('/rss.xml', async (c) => {
  const settings = await getSiteSettings(c.env.DB)
  const { posts } = await listPublishedPosts(c.env.DB, { page: 1, pageSize: 20 })
  const items = posts
    .map(
      (p) => `    <item>
      <title>${escapeXml(p.title)}</title>
      <link>/posts/${escapeXml(p.slug)}</link>
      <description>${escapeXml(p.excerpt)}</description>
      <pubDate>${p.publishedAt || p.createdAt}</pubDate>
    </item>`,
    )
    .join('\n')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(settings.title)}</title>
    <description>${escapeXml(settings.description)}</description>
${items}
  </channel>
</rss>`
  return c.body(xml, 200, { 'Content-Type': 'application/rss+xml; charset=utf-8' })
})

publicRoutes.get('/theme/*', async (c) => {
  if (c.env.ASSETS) {
    const res = await c.env.ASSETS.fetch(c.req.raw)
    return new Response(res.body, res)
  }
  return c.text('asset not found', 404)
})
