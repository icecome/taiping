import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Save, SlidersHorizontal, Trash2 } from 'lucide-react'
import { postInputSchema, type PostInput } from '@taiping/content-model/post'
import { api } from '../api/endpoints'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import { TagSelector, type TagOption } from '../components/ui/TagSelector'
import { toast } from '../lib/toast'
import { HttpError } from '../api/client'
import { slugify } from '@taiping/shared-utils/slug'
import { toDatetimeLocal, toIso } from '../lib/datetime'
import { countWords } from '@taiping/shared-utils/reading-time'
import { MediaPicker } from '../components/media/MediaPicker'
import { confirmDialog } from '../components/ui/ConfirmDialog'

const OverTypeEditor = lazy(() => import('../components/editor/OverTypeEditor'))

const defaultValues = {
  type: 'post' as const,
  title: '',
  slug: '',
  contentMd: '',
  excerpt: '',
  cover: '',
  template: '',
  sortOrder: 0,
  encrypt: false,
  encryptHint: '',
  encryptTitle: '',
  encryptMessage: '',
  categoryIds: [] as string[],
  tagNames: [] as string[],
}

interface Props {
  contentType: 'post' | 'page'
}

export function PostEditPage({ contentType }: Props) {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isNew = !id || id === 'new'
  const isPage = contentType === 'page'
  const listBase = isPage ? '/pages' : '/posts'
  const listKey = isPage ? 'pages' : 'posts'
  const editorId = isPage ? `page-editor-${id ?? 'new'}` : `post-editor-${id ?? 'new'}`

  const [sideOpen, setSideOpen] = useState(true)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [mediaOpen, setMediaOpen] = useState(false)
  const [slugAuto, setSlugAuto] = useState(true)
  const [publishAtLocal, setPublishAtLocal] = useState('')
  const [mobileSideOpen, setMobileSideOpen] = useState(false)
  const editorHostRef = useRef<HTMLDivElement | null>(null)

  const detail = useQuery({
    queryKey: ['post', id, contentType],
    queryFn: () => api.posts.get(id as string),
    enabled: !isNew,
  })

  const categoriesQuery = useQuery({
    queryKey: ['terms', 'category'],
    queryFn: () => api.terms.list('category'),
    enabled: !isPage,
  })

  const tagsQuery = useQuery({
    queryKey: ['terms', 'tag'],
    queryFn: () => api.terms.list('tag'),
    enabled: !isPage,
  })

  const categoryOptions: TagOption[] = useMemo(
    () => (categoriesQuery.data ?? []).map((c) => ({ value: c.id, label: c.name })),
    [categoriesQuery.data],
  )

  const tagOptions: TagOption[] = useMemo(
    () => (tagsQuery.data ?? []).map((t) => ({ value: t.name, label: t.name })),
    [tagsQuery.data],
  )

  const form = useForm<PostInput>({
    resolver: zodResolver(postInputSchema),
    defaultValues: { ...defaultValues, type: contentType } as PostInput,
  })

  const status = detail.data?.status ?? 'draft'
  const inProgress = detail.data?.inProgress ?? false
  const title = form.watch('title') || ''
  const slug = form.watch('slug') || ''
  const contentMd = form.watch('contentMd') || ''
  const excerpt = form.watch('excerpt') || ''
  const cover = form.watch('cover') || ''
  const template = form.watch('template') || ''
  const publishedAt = detail.data?.publishedAt || ''
  const categoryIds = form.watch('categoryIds') || []
  const tagNames = form.watch('tagNames') || []
  const wordCount = useMemo(() => countWords(contentMd), [contentMd])

  // 初始化详情数据
  useEffect(() => {
    if (!detail.data) return
    form.reset({
      slug: detail.data.slug,
      type: detail.data.type,
      title: detail.data.title,
      contentMd: detail.data.contentMd,
      excerpt: detail.data.excerpt ?? '',
      cover: detail.data.cover ?? '',
      template: detail.data.template ?? '',
      sortOrder: detail.data.sortOrder,
      encrypt: detail.data.encrypt,
      encryptHint: detail.data.encryptHint ?? '',
      encryptTitle: detail.data.encryptTitle ?? '',
      encryptMessage: detail.data.encryptMessage ?? '',
      categoryIds: detail.data.categories.map((c) => c.id),
      tagNames: detail.data.tags.map((t) => t.name),
    })
    setDirty(false)
    setPublishAtLocal(toDatetimeLocal(detail.data.publishedAt))
    // 如果已有 slug 且和标题生成的不一致，关闭自动生成
    if (detail.data.slug && detail.data.title) {
      const autoSlug = slugify(detail.data.title)
      if (autoSlug !== detail.data.slug) {
        setSlugAuto(false)
      }
    }
  }, [detail.data, form])

  const markDirty = useCallback(() => setDirty(true), [])

  // 标题变更时自动生成 slug
  useEffect(() => {
    if (slugAuto && title && !isNew && detail.data?.slug) return
    if (slugAuto && title) {
      form.setValue('slug', slugify(title), { shouldDirty: true })
    }
  }, [title, slugAuto, form, isNew, detail.data?.slug])

  const insertMarkdown = useCallback((markdown: string) => {
    const host = editorHostRef.current
    if (host) {
      host.dispatchEvent(new CustomEvent('taiping-insert-media', { detail: { markdown } }))
    }
    setDirty(true)
  }, [])

  const buildPayload = (values: PostInput): PostInput => ({
    ...values,
    type: contentType,
  })

  const onInvalid = (errors: Record<string, { message?: string }>) => {
    const first = Object.values(errors)[0]
    toast(first?.message || '请检查表单必填项', 'error')
  }

  const save = useMutation({
    mutationFn: (input: PostInput) =>
      isNew ? api.posts.create(input) : api.posts.update(id as string, input),
    onSuccess: (post) => {
      queryClient.invalidateQueries({ queryKey: [listKey] })
      queryClient.invalidateQueries({ queryKey: ['post', post.id] })
      setSavedAt(new Date().toLocaleTimeString('zh-CN', { hour12: false }))
      setDirty(false)
      toast(isNew ? '已创建草稿' : '已保存')
      if (isNew) navigate(`${listBase}/${post.id}`, { replace: true })
    },
    onError: (err) => {
      toast(err instanceof HttpError ? err.message : '保存失败', 'error')
    },
  })

  const publish = useMutation({
    mutationFn: async (payload: { input: PostInput; publishedAt?: string }) => {
      const saved = isNew
        ? await api.posts.create(payload.input)
        : await api.posts.update(id as string, payload.input)
      return api.posts.publish(saved.id, payload.publishedAt)
    },
    onSuccess: (post) => {
      queryClient.invalidateQueries({ queryKey: [listKey] })
      queryClient.invalidateQueries({ queryKey: ['post', post.id] })
      setSavedAt(new Date().toLocaleTimeString('zh-CN', { hour12: false }))
      setDirty(false)
      toast('已发布')
      if (isNew) navigate(`${listBase}/${post.id}`, { replace: true })
    },
    onError: (err) => {
      toast(err instanceof HttpError ? err.message : '发布失败', 'error')
    },
  })

  const remove = useMutation({
    mutationFn: () => api.posts.recycle(id as string),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [listKey] })
      toast('已移入回收站')
      navigate(listBase)
    },
    onError: (err) => {
      toast(err instanceof HttpError ? err.message : '删除失败', 'error')
    },
  })

  const handleSave = () => {
    void form.handleSubmit((values) => save.mutate(buildPayload(values)), onInvalid)()
  }

  const handlePublish = () => {
    void form.handleSubmit(
      (values) =>
        publish.mutate({
          input: buildPayload(values),
          publishedAt: publishAtLocal ? toIso(publishAtLocal) : undefined,
        }),
      onInvalid,
    )()
  }

  const handleDelete = async () => {
    const ok = await confirmDialog({
      title: isPage ? '将页面移入回收站？' : '将文章移入回收站？',
      description: '可在列表「回收站」中恢复，或彻底删除。',
      confirmLabel: '移入回收站',
      danger: true,
    })
    if (ok) remove.mutate()
  }

  const statusTone = status === 'published' ? (inProgress ? 'warning' : 'success') : 'muted'
  const statusLabel =
    status === 'published' ? (inProgress ? '已发布·有未上线修改' : '已发布') : '草稿'

  // 侧栏内容（桌面端右侧 / 移动端底部面板共用）
  const sidebarContent = (
    <div className="flex-1 overflow-y-auto studio-scroll p-3 space-y-4 text-sm">
      {/* 发布状态 */}
      <section>
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">发布</h3>
        <div className="space-y-1.5 text-muted-foreground">
          <div>状态：{statusLabel}</div>
          <div className="text-xs leading-relaxed">
            「保存」只写入草稿修订，不会出现在前台。
            <br />
            「发布」把当前正文设为线上版本；已发布后再保存，前台仍是旧文，直到再次发布。
          </div>
        </div>
        <div className="mt-2">
          <label className="text-xs text-muted-foreground">发布时间</label>
          <Input
            type="datetime-local"
            className="mt-1"
            value={publishAtLocal || toDatetimeLocal(publishedAt)}
            onChange={(e) => {
              setPublishAtLocal(e.target.value)
              markDirty()
            }}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            留空则发布时用当前时间；可设为未来时间定时可见。
          </p>
        </div>
      </section>

      {/* 路径 */}
      <section>
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">路径</h3>
        <div className="flex items-center gap-2">
          <Input
            value={slug}
            placeholder="slug"
            onChange={(e) => {
              form.setValue('slug', e.target.value, { shouldDirty: true })
              setSlugAuto(false)
              markDirty()
            }}
          />
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <button
            type="button"
            className={`slug-toggle ${slugAuto ? 'on' : ''}`}
            onClick={() => setSlugAuto((v) => !v)}
            aria-label={slugAuto ? '关闭自动生成' : '开启自动生成'}
          />
          <span className="text-xs text-muted-foreground">自动生成</span>
        </div>
      </section>

      {/* 摘要 */}
      <section>
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">摘要</h3>
        <textarea
          className="input-base min-h-[72px] resize-none"
          placeholder="文章摘要..."
          value={excerpt}
          onChange={(e) => {
            form.setValue('excerpt', e.target.value, { shouldDirty: true })
            markDirty()
          }}
        />
      </section>

      {/* 封面 */}
      <section>
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">封面</h3>
        <Input
          placeholder="图片 URL 或从图床复制"
          value={cover}
          onChange={(e) => {
            form.setValue('cover', e.target.value, { shouldDirty: true })
            markDirty()
          }}
        />
      </section>

      {/* 分类 / 标签（仅文章） */}
      {!isPage ? (
        <>
          <section>
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">分类</h3>
            <TagSelector
              value={categoryIds}
              onChange={(vals) => {
                form.setValue('categoryIds', vals, { shouldDirty: true })
                markDirty()
              }}
              options={categoryOptions}
              placeholder="搜索分类..."
              allowCreate={false}
            />
          </section>
          <section>
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">标签</h3>
            <TagSelector
              value={tagNames}
              onChange={(vals) => {
                form.setValue('tagNames', vals, { shouldDirty: true })
                markDirty()
              }}
              options={tagOptions}
              placeholder="搜索或输入标签..."
              allowCreate={true}
            />
          </section>
        </>
      ) : (
        <section>
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">模板</h3>
          <Input
            placeholder="如 links / about"
            value={template}
            onChange={(e) => {
              form.setValue('template', e.target.value, { shouldDirty: true })
              markDirty()
            }}
          />
        </section>
      )}

      {/* 加密 */}
      <section>
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">加密</h3>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={form.watch('encrypt')}
            onChange={(e) => {
              form.setValue('encrypt', e.target.checked, { shouldDirty: true })
              markDirty()
            }}
          />
          <span>访问密码保护</span>
        </label>
        {form.watch('encrypt') ? (
          <div className="mt-2 space-y-2">
            <Input
              type="password"
              placeholder="访问密码（至少 4 位）"
              autoComplete="new-password"
              value={form.watch('encryptPassword') ?? ''}
              onChange={(e) => {
                form.setValue('encryptPassword', e.target.value, { shouldDirty: true })
                markDirty()
              }}
            />
            <Input
              placeholder="密码提示（可选）"
              value={form.watch('encryptHint') ?? ''}
              onChange={(e) => {
                form.setValue('encryptHint', e.target.value, { shouldDirty: true })
                markDirty()
              }}
            />
            <Input
              placeholder="加密标题（可选）"
              value={form.watch('encryptTitle') ?? ''}
              onChange={(e) => {
                form.setValue('encryptTitle', e.target.value, { shouldDirty: true })
                markDirty()
              }}
            />
            <textarea
              className="input-base min-h-[64px] resize-none"
              placeholder="解锁前文案（可选）"
              value={form.watch('encryptMessage') ?? ''}
              onChange={(e) => {
                form.setValue('encryptMessage', e.target.value, { shouldDirty: true })
                markDirty()
              }}
            />
          </div>
        ) : null}
      </section>

      {/* 操作区 */}
      {!isNew && (
        <section className="pt-2 border-t border-border-subtle">
          <Button
            variant="danger"
            size="sm"
            icon={<Trash2 size={14} />}
            onClick={handleDelete}
            disabled={remove.isPending}
            className="w-full"
          >
            删除{isPage ? '页面' : '文章'}
          </Button>
        </section>
      )}
    </div>
  )

  return (
    <div className="admin-page-lock min-h-0 flex flex-col border border-border bg-card rounded-sm overflow-hidden">
      {/* 顶栏 */}
      <div className="shrink-0 border-b border-border px-4 py-2.5 flex items-center gap-3 flex-wrap">
        <Link
          to={listBase}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft size={16} />
          {isPage ? '页面' : '文章'}
        </Link>

        <Badge tone={statusTone} dot>{statusLabel}</Badge>

        {/* 顶栏元信息（移动端隐藏） */}
        <div className="edit-topbar-meta inline-flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {dirty ? '未保存' : savedAt ? `已保存 ${savedAt}` : detail.data ? '已同步' : ''}
          </span>
          <span className="text-xs text-muted-foreground">{wordCount} 字</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            icon={<Save size={14} />}
            disabled={save.isPending || publish.isPending}
            onClick={handleSave}
          >
            保存草稿
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={save.isPending || publish.isPending}
            onClick={handlePublish}
          >
            {status === 'published' && inProgress ? '发布修改' : '发布'}
          </Button>
        </div>
      </div>

      {/* 主区域：编辑器 + 侧栏 */}
      <div className="editor-layout">
        {/* 左侧：编辑器 */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* 标题 + slug 预览 */}
          <div className="shrink-0 px-6 pt-5 pb-2">
            <input
              className="w-full text-2xl font-medium bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground"
              style={{ border: 'none', boxShadow: 'none' }}
              placeholder={isPage ? '页面标题' : '文章标题'}
              value={title}
              onChange={(e) => {
                form.setValue('title', e.target.value, { shouldDirty: true })
                markDirty()
              }}
            />
            {/* slug 自动生成行（移动端隐藏） */}
            <div className="slug-preview-row mt-2 flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                <span className="text-muted-foreground/60">/</span>
                <span>{slug || '未设置路径'}</span>
              </span>
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <button
                  type="button"
                  className={`slug-toggle ${slugAuto ? 'on' : ''}`}
                  onClick={() => setSlugAuto((v) => !v)}
                  aria-label={slugAuto ? '关闭自动生成' : '开启自动生成'}
                />
                <span className="text-xs text-muted-foreground">自动生成</span>
              </label>
            </div>
          </div>

          {/* 编辑器滚动区 */}
          <div className="flex-1 min-h-0 overflow-y-auto studio-scroll px-4 pb-4 editor-scrollport">
            <div ref={editorHostRef}>
              <Suspense
                fallback={
                  <div className="min-h-[240px] flex items-center justify-center text-sm text-muted-foreground">
                    编辑器加载中…
                  </div>
                }
              >
                <OverTypeEditor
                  key={editorId}
                  value={contentMd}
                  height={560}
                  onChange={(v) => {
                    form.setValue('contentMd', v, { shouldDirty: true })
                    markDirty()
                  }}
                  placeholder="使用 Markdown 书写正文"
                  onOpenMedia={() => setMediaOpen(true)}
                />
              </Suspense>
            </div>
          </div>
        </div>

        {/* 右侧栏（桌面端） / 底部面板（移动端） */}
        <aside
          className={`editor-sidebar ${sideOpen ? '' : 'collapsed'} ${mobileSideOpen ? 'mobile-open' : ''}`}
        >
          {/* 收起/展开按钮（桌面端显示，移动端隐藏） */}
          <button
            type="button"
            className="h-10 shrink-0 hidden md:flex items-center justify-end px-3 border-b border-border-subtle text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setSideOpen((v) => !v)}
            aria-label={sideOpen ? '收起侧栏' : '展开侧栏'}
          >
            {sideOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>

          {/* 移动端面板头部（移动端显示，桌面端隐藏） */}
          <div className="md:hidden h-10 shrink-0 flex items-center justify-center border-b border-border-subtle text-xs text-muted-foreground">
            文章设置
          </div>

          {(sideOpen || mobileSideOpen) ? sidebarContent : null}
        </aside>
      </div>

      {/* 移动端 FAB 按钮 */}
      <button
        type="button"
        className="sidebar-fab"
        onClick={() => setMobileSideOpen((v) => !v)}
        aria-label={mobileSideOpen ? '关闭设置' : '打开设置'}
      >
        <SlidersHorizontal size={20} />
      </button>

      <MediaPicker
        open={mediaOpen}
        onClose={() => setMediaOpen(false)}
        onPick={insertMarkdown}
      />
    </div>
  )
}

