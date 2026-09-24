import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Mail } from 'lucide-react'
import { api } from '../../api/endpoints'
import { HttpError, goToLogin } from '../../api/client'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Panel } from '../ui/Panel'
import { toast } from '../../lib/toast'

const MIN_LENGTH = 8

/** 恢复邮箱：忘记口令时接收重置链接 */
function RecoveryEmailPanel() {
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)

  const current = useQuery({
    queryKey: ['admin-email'],
    queryFn: () => api.auth.getEmail(),
  })

  useEffect(() => {
    if (current.data) setEmail(current.data.email)
  }, [current.data])

  const save = useMutation({
    mutationFn: () => api.auth.setEmail(email.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-email'] })
      setError(null)
      toast('恢复邮箱已保存')
    },
    onError: (err) => {
      setError(err instanceof HttpError ? err.message : '保存失败')
    },
  })

  return (
    <Panel title="恢复邮箱" description="忘记口令时，重置链接将发送至该邮箱">
      <div className="space-y-3 max-w-sm">
        <label className="block text-sm">
          <span className="text-muted-foreground">邮箱地址</span>
          <Input
            type="email"
            className="mt-1"
            placeholder="you@example.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>
          <Mail size={14} className="mr-1.5" />
          {save.isPending ? '保存中…' : '保存邮箱'}
        </Button>
        <p className="text-xs text-muted-foreground">
          未配置邮箱时，忘记口令只能通过数据库手动重置。
        </p>
      </div>
    </Panel>
  )
}

function ChangePasswordPanel() {
  const [currentPassword, setCurrent] = useState('')
  const [newPassword, setNew] = useState('')
  const [confirmPassword, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)

  const change = useMutation({
    mutationFn: () => api.auth.changePassword({ currentPassword, newPassword, confirmPassword }),
    onSuccess: () => {
      // 服务端已清空全部会话，回到登录页重新认证
      goToLogin()
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

function SessionsPanel() {
  const queryClient = useQueryClient()
  const sessions = useQuery({
    queryKey: ['auth-sessions'],
    queryFn: () => api.auth.listSessions(),
  })
  const revokeOne = useMutation({
    mutationFn: (id: string) => api.auth.revokeSession(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth-sessions'] })
      toast('已吊销该会话')
    },
    onError: (err) => toast(err instanceof HttpError ? err.message : '吊销失败', 'error'),
  })
  const revokeOthers = useMutation({
    mutationFn: () => api.auth.revokeOtherSessions(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['auth-sessions'] })
      toast(`已退出其他 ${data.revoked} 个设备`)
    },
    onError: (err) => toast(err instanceof HttpError ? err.message : '操作失败', 'error'),
  })

  return (
    <Panel title="登录设备" description="吊销可疑会话；当前设备不可吊销自身">
      <div className="space-y-3 max-w-xl">
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={revokeOthers.isPending}
            onClick={() => revokeOthers.mutate()}
          >
            退出其他设备
          </Button>
        </div>
        <ul className="space-y-2 text-sm">
          {(sessions.data ?? []).map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center gap-2 border border-border-subtle rounded-sm px-3 py-2"
            >
              <span className="font-medium">{s.current ? '当前设备' : '其他设备'}</span>
              <span className="text-muted-foreground text-xs">
                {s.trusted ? '受信 ' : ''}
                {s.userAgent?.slice(0, 48) || '未知客户端'}
              </span>
              <span className="text-muted-foreground text-xs ml-auto">
                至 {new Date(s.expiresAt).toLocaleString('zh-CN')}
              </span>
              {!s.current && (
                <Button
                  size="sm"
                  variant="danger"
                  disabled={revokeOne.isPending}
                  onClick={() => revokeOne.mutate(s.id)}
                >
                  吊销
                </Button>
              )}
            </li>
          ))}
          {sessions.data && sessions.data.length === 0 && (
            <li className="text-muted-foreground">暂无有效会话</li>
          )}
        </ul>
      </div>
    </Panel>
  )
}

export function PasswordPanel() {
  return (
    <div className="space-y-4">
      <ChangePasswordPanel />
      <SessionsPanel />
      <RecoveryEmailPanel />
    </div>
  )
}
