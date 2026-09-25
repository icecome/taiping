import { getSiteSettings } from '../services/settings'
import { listPublishedPosts } from '../services/posts'

export async function buildSitemap(db: D1Database): Promise<string> {
  const settings = await getSiteSettings(db)
  const { posts } = await listPublishedPosts(db, { page: 1, pageSize: 500 })
  const urls = [
    '/',
    '/archives',
    '/categories',
    '/tags',
    '/moments',
    '/guestbook',
    ...posts.map((p) => `/posts/${p.slug}`),
  ]

  const body = urls
    .map(
      (u) => `  <url>
    <loc>${escapeXml(u)}</loc>
    <changefreq>daily</changefreq>
  </url>`,
    )
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>`
}

function escapeXml(input: string): string {
  return input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
