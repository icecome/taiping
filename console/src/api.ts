export type SessionUser = {
  id: number
  name: string
  email: string
  displayName: string
  role: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...init,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || res.statusText)
  }
  return data as T
}

export const api = {
  me: () => request<{ user: SessionUser | null }>('/api/auth/me'),
  installStatus: () => request<{ initialized: boolean }>('/install-status'),
  setup: (name: string, email: string, password: string) =>
    request<{ ok: boolean }>('/api/setup', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    }),
  login: (name: string, password: string) =>
    request<{ user: SessionUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ name, password }),
    }),
  posts: (page = 1) => request<{ posts: Array<Record<string, unknown>> }>(`/api/admin/posts?page=${page}`),
  createPost: (body: unknown) =>
    request<{ id: number }>('/api/posts', { method: 'POST', body: JSON.stringify(body) }),
  updatePost: (id: number, body: unknown) =>
    request<{ ok: boolean }>(`/api/posts/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deletePost: (id: number) =>
    request<{ ok: boolean }>(`/api/posts/${id}`, { method: 'DELETE' }),
  getPost: (id: number) => request<{ post: Record<string, unknown> }>(`/api/admin/posts/${id}`),
  settings: () => request<{ settings: Record<string, unknown> }>('/api/settings'),
  saveSettings: (settings: unknown) =>
    request<{ settings: unknown }>('/api/settings', { method: 'PUT', body: JSON.stringify(settings) }),
  messages: (status?: string) =>
    request<{ items: Array<Record<string, unknown>> }>(
      `/api/admin/messages${status ? `?status=${status}` : ''}`,
    ),
  messageAction: (id: number, action: string) =>
    request<{ ok: boolean }>(`/api/admin/messages/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action }),
    }),
  replyMessage: (id: number, content: string) =>
    request<{ ok: boolean }>(`/api/admin/messages/${id}/reply`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
  importMessages: (payload: unknown) =>
    request<{ summary: unknown }>('/api/admin/messages/import', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
}
