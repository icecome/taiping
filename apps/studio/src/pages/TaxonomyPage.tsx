import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Tags, Plus, Pencil, Trash2, Search } from 'lucide-react'
import { api } from '../api/endpoints'
import { PageHeader } from '../components/ui/PageHeader'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { EmptyState } from '../components/ui/EmptyState'
import { LoadingState } from '../components/ui/LoadingState'
import { confirmDialog } from '../components/ui/ConfirmDialog'
import { ErrorState } from '../components/ui/ErrorState'
import { Drawer } from '../components/ui/Drawer'
import { toast } from '../lib/toast'
import type { Term } from '@taiping/content-model/term'
import { PageSticky } from '../components/layout/PageSticky'

type TermType = 'category' | 'tag'

export function TaxonomyPage() {
  const queryClient = useQueryClient()
  const [type, setType] = useState<TermType>('category')
  const [searchName, setSearchName] = useState('')
  const [newName, setNewName] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedTerm, setSelectedTerm] = useState<Term | null>(null)
  const [editName, setEditName] = useState('')
  const [editSlug, setEditSlug] = useState('')

  const terms = useQuery({
    queryKey: ['terms', type],
    queryFn: () => api.terms.list(type),
  })

  const filteredTerms = useMemo(() => {
    if (!terms.data) return []
    if (!searchName.trim()) return terms.data
    const keyword = searchName.toLowerCase()
    return terms.data.filter(
      (t) => t.name.toLowerCase().includes(keyword) || t.slug.toLowerCase().includes(keyword),
    )
  }, [terms.data, searchName])

  const create = useMutation({
    mutationFn: () => api.terms.create({ type, name: newName.trim() }),
    onSuccess: () => {
      setNewName('')
      queryClient.invalidateQueries({ queryKey: ['terms'] })
      toast('已添加')
    },
    onError: () => toast('添加失败', 'error'),
  })

  const update = useMutation({
    mutationFn: (input: { id: string; name: string; slug: string }) =>
      api.terms.update(input.id, { name: input.name, slug: input.slug }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['terms'] })
      setDrawerOpen(false)
      setSelectedTerm(null)
      toast('已保存')
    },
    onError: () => toast('保存失败', 'error'),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.terms.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['terms'] })
      if (selectedTerm?.id) {
        setSelectedTerm(null)
        setDrawerOpen(false)
      }
      toast('已删除')
    },
    onError: () => toast('删除失败', 'error'),
  })

  const handleTypeChange = (value: TermType) => {
    setType(value)
    setSelectedTerm(null)
    setDrawerOpen(false)
  }

  const handleOpenEdit = (term: Term) => {
    setSelectedTerm(term)
    setEditName(term.name)
    setEditSlug(term.slug)
    setDrawerOpen(true)
  }

  const closeDrawer = () => {
    setDrawerOpen(false)
    setSelectedTerm(null)
  }

  const handleAdd = () => {
    if (!newName.trim() || create.isPending) return
    create.mutate()
  }

  const handleDelete = async (term: Term) => {
    const ok = await confirmDialog({
      title: `删除「${term.name}」？`,
      description: '删除后引用该分类的内容可能需要重新归类。',
      confirmLabel: '删除',
      danger: true,
    })
    if (ok) remove.mutate(term.id)
  }

  const slugValid = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(editSlug.trim())
  const canSave = Boolean(editName.trim()) && slugValid && !update.isPending

  const handleSaveEdit = () => {
    if (!selectedTerm || !canSave) return
    update.mutate({
      id: selectedTerm.id,
      name: editName.trim(),
      slug: editSlug.trim(),
    })
  }

  return (
    <div>
      <PageSticky>
        <PageHeader
          icon={<Tags size={20} />}
          title="分类与标签"
          description="管理文章分类与标签"
        />

        <div className="card p-4 mb-0 rounded-b-none border-b-border-subtle">
          <div className="taxonomy-filter-bar">
            <Select
              value={type}
              onChange={(e) => handleTypeChange(e.target.value as TermType)}
              className="admin-filter-select"
              aria-label="类型"
            >
              <option value="category">分类</option>
              <option value="tag">标签</option>
            </Select>
            <div className="relative admin-filter-input">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
              <Input
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
                placeholder="搜索名称..."
                className="pl-8"
                aria-label="搜索名称"
              />
            </div>
            <div className="admin-filter-btn">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={type === 'category' ? '新分类名称' : '新标签名称'}
                aria-label={type === 'category' ? '新分类名称' : '新标签名称'}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAdd()
                }}
              />
              <Button
                variant="primary"
                icon={<Plus size={14} />}
                onClick={handleAdd}
                disabled={create.isPending || !newName.trim()}
                className="shrink-0"
              >
                添加
              </Button>
            </div>
          </div>
        </div>
      </PageSticky>

      {/* 单栏列表：禁止 overflow 作为 sticky 祖先 */}
      <div className="card rounded-t-none">
        <div className="border-b border-border px-4 py-3 flex items-center justify-between admin-sticky-block">
          <span className="text-sm font-medium text-foreground">
            {type === 'category' ? '分类列表' : '标签列表'}
          </span>
          <span className="text-xs text-muted-foreground">
            共 {filteredTerms.length} 项
          </span>
        </div>

        {terms.isLoading ? (
          <LoadingState rows={4} />
        ) : terms.isError ? (
          <ErrorState onRetry={() => void terms.refetch()} />
        ) : !filteredTerms.length ? (
          <EmptyState
            title="暂无条目"
            description={searchName ? '没有匹配的结果' : '在上方添加分类或标签'}
          />
        ) : (
          <ul>
            {filteredTerms.map((term) => (
              <li
                key={term.id}
                role="button"
                tabIndex={0}
                className="row-hover px-4 py-3 flex items-center gap-3 text-sm cursor-pointer focus-visible:bg-secondary focus-visible:outline-none"
                onClick={() => handleOpenEdit(term)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleOpenEdit(term)
                  }
                }}
              >
                <div className="min-w-0 flex-1">
                  <span className="text-foreground font-medium">{term.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">/{term.slug}</span>
                </div>
                <Badge tone="muted">0 篇</Badge>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    iconOnly
                    icon={<Pencil size={14} />}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleOpenEdit(term)
                    }}
                    aria-label="编辑"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    iconOnly
                    icon={<Trash2 size={14} />}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(term)
                    }}
                    aria-label="删除"
                    className="text-[var(--state-error)]"
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Drawer
        open={drawerOpen}
        title={selectedTerm ? `编辑${type === 'category' ? '分类' : '标签'}` : ''}
        subtitle={selectedTerm ? `/${selectedTerm.slug}` : undefined}
        onClose={closeDrawer}
        footer={
          <>
            <Button
              variant="primary"
              onClick={handleSaveEdit}
              disabled={!canSave}
              className="shrink-0"
            >
              保存修改
            </Button>
            <Button variant="ghost" onClick={closeDrawer} className="shrink-0">
              取消
            </Button>
            {selectedTerm ? (
              <Button
                variant="ghost"
                className="ml-auto text-[var(--state-error)] shrink-0"
                onClick={() => handleDelete(selectedTerm)}
                disabled={remove.isPending}
              >
                删除
              </Button>
            ) : null}
          </>
        }
      >
        {selectedTerm ? (
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5" htmlFor="term-edit-name">
                名称
              </label>
              <Input
                id="term-edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5" htmlFor="term-edit-slug">
                Slug
              </label>
              <Input
                id="term-edit-slug"
                value={editSlug}
                onChange={(e) => setEditSlug(e.target.value)}
              />
              {!slugValid && editSlug.trim() ? (
                <p className="text-xs text-[var(--state-error)] mt-1">
                  仅允许小写字母、数字与连字符
                </p>
              ) : null}
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1.5">类型</div>
              <div className="text-sm text-foreground">
                {type === 'category' ? '分类' : '标签'}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1.5">ID</div>
              <div className="text-xs text-muted-foreground font-mono break-all">
                {selectedTerm.id}
              </div>
            </div>
          </div>
        ) : null}
      </Drawer>
    </div>
  )
}
