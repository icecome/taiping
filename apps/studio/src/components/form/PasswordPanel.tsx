import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { KeyRound } from 'lucide-react'
import { api } from '../../api/endpoints'
import { HttpError } from '../../api/client'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Panel } from '../ui/Panel'

const MIN_LENGTH = 8

export function PasswordPanel() {
  const [currentPassword, setCurrent] = useState('')
  const [newPassword, setNew] = useState('')
  const [confirmPassword, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)

  const change = useMutation({
    mutationFn: () => api.auth.changePassword({ currentPassword, newPassword, confirmPassword }),
    onSuccess: () => {
      // 服务端已清空全部会话，回到登录页重新认证
      window.location.href = '/admin/#/login'
    },
    onError: (err) => {
      setError(err instanceof HttpError ? err.message : '修改失败')
    },
  })

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
    if (newPassword === currentPassword) {
      setError('新口令不能与当前口令相同')
      return
    }
    change.mutate()
  }

  return (
    <Panel title="账号安全" description="修改后所有登录会话将失效，需重新登录">
      <div className="space-y-3 max-w-sm">
        <label className="block text-sm">
          <span className="text-muted-foreground">当前口令</span>
          <Input
            type="password"
            className="mt-1"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </label>
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
          variant="primary"
          disabled={change.isPending || !currentPassword || !newPassword || !confirmPassword}
          onClick={submit}
        >
          <KeyRound size={14} className="mr-1.5" />
          {change.isPending ? '修改中…' : '修改口令'}
        </Button>
      </div>
    </Panel>
  )
}
