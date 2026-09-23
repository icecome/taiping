import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../api/endpoints'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { HttpError } from '../api/client'

type Mode = 'login' | 'forgot' | 'setup'

export function LoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [mode, setMode] = useState<Mode>('login')
  const [forceLogin, setForceLogin] = useState(false)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [trusted, setTrusted] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // 重置成功跳回登录页时给出提示
  useEffect(() => {
    if (params.get('reset') === '1') {
      setNotice('口令已重置，请使用新口令登录。')
    }
  }, [params])

  const bootstrap = useQuery({
    queryKey: ['auth-bootstrap'],
    queryFn: () => api.auth.bootstrap(),
  })

  // 系统尚无管理员时优先展示初始化注册
  useEffect(() => {
    if (bootstrap.data?.needsSetup && !forceLogin) {
      setMode('setup')
    }
  }, [bootstrap.data, forceLogin])

  const login = useMutation({
    mutationFn: () => api.auth.login(username, password, trusted),
    onSuccess: () => navigate('/', { replace: true }),
    onError: (err) => {
      setError(err instanceof HttpError ? err.message : '登录失败')
    },
  })

  const register = useMutation({
    mutationFn: () =>
      api.auth.register({ username, password, confirmPassword, trusted }),
    onSuccess: () => navigate('/', { replace: true }),
    onError: (err) => {
      if (err instanceof HttpError && err.code === 'SETUP_ALREADY_DONE') {
        setForceLogin(true)
        setMode('login')
        setNotice('系统已初始化，请直接登录。')
        setError(null)
        return
      }
      setError(err instanceof HttpError ? err.message : '注册失败')
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

  const submitRegister = () => {
    setError(null)
    setNotice(null)
    register.mutate()
  }

  const submitForgot = () => {
    setError(null)
    setNotice(null)
    forgot.mutate()
  }

  const isSetup = mode === 'setup'
  const isForgot = mode === 'forgot'
  const pending = login.isPending || forgot.isPending || register.isPending

  const title = isSetup ? '初始化管理员' : isForgot ? '重置口令' : '登录太平后台'
  const subtitle = isSetup
    ? '系统尚无管理员，请创建首个账号'
    : isForgot
      ? '输入用户名，重置链接将发送至已配置的恢复邮箱'
      : '使用管理员账号登录'

  return (
    <div className="min-h-screen grid place-items-center bg-background p-6">
      <form
        className="w-full max-w-sm border border-border bg-card rounded-sm p-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (isSetup) submitRegister()
          else if (isForgot) submitForgot()
          else submitLogin()
        }}
      >
        <div>
          <h1 className="text-lg font-medium text-foreground">{title}</h1>
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
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

        {isSetup || !isForgot ? (
          <label className="block text-sm">
            <span className="text-muted-foreground">密码</span>
            <Input
              className="mt-1"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isSetup ? 'new-password' : 'current-password'}
              required
            />
            {isSetup ? (
              <p className="text-xs text-muted-foreground mt-1">至少 8 位，建议混合字母与数字</p>
            ) : null}
          </label>
        ) : null}

        {isSetup ? (
          <label className="block text-sm">
            <span className="text-muted-foreground">确认密码</span>
            <Input
              className="mt-1"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </label>
        ) : null}

        {isSetup || !isForgot ? (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={trusted}
              onChange={(e) => setTrusted(e.target.checked)}
            />
            受信设备（7 天会话）
          </label>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

        <Button type="submit" variant="primary" className="w-full" disabled={pending}>
          {isSetup
            ? register.isPending
              ? '创建中…'
              : '创建账号并登录'
            : isForgot
              ? forgot.isPending
                ? '提交中…'
                : '发送重置链接'
              : login.isPending
                ? '登录中…'
                : '登录'}
        </Button>

        <div className="flex items-center justify-between gap-2">
          {!isSetup ? (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => {
                setMode(isForgot ? 'login' : 'forgot')
                setError(null)
                setNotice(null)
              }}
            >
              {isForgot ? '返回登录' : '忘记口令？'}
            </button>
          ) : (
            <span />
          )}
          {isSetup ? (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => {
                setForceLogin(true)
                setMode('login')
                setError(null)
                setNotice(null)
              }}
            >
              已有账号，去登录
            </button>
          ) : bootstrap.data?.needsSetup ? (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => {
                setForceLogin(false)
                setMode('setup')
                setError(null)
                setNotice(null)
              }}
            >
              去初始化
            </button>
          ) : null}
        </div>
      </form>
    </div>
  )
}
