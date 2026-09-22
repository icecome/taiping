export interface SearchDoc {
  id: string
  type: 'post' | 'page' | 'moment'
  title: string
  excerpt: string
  url: string
  publishedAt?: string
}

/**
 * 前台搜索索引：仅标题与摘要，排除加密文章（与现状一致）。
 */
export function buildSearchDocs(
  posts: Array<{
    id: string
    slug: string
    type: 'post' | 'page'
    title: string
    excerpt: string
    status: string
    encrypt: boolean
    publishedAt?: string
  }>,
): SearchDoc[] {
  return posts
    .filter((p) => p.status === 'published' && !p.encrypt)
    .map((p) => ({
      id: p.id,
      type: p.type,
      title: p.title,
      excerpt: p.excerpt,
      url: p.type === 'page' ? `/pages/${p.slug}` : `/posts/${p.slug}`,
      publishedAt: p.publishedAt,
    }))
}

export function filterSearchDocs(docs: SearchDoc[], keyword: string): SearchDoc[] {
  const q = keyword.trim().toLowerCase()
  if (!q) return []
  return docs.filter(
    (doc) =>
      doc.title.toLowerCase().includes(q) || doc.excerpt.toLowerCase().includes(q),
  )
}
