export type AppEnv = {
  Bindings: {
    DB: D1Database
    KV: KVNamespace
    ASSETS?: Fetcher
    SESSION_SECRET?: string
    APP_ENV?: string
  }
  Variables: {
    user: SessionUser
  }
}

export type Role = 'admin' | 'editor' | 'author' | 'subscriber'

export type SessionUser = {
  id: number
  name: string
  email: string
  displayName: string
  role: Role
}
