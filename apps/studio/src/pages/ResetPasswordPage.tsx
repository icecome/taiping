import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { KeyRound } from 'lucide-react'
import { api } from '../api/endpoints'
import { HttpError } from '../api/client'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { LoadingState } from '../components/ui/LoadingState'

const MIN_LENGTH = 8

const STATE_HINT: Record<string, string> = {
  invalid: '重置链接无效，请重新申请。',
  expired: '重置链接已过期，请重新申请。',
  used: '重置链接已被使用，请重新申请。',
}

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') ?? ''

  const [newPassword, setNew] = useState('')
  const [confirmPassword, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)

  const inspected = useQuery({
    queryKey: ['reset-token', token],
    queryFn: () => api.auth.inspectResetToken(token),
    enabled: Boolean(token),
  })

  const reset = useMutation({
    mutationFn: () => api.auth.resetPassword({ token, newPassword, confirmPassword }),
    onSuccess: () => navigate('/login?reset=1', { replace: true }),
    onError: (err) => {
      setError(err instanceof HttpError ? err.message : '重置失败')
    },
  })

  useEffect(() => {
    setError(null)
  }, [token])

  if (!token) {
    return <Centered>
      <Hint>缺少重置令牌，请从邮件中的链接进入。</Hint>
    </Centered>
  }

  if (inspected.isLoading) {
    return <Centered><LoadingState rows={3} /></Centered>
  }

  const state = inspected.data?.state
  if (state !== 'valid') {
    return (
      <Centered>
        <Hint>{STATE_HINT[state ?? 'invalid'] ?? STATE_HINT.invalid}</Hint>
        <Button variant="ghost" onClick={() => navigate('/login')}>返回登录</Button>
      </Centered>
    )
  }

  const submit = () => {
    setError(null)
    if (newPassword.length < MIN_LENGTH) {
      setError(`新口令至少 ${MIN_LENGTH} 位`)
      return
    }
    if (newPassword !== confirmPassword) {
      setError('两次输入的新口令不一致')
      return
    }
    reset.mutate()
  }

  return (
    <Centered>
      <form
        className="w-full max-w-sm border border-border bg-card rounded-sm p-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div>
          <h1 className="text-lg font-medium text-foreground">设置新口令</h1>
          <p className="text-xs text-muted-foreground mt-1">设置后所有登录会话将失效</p>
        </div>
        <label className="block text-sm">
          <span className="text-muted-foreground">新口令（至少 {MIN_LENGTH} 位）</span>
          <Input
            type="password"
            className="mt-1"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNew(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">确认新口令</span>
          <Input
            type="password"
            className="mt-1"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button
          type="submit"
          variant="primary"
          className="w-full"
          disabled={reset.isPending || !newPassword || !confirmPassword}
        >
          <KeyRound size={14} className="mr-1.5" />
          {reset.isPending ? '提交中…' : '确认重置'}
        </Button>
      </form>
    </Centered>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid place-items-center bg-background p-6">
      <div className="w-full max-w-sm space-y-3">{children}</div>
    </div>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-border bg-card rounded-sm p-6 text-sm text-muted-foreground">
      {children}
    </div>
  )
}
