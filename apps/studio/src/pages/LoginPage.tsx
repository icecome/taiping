import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { api } from '../api/endpoints'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { HttpError } from '../api/client'

type Mode = 'login' | 'forgot'

export function LoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [mode, setMode] = useState<Mode>('login')

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [trusted, setTrusted] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // 重置成功跳回登录页时给出提示
  useEffect(() => {
    if (params.get('reset') === '1') {
      setNotice('口令已重置，请使用新口令登录。')
    }
  }, [params])

  const login = useMutation({
    mutationFn: () => api.auth.login(username, password, trusted),
    onSuccess: () => navigate('/', { replace: true }),
    onError: (err) => {
      setError(err instanceof HttpError ? err.message : '登录失败')
    },
  })

  const forgot = useMutation({
    mutationFn: () => api.auth.forgotPassword(username),
    onSuccess: () => {
      setMode('login')
      setNotice('若该账号已配置恢复邮箱，重置链接已发送，请查收邮件。')
      setError(null)
    },
    onError: (err) => {
      setError(err instanceof HttpError ? err.message : '提交失败')
    },
  })

  const submitLogin = () => {
    setError(null)
    setNotice(null)
    login.mutate()
  }

  const submitForgot = () => {
    setError(null)
    setNotice(null)
    forgot.mutate()
  }

  return (
    <div className="min-h-screen grid place-items-center bg-background p-6">
      <form
        className="w-full max-w-sm border border-border bg-card rounded-sm p-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          mode === 'login' ? submitLogin() : submitForgot()
        }}
      >
        <div>
          <h1 className="text-lg font-medium text-foreground">
            {mode === 'login' ? '登录太平后台' : '重置口令'}
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            {mode === 'login'
              ? '使用管理员账号登录'
              : '输入用户名，重置链接将发送至已配置的恢复邮箱'}
          </p>
        </div>

        <label className="block text-sm">
          <span className="text-muted-foreground">用户名</span>
          <Input
            className="mt-1"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </label>

        {mode === 'login' ? (
          <>
            <label className="block text-sm">
              <span className="text-muted-foreground">密码</span>
              <Input
                className="mt-1"
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
          </>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

        <Button
          type="submit"
          variant="primary"
          className="w-full"
          disabled={login.isPending || forgot.isPending}
        >
          {mode === 'login'
            ? login.isPending
              ? '登录中…'
              : '登录'
            : forgot.isPending
              ? '提交中…'
              : '发送重置链接'}
        </Button>

        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => {
            setMode(mode === 'login' ? 'forgot' : 'login')
            setError(null)
            setNotice(null)
          }}
        >
          {mode === 'login' ? '忘记口令？' : '返回登录'}
        </button>
      </form>
    </div>
  )
}
