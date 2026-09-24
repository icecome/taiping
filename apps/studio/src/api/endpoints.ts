import { http, postWithProgress } from './client'
import type { Post, PostInput } from '@taiping/content-model/post'
import type { Paginated } from '@taiping/content-model/api'
import type { Comment, CommentReply } from '@taiping/content-model/comment'
import type { Moment } from '@taiping/content-model/moment'
import type { SiteSettings } from '@taiping/content-model/settings'
import type { Term } from '@taiping/content-model/term'

export interface PostListItem extends Post {
  categories: Array<{ id: string; name: string; slug: string }>
  tags: Array<{ id: string; name: string; slug: string }>
}

export interface Overview {
  posts: { posts: number; pages: number; drafts: number }
  comments: { pending: number; approved: number; spam: number }
  moments: { published: number; draft: number }
  mirror: { pending: number; processing: number; failed: number; done: number }
}

export const api = {
  auth: {
    bootstrap: () => http.get<{ needsSetup: boolean }>('/api/admin/auth/bootstrap'),
    register: (input: {
      username: string
      password: string
      confirmPassword: string
      trusted?: boolean
    }) =>
      http.post<{ expiresAt: string; username: string }>('/api/admin/auth/register', input),
    login: (username: string, password: string, trusted = false) =>
      http.post<{ expiresAt: string }>('/api/admin/auth/login', { username, password, trusted }),
    logout: () => http.post<{ ok: true }>('/api/admin/auth/logout'),
    changePassword: (input: {
      currentPassword: string
      newPassword: string
      confirmPassword: string
    }) => http.post<{ changed: true }>('/api/admin/auth/password', input),
    forgotPassword: (username: string) =>
      http.post<{ submitted: true }>('/api/admin/auth/forgot-password', { username }),
    inspectResetToken: (token: string) =>
      http.get<{ state: 'valid' | 'invalid' | 'expired' | 'used' }>(
        `/api/admin/auth/reset-password?token=${encodeURIComponent(token)}`,
      ),
    resetPassword: (input: { token: string; newPassword: string; confirmPassword: string }) =>
      http.post<{ reset: true }>('/api/admin/auth/reset-password', input),
    getEmail: () => http.get<{ email: string }>('/api/admin/auth/email'),
    setEmail: (email: string) =>
      http.patch<{ email: string }>('/api/admin/auth/email', { email }),
    listSessions: () =>
      http.get<
        Array<{
          id: string
          createdAt: string
          expiresAt: string
          trusted: boolean
          userAgent?: string
          current: boolean
        }>
      >('/api/admin/auth/sessions'),
    revokeSession: (id: string) =>
      http.delete<{ revoked: boolean }>(`/api/admin/auth/sessions/${id}`),
    revokeOtherSessions: () =>
      http.post<{ revoked: number }>('/api/admin/auth/sessions/revoke-others'),
  },
  overview: () => http.get<Overview>('/api/admin/overview'),
  posts: {
    list: (params: Record<string, string | number | undefined | boolean>) => {
      const qs = new URLSearchParams()
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== '') qs.set(key, String(value))
      })
      return http.get<Paginated<PostListItem>>(`/api/admin/posts?${qs.toString()}`)
    },
    get: (id: string) => http.get<PostListItem>(`/api/admin/posts/${id}`),
    create: (input: PostInput) => http.post<Post>('/api/admin/posts', input),
    update: (id: string, input: PostInput) => http.patch<Post>(`/api/admin/posts/${id}`, input),
    remove: (id: string) => http.delete<{ deleted: boolean }>(`/api/admin/posts/${id}`),
    publish: (id: string, publishedAt?: string) =>
      http.post<Post>(`/api/admin/posts/${id}/publish`, publishedAt ? { publishedAt } : {}),
    unpublish: (id: string) => http.post<Post>(`/api/admin/posts/${id}/unpublish`),
    recycle: (id: string) => http.post<Post>(`/api/admin/posts/${id}/recycle`),
    restore: (id: string) => http.post<Post>(`/api/admin/posts/${id}/restore`),
    revisions: (id: string) =>
      http.get<Array<{ id: string; createdAt: string; excerpt?: string }>>(
        `/api/admin/posts/${id}/revisions`,
      ),
    revert: (id: string, revisionId: string) =>
      http.post<Post>(`/api/admin/posts/${id}/revisions/${revisionId}/revert`),
  },
  moments: {
    list: (params: Record<string, string | number | undefined>) => {
      const qs = new URLSearchParams()
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== '') qs.set(key, String(value))
      })
      return http.get<Paginated<Moment>>(`/api/admin/moments?${qs.toString()}`)
    },
    create: (input: unknown) => http.post<Moment>('/api/admin/moments', input),
    update: (id: string, input: unknown) => http.patch<Moment>(`/api/admin/moments/${id}`, input),
    remove: (id: string) => http.delete<{ deleted: boolean }>(`/api/admin/moments/${id}`),
  },
  comments: {
    list: (params: Record<string, string | number | undefined>) => {
      const qs = new URLSearchParams()
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== '') qs.set(key, String(value))
      })
      return http.get<Paginated<Comment & { replies: CommentReply[] }>>(
        `/api/admin/comments?${qs.toString()}`,
      )
    },
    moderate: (id: string, action: string) =>
      http.patch<{ action: string }>(`/api/admin/comments/${id}`, { action }),
    reply: (commentId: string, content: string) =>
      http.post<CommentReply>(`/api/admin/comments/${commentId}/reply`, { content }),
    updateReply: (commentId: string, replyId: string, content: string) =>
      http.patch<CommentReply>(`/api/admin/comments/${commentId}/reply/${replyId}`, { content }),
    deleteReply: (commentId: string, replyId: string) =>
      http.delete<{ deleted: boolean }>(`/api/admin/comments/${commentId}/reply/${replyId}`),
  },
  terms: {
    list: (type?: string) =>
      http.get<Term[]>(`/api/admin/terms${type ? `?type=${type}` : ''}`),
    create: (input: { type: string; name: string }) => http.post<Term>('/api/admin/terms', input),
    update: (id: string, input: { name?: string; slug?: string }) =>
      http.patch<Term>(`/api/admin/terms/${id}`, input),
    remove: (id: string) => http.delete<{ deleted: boolean }>(`/api/admin/terms/${id}`),
  },
  settings: {
    get: () => http.get<SiteSettings>('/api/admin/settings'),
    save: (input: Partial<SiteSettings>) => http.patch<SiteSettings>('/api/admin/settings', input),
  },
  preview: (contentMd: string, title?: string) =>
    http.post<{ html: string; title: string }>('/api/admin/preview', {
      type: 'post',
      contentMd,
      title,
    }),
  mirror: {
    status: () =>
      http.get<{
        summary: { pending: number; processing: number; failed: number; done: number }
        recent: Array<Record<string, unknown>>
      }>('/api/admin/mirror/status'),
    retry: () => http.post<{ retried: number }>('/api/admin/mirror/retry'),
  },
  media: {
    githubList: () =>
      http.get<{
        configured: boolean
        missingHint?: string
        items: Array<{ path: string; name: string; sha: string; size: number; url: string }>
      }>('/api/admin/media/github'),
    githubUpload: (input: {
      base64Content: string
      filename: string
      sha?: string
      message?: string
    }) =>
      http.post<{ path: string; sha: string; url: string }>(
        '/api/admin/media/github/upload',
        input,
      ),
    /** 带真实上传进度；onProgress 回调在 0-100 之间 */
    githubUploadWithProgress: (
      input: {
        base64Content: string
        filename: string
        sha?: string
        message?: string
      },
      onProgress?: (percent: number) => void,
      options?: { signal?: AbortSignal; timeoutMs?: number },
    ) =>
      postWithProgress<{ path: string; sha: string; url: string }>(
        '/api/admin/media/github/upload',
        input,
        onProgress,
        options,
      ),
    githubDelete: (input: { path: string; sha: string }) =>
      http.delete<{ deleted: boolean; path: string }>(
        `/api/admin/media/github?path=${encodeURIComponent(input.path)}&sha=${encodeURIComponent(input.sha)}`,
      ),
  },
}
