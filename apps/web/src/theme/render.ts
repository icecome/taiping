import type { Post, SiteSettings, Comment, Moment } from '@taiping/content-model'
import { theme as zhuosu } from '@taiping/theme-zhuosu'
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
} from '@taiping/theme-zhuosu'

function toCard(post: Post) {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    cover: post.cover,
    publishedAt: post.publishedAt,
    readingTime: post.readingTime,
    categories: post.categories,
    tags: post.tags,
    encrypt: post.encrypt,
  }
}

function baseMeta(settings: SiteSettings, path: string, title?: string, description?: string) {
  return {
    settings,
    path,
    title: title || settings.title,
    description: description || settings.description,
  }
}

function pagination(page: number, total: number, pageSize: number, basePath: string) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  return { page, totalPages, basePath }
}

export const themeRenderer = {
  name: zhuosu.name,
  styles: zhuosu.styles,
  scripts: zhuosu.scripts,

  index(ctx: { settings: SiteSettings; posts: Post[]; page: number; total: number; pageSize: number; basePath: string }) {
    const context: IndexContext = {
      ...baseMeta(ctx.settings, '/'),
      posts: ctx.posts.map(toCard),
      pagination: pagination(ctx.page, ctx.total, ctx.pageSize, ctx.basePath),
    }
    return String(zhuosu.renderIndex(context))
  },

  list(ctx: {
    settings: SiteSettings
    heading: string
    posts: Post[]
    page: number
    total: number
    pageSize: number
    basePath: string
  }) {
    const context: ListContext = {
      ...baseMeta(ctx.settings, ctx.basePath, ctx.heading),
      heading: ctx.heading,
      posts: ctx.posts.map(toCard),
      pagination: pagination(ctx.page, ctx.total, ctx.pageSize, ctx.basePath),
    }
    return String(zhuosu.renderList(context))
  },

  post(ctx: {
    settings: SiteSettings
    post: Post
    comments: Comment[]
    prev: { slug: string; title: string } | null
    next: { slug: string; title: string } | null
    unlocked: boolean
  }) {
    const context: PostContext = {
      ...baseMeta(ctx.settings, `/posts/${ctx.post.slug}`, ctx.post.title, ctx.post.excerpt),
      post: ctx.post,
      categories: ctx.post.categories,
      tags: ctx.post.tags,
      prev: ctx.prev,
      next: ctx.next,
      comments: ctx.comments,
      unlocked: ctx.unlocked,
      canComment: ctx.post.allowComment && ctx.settings.commentEnabled,
    }
    return String(zhuosu.renderPost(context))
  },

  page(ctx: { settings: SiteSettings; post: Post; comments: Comment[] }) {
    const context: PageContext = {
      ...baseMeta(ctx.settings, `/${ctx.post.slug}`, ctx.post.title),
      post: ctx.post,
      comments: ctx.comments,
      canComment: ctx.post.allowComment && ctx.settings.commentEnabled,
    }
    return String(zhuosu.renderPage(context))
  },

  archives(ctx: { settings: SiteSettings; groups: ArchiveContext['groups'] }) {
    const context: ArchiveContext = {
      ...baseMeta(ctx.settings, '/archives', '归档'),
      groups: ctx.groups,
    }
    return String(zhuosu.renderArchives(context))
  },

  taxonomy(ctx: {
    settings: SiteSettings
    termType: 'category' | 'tag'
    term?: { id: string; name: string; slug: string }
    terms: Array<{ id: string; name: string; slug: string; count: number }>
    posts: Post[]
  }) {
    const context: TaxonomyContext = {
      ...baseMeta(ctx.settings, ctx.termType === 'category' ? '/categories' : '/tags'),
      termType: ctx.termType,
      term: ctx.term,
      terms: ctx.terms,
      posts: ctx.posts.map(toCard),
    }
    return String(zhuosu.renderTaxonomy(context))
  },

  moments(ctx: { settings: SiteSettings; moments: Moment[] }) {
    const context: MomentsContext = {
      ...baseMeta(ctx.settings, '/moments', ctx.settings.momentsTitle || '说说'),
      moments: ctx.moments,
    }
    return String(zhuosu.renderMoments(context))
  },

  guestbook(ctx: { settings: SiteSettings; comments: Comment[] }) {
    const context: GuestbookContext = {
      ...baseMeta(ctx.settings, '/guestbook', '留言板'),
      comments: ctx.comments,
      enabled: ctx.settings.guestbookEnabled,
    }
    return String(zhuosu.renderGuestbook(context))
  },

  notFound(ctx: { settings: SiteSettings }) {
    const context: NotFoundContext = baseMeta(ctx.settings, '/404', '未找到')
    return String(zhuosu.renderNotFound(context))
  },
}
