import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageSquare, RotateCw, X, Send, Check, Star, Trash2, Search } from 'lucide-react'
import { api } from '../api/endpoints'
import { PageHeader } from '../components/ui/PageHeader'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Tabs } from '../components/ui/Tabs'
import { EmptyState } from '../components/ui/EmptyState'
import { LoadingState } from '../components/ui/LoadingState'
import { confirmDialog } from '../components/ui/ConfirmDialog'
import { ErrorState } from '../components/ui/ErrorState'
import { Pagination } from '../components/ui/Pagination'
import { toast } from '../lib/toast'
import { formatDateTime } from '@taiping/shared-utils/date'
import { PageSticky } from '../components/layout/PageSticky'
import type { Comment, CommentStatus, CommentTargetType } from '@taiping/content-model/comment'

type TabKey = 'all' | 'pending' | 'approved' | 'spam' | 'trash'

const TAB_ITEMS: Array<{ key: TabKey; label: string; tone: 'default' | 'success' | 'warning' | 'error' | 'info' | 'muted' }> = [
  { key: 'all', label: '全部', tone: 'muted' },
  { key: 'pending', label: '待审', tone: 'warning' },
  { key: 'approved', label: '已通过', tone: 'success' },
  { key: 'spam', label: '垃圾', tone: 'error' },
  { key: 'trash', label: '已删除', tone: 'muted' },
]

function getStatusBadgeTone(status: CommentStatus): 'success' | 'warning' | 'error' | 'muted' {
  if (status === 'approved') return 'success'
  if (status === 'spam') return 'error'
  if (status === 'pending') return 'warning'
  return 'muted'
}

function getStatusLabel(status: CommentStatus): string {
  if (status === 'approved') return '已通过'
  if (status === 'spam') return '垃圾'
  if (status === 'pending') return '待审'
  return status
}

function getTargetTypeLabel(type: CommentTargetType): string {
  if (type === 'guestbook') return '留言板'
  if (type === 'post') return '文章'
  if (type === 'moment') return '说说'
  return type
}

function getInitial(name: string): string {
  return name.charAt(0).toUpperCase()
}

export function CommentAuditPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [tabKey, setTabKey] = useState<TabKey>('pending')
  const [keyword, setKeyword] = useState('')
  const [targetType, setTargetType] = useState<string>('')
  const [selectedComment, setSelectedComment] = useState<Comment | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [replyText, setReplyText] = useState('')

  const statusParam = useMemo(() => {
    if (tabKey === 'all' || tabKey === 'trash') return undefined
    return tabKey as CommentStatus
  }, [tabKey])

  const comments = useQuery({
    queryKey: ['comments', { page, pageSize, status: statusParam, targetType, keyword }],
    queryFn: () =>
      api.comments.list({
        page,
        pageSize,
        status: statusParam,
        targetType: targetType || undefined,
        keyword: keyword || undefined,
      }),
  })

  const moderate = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      api.comments.moderate(id, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments'] })
      toast('已更新')
    },
    onError: () => toast('操作失败', 'error'),
  })

  const handleTabChange = (key: string) => {
    setTabKey(key as TabKey)
    setPage(1)
  }

  const openDrawer = (comment: Comment) => {
    setSelectedComment(comment)
    setDrawerOpen(true)
    setReplyText('')
  }

  const closeDrawer = () => {
    setDrawerOpen(false)
  }

  // Lock body scroll on mobile when drawer is open
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [drawerOpen])

  const handleReply = () => {
    if (!replyText.trim() || !selectedComment) return
    // Reply feature uses moderate pattern; pending dedicated reply API
    toast('回复功能待接入')
    setReplyText('')
  }

  const handleModerate = async (id: string, action: string, confirmMsg?: string) => {
    if (confirmMsg) {
      const ok = await confirmDialog({
        title: confirmMsg,
        confirmLabel: '确定',
        danger: true,
      })
      if (!ok) return
    }
    moderate.mutate({ id, action })
  }

  // Tab counts - derived from total when available, shown on active tab
  const totalCount = comments.data?.total ?? 0

  const showEmpty = tabKey === 'trash'

  return (
    <div className="relative">
      <PageSticky>
        <PageHeader
          icon={<MessageSquare size={20} />}
          title="评论管理"
          description="留言板 / 文章 / 说说审核"
          actions={
            <Button variant="ghost" size="sm" onClick={() => void comments.refetch()}>
              <RotateCw size={14} />
              刷新
            </Button>
          }
        />

        <div className="card rounded-b-none border-b-border-subtle">
          <div className="border-b border-border px-4">
            <Tabs
              items={TAB_ITEMS.map((t) => ({
                key: t.key,
                label: (
                  <span className="flex items-center gap-1.5">
                    {t.label}
                    {t.key === tabKey && totalCount > 0 ? (
                      <Badge tone={t.tone}>{totalCount}</Badge>
                    ) : null}
                  </span>
                ),
              }))}
              activeKey={tabKey}
              onChange={handleTabChange}
              className="admin-tabs-row"
            />
          </div>

          <div className="flex items-center gap-2 px-4 py-3 border-b border-border-subtle admin-filter-row">
            <div className="relative admin-filter-input">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={keyword}
                onChange={(e) => {
                  setKeyword(e.target.value)
                  setPage(1)
                }}
                placeholder="搜索评论内容..."
                className="pl-8"
              />
            </div>
            <Select
              value={targetType}
              onChange={(e) => {
                setTargetType(e.target.value)
                setPage(1)
              }}
              className="admin-filter-select !w-auto"
            >
              <option value="">全部来源</option>
              <option value="guestbook">留言板</option>
              <option value="post">文章</option>
              <option value="moment">说说</option>
            </Select>
          </div>
        </div>
      </PageSticky>

      <div className="card rounded-t-none">
        {/* Comment List */}
        {comments.isLoading ? (
          <LoadingState rows={4} />
        ) : comments.isError ? (
          <ErrorState onRetry={() => void comments.refetch()} />
        ) : showEmpty || !comments.data?.items.length ? (
          <EmptyState
            title="当前没有评论"
            description={showEmpty ? '回收站暂无内容' : '你可以尝试刷新或者修改筛选条件'}
            actionLabel="刷新"
            onAction={() => void comments.refetch()}
          />
        ) : (
          <div>
            <ul className="divide-y divide-border-subtle">
              {comments.data.items.map((comment) => (
                <li
                  key={comment.id}
                  role="button"
                  tabIndex={0}
                  className="px-4 py-3.5 cursor-pointer row-hover focus-visible:bg-secondary focus-visible:outline-none"
                  onClick={() => openDrawer(comment)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      openDrawer(comment)
                    }
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-secondary border border-border flex items-center justify-center text-xs text-muted-foreground shrink-0">
                      {getInitial(comment.nickname)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="text-sm font-medium text-foreground">
                          {comment.nickname}
                        </span>
                        <Badge tone="muted">{getTargetTypeLabel(comment.targetType)}</Badge>
                        <Badge tone={getStatusBadgeTone(comment.status)}>
                          {getStatusLabel(comment.status)}
                        </Badge>
                        {comment.isFeatured ? (
                          <Badge tone="info">精选</Badge>
                        ) : null}
                        <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">
                          {formatDateTime(comment.createdAt)}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mb-1">
                        {comment.targetId}
                      </div>
                      <p className="text-sm text-foreground line-clamp-2">
                        {comment.contentMd}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="px-4 pb-3">
              <Pagination
                page={comments.data.page}
                pageSize={comments.data.pageSize}
                total={comments.data.total}
                onChange={setPage}
                onPageSizeChange={(n) => {
                  setPage(1)
                  setPageSize(n)
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Drawer Backdrop */}
      {drawerOpen ? (
        <div
          className="fixed inset-0 bg-black/20 z-40 md:hidden"
          onClick={closeDrawer}
        />
      ) : null}

      {/* Drawer Panel */}
      {drawerOpen && selectedComment ? (
        <div
          className="fixed top-0 right-0 bottom-0 w-full md:w-[480px] bg-card border-l border-border z-50 md:z-40 flex flex-col md:shadow-floating md:rounded-l-[4px]"
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: '100%',
            maxWidth: '480px',
          }}
        >
          {/* Drawer Header */}
          <div className="shrink-0 border-b border-border px-5 py-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-secondary border border-border flex items-center justify-center text-xs text-muted-foreground">
                  {getInitial(selectedComment.nickname)}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">
                    {selectedComment.nickname}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {selectedComment.email || '无邮箱'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge tone={getStatusBadgeTone(selectedComment.status)}>
                  {getStatusLabel(selectedComment.status)}
                </Badge>
                <button
                  type="button"
                  className="w-9 h-9 inline-flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground hover:bg-secondary"
                  onClick={closeDrawer}
                  aria-label="关闭"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            {/* Meta info */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              <span>来源: {getTargetTypeLabel(selectedComment.targetType)}</span>
              <span>ID: {selectedComment.id.slice(0, 8)}</span>
            </div>
            {/* Quick actions */}
            <div className="flex items-center gap-1.5 mt-3 flex-wrap">
              <Button
                size="sm"
                variant="ghost"
                icon={<Check size={14} />}
                onClick={(e) => {
                  e.stopPropagation()
                  handleModerate(selectedComment.id, 'approve')
                }}
                disabled={moderate.isPending}
              >
                通过
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<Star size={14} />}
                onClick={(e) => {
                  e.stopPropagation()
                  handleModerate(
                    selectedComment.id,
                    selectedComment.isFeatured ? 'unfeature' : 'feature',
                  )
                }}
                disabled={moderate.isPending}
              >
                {selectedComment.isFeatured ? '取消精选' : '精选'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation()
                  handleModerate(selectedComment.id, 'spam')
                }}
                disabled={moderate.isPending}
              >
                标垃圾
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<Trash2 size={14} />}
                onClick={(e) => {
                  e.stopPropagation()
                  handleModerate(selectedComment.id, 'delete', '确认删除该评论？')
                }}
                disabled={moderate.isPending}
                className="text-[var(--state-error)]"
              >
                删除
              </Button>
            </div>
          </div>

          {/* Conversation Timeline */}
          <div className="flex-1 min-h-0 overflow-y-auto studio-scroll px-5 py-4 space-y-4">
            {/* Visitor message */}
            <div className="flex gap-2.5">
              <div className="w-7 h-7 rounded-full bg-secondary border border-border flex items-center justify-center text-xs text-muted-foreground shrink-0 mt-0.5">
                {getInitial(selectedComment.nickname)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-foreground">
                    {selectedComment.nickname}
                  </span>
                  <Badge tone="info">留言</Badge>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {formatDateTime(selectedComment.createdAt)}
                  </span>
                </div>
                <div className="bg-secondary border border-border rounded-sm rounded-tl-none px-3 py-2 text-sm text-foreground whitespace-pre-wrap">
                  {selectedComment.contentMd}
                </div>
              </div>
            </div>
          </div>

          {/* Reply input area */}
          <div className="shrink-0 border-t border-border p-4">
            <textarea
              className="input-base resize-none w-full"
              rows={3}
              placeholder="输入回复内容，支持 Markdown..."
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-muted-foreground">支持 Markdown 格式</span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => setReplyText('')}>
                  取消
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  icon={<Send size={14} />}
                  onClick={handleReply}
                  disabled={!replyText.trim()}
                >
                  发送回复
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
