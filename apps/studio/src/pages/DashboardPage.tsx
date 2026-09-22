import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Home,
  PenLine,
  FileText,
  MessageSquare,
  Edit3,
  MessageCircle,
  File,
  Copy,
  XCircle,
  CheckCircle,
  RotateCw,
} from 'lucide-react'
import { api } from '../api/endpoints'
import { PageHeader } from '../components/ui/PageHeader'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { PageSticky } from '../components/layout/PageSticky'
import { toast } from '../lib/toast'
import { LoadingState } from '../components/ui/LoadingState'
import { EmptyState } from '../components/ui/EmptyState'

export function DashboardPage() {
  const overview = useQuery({
    queryKey: ['overview'],
    queryFn: () => api.overview(),
  })
  const mirror = useQuery({
    queryKey: ['mirror'],
    queryFn: () => api.mirror.status(),
  })

  return (
    <div>
      <PageSticky>
      <PageHeader
        icon={<Home size={20} />}
        title="概览"
        description="内容状态与镜像队列"
        actions={
          <Link to="/posts/new">
            <Button variant="primary" icon={<PenLine size={14} />}>
              写文章
            </Button>
          </Link>
        }
      />
      </PageSticky>

      {/* Stats Grid */}
      {overview.data ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard
            label="已发布文章"
            value={overview.data.posts.posts}
            icon={<FileText size={16} />}
          />
          <StatCard
            label="草稿"
            value={overview.data.posts.drafts}
            icon={<Edit3 size={16} />}
          />
          <StatCard
            label="待审评论"
            value={overview.data.comments.pending}
            icon={<MessageSquare size={16} />}
            tone="warning"
          />
          <StatCard
            label="已发布说说"
            value={overview.data.moments.published}
            icon={<MessageCircle size={16} />}
          />
          <StatCard
            label="独立页面"
            value={overview.data.posts.pages}
            icon={<File size={16} />}
          />
          <StatCard
            label="镜像待处理"
            value={overview.data.mirror.pending}
            icon={<Copy size={16} />}
            tone="warning"
          />
          <StatCard
            label="镜像失败"
            value={overview.data.mirror.failed}
            icon={<XCircle size={16} />}
            tone="error"
          />
          <StatCard
            label="评论已通过"
            value={overview.data.comments.approved}
            icon={<CheckCircle size={16} />}
          />
        </div>
      ) : (
        <Card padding="md" className="mb-6">
          <LoadingState rows={2} />
        </Card>
      )}

      {/* Panels: Mirror Queue + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Mirror Queue */}
        <Card padding="none">
          <div className="panel-header">
            <div className="min-w-0">
              <h2 className="text-sm font-medium text-foreground">镜像队列</h2>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                D1 → Git 单向导出
              </p>
            </div>
            <Button
              size="sm"
              icon={<RotateCw size={13} />}
              onClick={() => {
                api.mirror
                  .retry()
                  .then(() => {
                    toast('已提交重试')
                    void mirror.refetch()
                    void overview.refetch()
                  })
                  .catch(() => {
                    toast('重试提交失败，请稍后再试', 'error')
                  })
              }}
            >
              重试失败任务
            </Button>
          </div>
          <div className="p-4">
            {mirror.data ? (
              <div className="space-y-4">
                {/* Summary row */}
                <div className="flex flex-wrap items-center gap-5 text-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground text-xs">待处理</span>
                    <span className="font-medium tabular-nums">
                      {mirror.data.summary.pending}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground text-xs">处理中</span>
                    <span className="font-medium tabular-nums">
                      {mirror.data.summary.processing}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground text-xs">已完成</span>
                    <span className="font-medium tabular-nums">
                      {mirror.data.summary.done}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground text-xs">失败</span>
                    <span
                      className="font-medium tabular-nums"
                      style={{ color: 'var(--state-error)' }}
                    >
                      {mirror.data.summary.failed}
                    </span>
                  </div>
                </div>

                {/* Recent tasks */}
                {mirror.data.recent.length ? (
                  <div className="space-y-1">
                    {mirror.data.recent.slice(0, 6).map((item) => {
                      const status = String(item.status)
                      const tone =
                        status === 'done'
                          ? 'success'
                          : status === 'failed'
                            ? 'error'
                            : status === 'processing'
                              ? 'info'
                              : 'warning'
                      return (
                        <div
                          key={String(item.id)}
                          className="text-xs flex items-center gap-2 py-1.5 px-2 -mx-2 rounded-sm row-hover"
                        >
                          <Badge tone={tone}>{status}</Badge>
                          <span className="text-muted-foreground">
                            {String(item.entity_type)} · {String(item.entity_id)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <EmptyState title="暂无镜像任务" description="内容同步后会在此显示" />
                )}
              </div>
            ) : (
              <LoadingState rows={3} />
            )}
          </div>
        </Card>

        {/* Recent Activity */}
        <Card padding="none">
          <div className="panel-header">
            <div className="min-w-0">
              <h2 className="text-sm font-medium text-foreground">最近动态</h2>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                镜像任务动态
              </p>
            </div>
            <Link to="/posts" className="text-xs text-muted-foreground hover:text-foreground">
              查看全部
            </Link>
          </div>
          <div className="p-4">
            {mirror.data && mirror.data.recent.length ? (
              <div className="divide-y divide-border-subtle">
                {mirror.data.recent.slice(0, 5).map((item) => {
                  const status = String(item.status)
                  const tone =
                    status === 'done'
                      ? 'success'
                      : status === 'failed'
                        ? 'error'
                        : status === 'processing'
                          ? 'info'
                          : 'warning'
                  const statusLabel =
                    status === 'done'
                      ? '已完成'
                      : status === 'failed'
                        ? '失败'
                        : status === 'processing'
                          ? '处理中'
                          : '待处理'
                  return (
                    <div
                      key={String(item.id)}
                      className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                    >
                      <Badge tone={tone}>{statusLabel}</Badge>
                      <span className="text-sm text-foreground flex-1 truncate">
                        {String(item.entity_type)} #{String(item.entity_id)}
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <EmptyState title="暂无动态" description="镜像任务执行后会在此显示" />
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}

interface StatCardProps {
  label: string
  value: number
  icon: React.ReactNode
  tone?: 'default' | 'warning' | 'error' | 'success'
}

function StatCard({ label, value, icon, tone = 'default' }: StatCardProps) {
  const valueColor =
    tone === 'warning'
      ? { color: 'var(--state-warning)' }
      : tone === 'error'
        ? { color: 'var(--state-error)' }
        : tone === 'success'
          ? { color: 'var(--state-success)' }
          : undefined

  return (
    <Card padding="md">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div
            className="text-2xl font-medium tabular-nums mt-1"
            style={valueColor}
          >
            {value}
          </div>
        </div>
        <div className="text-muted-foreground">{icon}</div>
      </div>
    </Card>
  )
}
