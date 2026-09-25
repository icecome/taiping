export interface Post {
  id: string
  slug: string
  title: string
  excerpt: string
  contentHtml: string
  contentMarkdown: string
  cover?: string
  status: 'draft' | 'published' | 'private' | 'hidden'
  password?: string
  encrypt?: boolean
  encryptHint?: string
  encryptMessage?: string
  allowComment: boolean
  pinned: boolean
  authorId: string
  template?: string
  readingTime?: string
  publishedAt?: string
  createdAt: string
  modifiedAt: string
  categories: Array<{ id: string; name: string; slug: string }>
  tags: Array<{ id: string; name: string; slug: string }>
}

export type PostSummary = Pick<
  Post,
  | 'id'
  | 'slug'
  | 'title'
  | 'excerpt'
  | 'cover'
  | 'status'
  | 'encrypt'
  | 'pinned'
  | 'readingTime'
  | 'publishedAt'
  | 'createdAt'
  | 'modifiedAt'
  | 'categories'
  | 'tags'
>
