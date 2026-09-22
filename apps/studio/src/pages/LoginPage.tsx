import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { api } from '../api/endpoints'
import { Button } from '../components/ui/Button'
import { HttpError } from '../api/client'

export function LoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [trusted, setTrusted] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const login = useMutation({
    mutationFn: () => api.auth.login(username, password, trusted),
    onSuccess: () => navigate('/', { replace: true }),
    onError: (err) => {
      setError(err instanceof HttpError ? err.message : '登录失败')
    },
  })

  return (
    <div className="min-h-screen grid place-items-center bg-background p-6">
      <form
        className="w-full max-w-sm border border-border bg-card rounded-sm p-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          login.mutate()
        }}
      >
        <div>
          <h1 className="text-lg font-medium text-foreground">登录太平后台</h1>
          <p className="text-xs text-muted-foreground mt-1">账号口令来自环境变量配置</p>
        </div>
        <label className="block text-sm">
          <span className="text-muted-foreground">用户名</span>
          <input
            className="input-ink mt-1"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">密码</span>
          <input
            className="input-ink mt-1"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={trusted}
            onChange={(e) => setTrusted(e.target.checked)}
          />
          受信设备（7 天会话）
        </label>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" variant="primary" className="w-full" disabled={login.isPending}>
          {login.isPending ? '登录中…' : '登录'}
        </Button>
      </form>
    </div>
  )
}
