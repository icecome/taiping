import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Plus, RotateCw, Pencil, Trash2, EyeOff, Eye } from 'lucide-react'
import { api } from '../api/endpoints'
import { PageHeader } from '../components/ui/PageHeader'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Tabs } from '../components/ui/Tabs'
import { EmptyState } from '../components/ui/EmptyState'
import { LoadingState } from '../components/ui/LoadingState'
import { ErrorState } from '../components/ui/ErrorState'
import { confirmDialog } from '../components/ui/ConfirmDialog'
import { Pagination } from '../components/ui/Pagination'
import { RowMenu } from '../components/ui/RowMenu'
import { toast } from '../lib/toast'
import { formatDate } from '@taiping/shared-utils/date'
import { PageSticky } from '../components/layout/PageSticky'

interface Props {
  contentType: 'post' | 'page'
}

export function PostListPage({ contentType }: Props) {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')

  const isPage = contentType === 'page'
  const base = isPage ? '/pages' : '/posts'
  const listKey = isPage ? 'pages' : 'posts'

  const posts = useQuery({
    queryKey: [listKey, { page, pageSize, status, q, type: contentType, category }],
    queryFn: () =>
      api.posts.list({
        page,
        pageSize,
        type: contentType,
        status: status || undefined,
        q: q || undefined,
        category: category || undefined,
      }),
  })

  const categories = useQuery({
    queryKey: ['terms', 'category'],
    queryFn: () => api.terms.list('category'),
    enabled: !isPage,
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.posts.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [listKey] })
      toast('已删除')
    },
    onError: () => toast('删除失败', 'error'),
  })
  const toggle = useMutation({
    mutationFn: ({ id, next }: { id: string; next: 'publish' | 'unpublish' }) =>
      next === 'publish' ? api.posts.publish(id) : api.posts.unpublish(id),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: [listKey] })
      toast(vars.next === 'publish' ? '已发布' : '已撤下')
    },
    onError: () => toast('操作失败', 'error'),
  })

  const tabItems = [
    { key: '', label: '全部' },
    { key: 'published', label: '已发布' },
    { key: 'draft', label: '草稿' },
  ]

  const handleStatusChange = (key: string) => {
    setPage(1)
    setStatus(key)
  }

  const handleSearchChange = (value: string) => {
    setPage(1)
    setQ(value)
  }

  const handleCategoryChange = (value: string) => {
    setPage(1)
    setCategory(value)
  }

  return (
    <div>
      <PageSticky>
        <PageHeader
          icon={<FileText size={20} />}
          title="文章管理"
          description="全部文章 / 页面"
          actions={
            <>
              <Button
                size="sm"
                icon={<RotateCw size={13} />}
                onClick={() => void posts.refetch()}
                aria-label="刷新"
              >
                刷新
              </Button>
              <Link to={`${base}/new`}>
                <Button variant="primary" size="sm" icon={<Plus size={13} />}>
                  新建文章
                </Button>
              </Link>
            </>
          }
        />

        <div className="card rounded-b-none border-b-border-subtle">
          <div className="list-filter-bar admin-filter-row">
            <Tabs
              items={tabItems}
              activeKey={status}
              onChange={handleStatusChange}
              className="admin-tabs-row tabs-borderless"
            />
            <div className="list-filter-controls">
              <Input
                placeholder="输入关键词搜索"
                value={q}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="admin-filter-input list-filter-search"
              />
              {!isPage ? (
                <Select
                  value={category}
                  onChange={(e) => handleCategoryChange(e.target.value)}
                  className="admin-filter-select list-filter-select"
                >
                  <option value="">全部分类</option>
                  {categories.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              ) : null}
            </div>
          </div>
        </div>
      </PageSticky>

      {/* 表格卡片：禁止 overflow 作为 sticky 祖先，表头才能钉在文档层正确位置 */}
      <div className="card rounded-t-none">
        {posts.isLoading ? (
          <LoadingState rows={4} />
        ) : posts.isError ? (
          <ErrorState onRetry={() => void posts.refetch()} />
        ) : !posts.data?.items.length ? (
          <EmptyState
            title={isPage ? '当前没有页面' : '当前没有文章'}
            description="你可以尝试刷新或者修改筛选条件"
            actionLabel="刷新"
            onAction={() => void posts.refetch()}
          />
        ) : (
          <div>
            <div className="hidden md:block">
              <table className="admin-data-table">
                <thead>
                  <tr>
                    <th>标题</th>
                    {!isPage ? <th>分类</th> : null}
                    <th>状态</th>
                    <th>日期</th>
                    <th className="col-actions" aria-label="操作" />
                  </tr>
                </thead>
                <tbody>
                  {posts.data.items.map((post) => (
                    <tr key={post.id} className="row-hover">
                      <td>
                        <Link
                          className="text-foreground hover:underline"
                          to={`${base}/${post.id}`}
                        >
                          {post.title}
                        </Link>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          /{post.slug}
                        </div>
                      </td>
                      {!isPage ? (
                        <td className="text-xs text-muted-foreground">
                          {post.categories.length
                            ? post.categories.map((c) => c.name).join(' / ')
                            : '—'}
                        </td>
                      ) : null}
                      <td>
                        <Badge tone={post.status === 'published' ? 'success' : 'muted'}>
                          {post.status === 'published' ? '已发布' : '草稿'}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap text-muted-foreground">
                        {formatDate(post.publishedAt || post.createdAt)}
                      </td>
                      <td className="col-actions">
                        <RowMenu
                          items={[
                            {
                              key: 'edit',
                              label: '编辑',
                              onClick: () => {
                                window.location.hash = `#${base}/${post.id}`
                              },
                            },
                            {
                              key: 'toggle',
                              label: post.status === 'published' ? '撤下' : '发布',
                              onClick: () =>
                                toggle.mutate({
                                  id: post.id,
                                  next: post.status === 'published' ? 'unpublish' : 'publish',
                                }),
                            },
                            {
                              key: 'delete',
                              label: '删除',
                              danger: true,
                              onClick: async () => {
                                const ok = await confirmDialog({
                                  title: `删除「${post.title}」？`,
                                  description: '删除后无法恢复。',
                                  confirmLabel: '删除',
                                  danger: true,
                                })
                                if (ok) remove.mutate(post.id)
                              },
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List */}
            <div className="md:hidden p-3 space-y-2">
              {posts.data.items.map((post) => (
                <Card key={post.id} padding="sm" className="row-hover">
                  <div className="flex items-center justify-between mb-2">
                    <Badge tone={post.status === 'published' ? 'success' : 'muted'}>
                      {post.status === 'published' ? '已发布' : '草稿'}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(post.publishedAt || post.createdAt)}
                    </span>
                  </div>
                  <Link
                    className="text-sm font-medium text-foreground block truncate mb-1"
                    to={`${base}/${post.id}`}
                  >
                    {post.title}
                  </Link>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                    <span className="truncate">/{post.slug}</span>
                    {!isPage && post.categories.length ? (
                      <>
                        <span>·</span>
                        <span className="truncate">
                          {post.categories.map((c) => c.name).join(' / ')}
                        </span>
                      </>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Pencil size={12} />}
                      onClick={() => {
                        window.location.hash = `#${base}/${post.id}`
                      }}
                    >
                      编辑
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={post.status === 'published' ? <EyeOff size={12} /> : <Eye size={12} />}
                      onClick={() =>
                        toggle.mutate({
                          id: post.id,
                          next: post.status === 'published' ? 'unpublish' : 'publish',
                        })
                      }
                    >
                      {post.status === 'published' ? '撤下' : '发布'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Trash2 size={12} />}
                      onClick={async () => {
                        const ok = await confirmDialog({
                          title: `删除「${post.title}」？`,
                          description: '删除后无法恢复。',
                          confirmLabel: '删除',
                          danger: true,
                        })
                        if (ok) remove.mutate(post.id)
                      }}
                      className="text-destructive"
                    >
                      删除
                    </Button>
                  </div>
                </Card>
              ))}
            </div>

            {/* Pagination */}
            <div className="px-4 pb-4 pt-2">
              <Pagination
                page={posts.data.page}
                pageSize={posts.data.pageSize}
                total={posts.data.total}
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
    </div>
  )
}
