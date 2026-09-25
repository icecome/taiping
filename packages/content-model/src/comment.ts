export interface CommentReply {
  id: string
  contentHtml: string
  replyType: string
  replyFromEmail: string
  createdAt: string
}

export interface Comment {
  id: string
  targetType: 'post' | 'page' | 'guestbook' | 'moment'
  targetId: string
  parentId: string | null
  nickname: string
  email?: string
  website?: string
  content: string
  contentHtml: string
  status: 'waiting' | 'approved' | 'spam'
  isFeatured: boolean
  createdAt: string
  replies: CommentReply[]
}
