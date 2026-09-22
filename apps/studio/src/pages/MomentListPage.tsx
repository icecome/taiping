import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Calendar,
  Hash,
  MessageCircle,
  PenLine,
  X,
} from 'lucide-react'
import { api } from '../api/endpoints'
import { PageHeader } from '../components/ui/PageHeader'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { Pagination } from '../components/ui/Pagination'
import { toast } from '../lib/toast'
import { PageSticky } from '../components/layout/PageSticky'
import type { Moment } from '@taiping/content-model/moment'
import { confirmDialog } from '../components/ui/ConfirmDialog'
import { useFocusTrap } from '../lib/useFocusTrap'
import { useComposeState } from '../features/moment/composeState'
import { useMediaUpload } from '../features/moment/useMediaUpload'
import { clearDraft, createDebouncedSaver, loadDraft } from '../features/moment/draftPersistence'
import { MediaPicker } from '../components/media/MediaPicker'
import type { MediaFile } from '../lib/mediaUtils'
import { truncate } from '@taiping/shared-utils/string'
import { getDateKey, groupMomentsByDate } from '../features/moment/dateGroups'
import { aggregateTags } from '../features/moment/tagStats'
import { MomentCard } from '../features/moment/MomentCard'
import { CalendarHeatmap } from '../features/moment/CalendarHeatmap'
import { TagCloud } from '../features/moment/TagCloud'
import { ComposeCard } from '../features/moment/ComposeCard'

export function MomentListPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const compose = useComposeState()
  const {
    state: composeState,
    patchDraft,
    addPictures,
    updatePicture,
    removePicture,
    reorderPictures,
    reset: resetCompose,
  } = compose
  const isComposing = composeState.mode !== 'idle'
  const isEditing = composeState.mode === 'editing'

  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedTag, setSelectedTag] = useState<string | null>(null)

  const [filterOpen, setFilterOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const filterRef = useRef<HTMLDivElement | null>(null)
  const composeRef = useRef<HTMLDivElement | null>(null)

  const [isMobileSheet, setIsMobileSheet] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 768,
  )

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const onChange = () => setIsMobileSheet(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const composeSheetOpen = isComposing && isMobileSheet

  useFocusTrap(composeRef, composeSheetOpen)
  useFocusTrap(filterRef, filterOpen)

  useEffect(() => {
    if (!filterOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFilterOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [filterOpen])

  const moments = useQuery({
    queryKey: ['moments', { page, pageSize }],
    queryFn: () => api.moments.list({ page, pageSize }),
  })

  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.get(),
  })
  const authorName = settings.data?.author?.trim() ?? ''

  const allMoments = moments.data?.items ?? []

  const filteredMoments = useMemo(() => {
    return allMoments.filter((m) => {
      if (selectedDate && getDateKey(m.createdAt) !== selectedDate) return false
      if (selectedTag && !m.tagNames?.includes(selectedTag)) return false
      return true
    })
  }, [allMoments, selectedDate, selectedTag])

  const dateGroups = useMemo(
    () => groupMomentsByDate(filteredMoments),
    [filteredMoments],
  )

  const tagCounts = useMemo(() => aggregateTags(allMoments), [allMoments])

  const upload = useMediaUpload({
    onPictureUpdate: updatePicture,
    currentCount: () => composeState.draft.pictures.length,
  })

  const fileCache = useRef(new Map<string, File>())

  const handleAddPictures = useCallback(
    async (files: File[]) => {
      const outcome = await upload.uploadFiles(files, addPictures)
      const added = outcome.uploaded.map((u) => u.uid)
      files.forEach((f, idx) => {
        const placeholderUid = added[idx]
        if (placeholderUid) fileCache.current.set(placeholderUid, f)
      })

      if (outcome.rejected.length) {
        const first = outcome.rejected[0]
        toast(
          outcome.rejected.length === 1
            ? `${first?.name}：${first?.reason}`
            : `${outcome.rejected.length} 个文件被拒绝（${first?.reason}）`,
          'error',
        )
      }
      if (outcome.failed.length) {
        toast(`${outcome.failed.length} 张上传失败，可重试`, 'error')
      }
    },
    [upload, addPictures],
  )

  const handleRetryPicture = useCallback(
    async (uid: string) => {
      const file = fileCache.current.get(uid)
      if (!file) {
        toast('原文件已失效，请重新选择', 'error')
        return
      }
      const ok = await upload.uploadSingle(uid, file)
      toast(ok ? '已上传' : '上传失败', ok ? 'ok' : 'error')
    },
    [upload],
  )

  const handleInsertFromLibrary = useCallback(
    (files: MediaFile[]) => {
      const items = upload.insertFromLibrary(files)
      addPictures(items)
      toast(`已插入 ${items.length} 张`)
    },
    [upload, addPictures],
  )

  const saver = useRef(createDebouncedSaver())

  useEffect(() => {
    if (!isComposing) return
    saver.current.schedule(
      composeState.mode === 'editing' ? 'editing' : 'creating',
      composeState.editingId,
      composeState.draft,
    )
  }, [isComposing, composeState.mode, composeState.editingId, composeState.draft])

  const create = useMutation({
    mutationFn: () => api.moments.create(compose.toPayload()),
    onSuccess: () => {
      saver.current.cancel()
      clearDraft()
      resetCompose()
      queryClient.invalidateQueries({ queryKey: ['moments'] })
      toast('说说已发布')
    },
    onError: () => toast('发布失败，内容已保留', 'error'),
  })

  const update = useMutation({
    mutationFn: (input: { id: string; data: unknown }) =>
      api.moments.update(input.id, input.data),
    onSuccess: () => {
      saver.current.cancel()
      clearDraft()
      resetCompose()
      queryClient.invalidateQueries({ queryKey: ['moments'] })
      toast('已更新')
    },
    onError: () => toast('更新失败，内容已保留', 'error'),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.moments.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['moments'] })
      toast('已删除')
    },
    onError: () => toast('删除失败', 'error'),
  })

  const handleEdit = useCallback(
    (m: Moment) => {
      compose.enterEdit(m)
    },
    [compose],
  )

  const handlePublish = useCallback(() => {
    if (!compose.canSubmit) return
    const payload = compose.toPayload(authorName)
    if (composeState.editingId) {
      update.mutate({ id: composeState.editingId, data: payload })
    } else {
      create.mutate()
    }
  }, [compose, composeState.editingId, update, create, authorName])

  const handleCancelEdit = useCallback(() => {
    saver.current.cancel()
    clearDraft()
    resetCompose()
  }, [resetCompose])

  const draftChecked = useRef(false)
  useEffect(() => {
    if (draftChecked.current) return
    draftChecked.current = true

    if (!isMobileSheet) compose.enterCreate()

    const stored = loadDraft()
    if (!stored) return

    void (async () => {
      const preview = truncate(stored.draft.contentMd.trim(), 40)
      const ok = await confirmDialog({
        title: '恢复未发布的内容？',
        description: preview
          ? `检测到上次编辑的内容：「${preview}${stored.draft.contentMd.length > 40 ? '…' : ''}」`
          : '检测到上次未完成的编辑内容。',
        confirmLabel: '恢复',
        cancelLabel: '丢弃',
      })
      if (!ok) {
        clearDraft()
        return
      }
      if (stored.mode === 'editing' && stored.editingId) {
        const target = allMoments.find((m) => m.id === stored.editingId)
        if (target) {
          compose.enterEdit(target)
          patchDraft(stored.draft)
          toast('已恢复编辑内容')
          return
        }
      }
      compose.enterCreate()
      patchDraft(stored.draft)
      toast('已恢复草稿')
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({
      title: '删除这条说说？',
      description: '删除后无法恢复。',
      confirmLabel: '删除',
      danger: true,
    })
    if (ok) remove.mutate(id)
  }

  const handleClearFilters = () => {
    setSelectedDate(null)
    setSelectedTag(null)
  }

  useEffect(() => {
    const shouldLock = filterOpen || (isComposing && isMobileSheet)
    if (!shouldLock) return
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [filterOpen, isComposing, isMobileSheet])

  const hasActiveFilter = selectedDate !== null || selectedTag !== null

  const composeCard = (
    <ComposeCard
      state={composeState}
      patchDraft={patchDraft}
      onAddPictures={(files) => void handleAddPictures(files)}
      onRemovePicture={removePicture}
      onRetryPicture={(uid) => void handleRetryPicture(uid)}
      onReorderPictures={reorderPictures}
      onOpenLibrary={() => setLibraryOpen(true)}
      onPublish={handlePublish}
      onCancel={handleCancelEdit}
      canSubmit={compose.canSubmit}
      hasUploading={compose.hasUploading}
      hasFailed={compose.hasFailed}
      isSubmitting={create.isPending || update.isPending}
      mediaConfigured={upload.configured}
      mediaHint={upload.missingHint}
    />
  )

  return (
    <div className="space-y-4 flex flex-col">
      <PageSticky>
        <PageHeader
          icon={<MessageCircle size={20} />}
          title="说说"
          description="记录当下的想法"
          actions={
            <>
              <span className="text-sm text-muted-foreground">
                共 {moments.data?.total ?? 0} 条
              </span>
              <button
                type="button"
                className="btn-ghost btn-sm mobile-only"
                onClick={() => setFilterOpen(true)}
              >
                <Calendar size={16} />
                筛选
              </button>
            </>
          }
        />
      </PageSticky>

      <div className="moment-filter-bar mobile-only" style={{ display: 'none' }}>
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() => setFilterOpen(true)}
        >
          <Calendar size={14} />
          日历
        </button>
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() => setFilterOpen(true)}
        >
          <Hash size={14} />
          标签
        </button>
        {hasActiveFilter ? (
          <button
            type="button"
            className="btn-ghost btn-sm ml-auto"
            onClick={handleClearFilters}
          >
            清除筛选
          </button>
        ) : (
          <span className="text-xs text-muted-foreground ml-auto">
            共 {filteredMoments.length} 条
          </span>
        )}
      </div>

      <div
        className="grid gap-4 responsive-grid"
        style={{ gridTemplateColumns: '1fr 280px' }}
      >
        <div className="min-w-0 flex flex-col">
          {composeCard}

          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-foreground">时间线</h2>
            {hasActiveFilter ? (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={handleClearFilters}
              >
                清除筛选
              </button>
            ) : null}
          </div>

          <div className="-mx-1 px-1">
            {moments.isLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                加载中…
              </div>
            ) : !filteredMoments.length ? (
              <EmptyState
                title={hasActiveFilter ? '没有匹配的说说' : '暂无说说'}
                description={hasActiveFilter ? '试试调整筛选条件' : '发布一条试试'}
              />
            ) : (
              <div>
                {dateGroups.map((group) => (
                  <div key={group.key}>
                    <div className="text-xs text-muted-foreground mb-2 sticky top-0 bg-background py-1 z-10">
                      {group.label}
                    </div>
                    {group.items.map((moment) => (
                      <MomentCard
                        key={moment.id}
                        moment={moment}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {moments.data && !hasActiveFilter ? (
            <div className="mt-3">
              <Pagination
                page={moments.data.page}
                pageSize={moments.data.pageSize}
                total={moments.data.total}
                onChange={setPage}
                onPageSizeChange={(n) => {
                  setPage(1)
                  setPageSize(n)
                }}
              />
            </div>
          ) : null}
        </div>

        <div className="shrink-0 moment-right-column space-y-4">
          <CalendarHeatmap
            moments={allMoments}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />
          <TagCloud
            tags={tagCounts}
            selectedTag={selectedTag}
            onSelectTag={setSelectedTag}
          />
        </div>
      </div>

      <button
        type="button"
        className="moment-fab mobile-only"
        style={{
          display: 'none',
          position: 'fixed',
          bottom: 64,
          right: 16,
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: 'var(--primary)',
          color: 'var(--primary-foreground)',
          border: 'none',
          boxShadow: 'var(--shadow-floating)',
          zIndex: 40,
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
        onClick={() => compose.enterCreate()}
        aria-label="发布说说"
      >
        <PenLine size={20} />
      </button>

      {composeSheetOpen ? (
        <div
          className="compose-sheet-backdrop fixed inset-0 bg-black/30 z-50"
          onClick={() => handleCancelEdit()}
        />
      ) : null}

      <div
        ref={composeRef}
        role="dialog"
        aria-modal="true"
        aria-label={isEditing ? '编辑说说' : '发布说说'}
        className={`compose-sheet fixed left-0 right-0 bg-card border-t border-border z-50 overflow-y-auto flex flex-col ${composeSheetOpen ? 'open' : ''}`}
        style={{
          bottom: 0,
          maxHeight: '70vh',
          borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
          boxShadow: 'var(--shadow-floating)',
          display: composeSheetOpen ? 'flex' : 'none',
        }}
      >
        <div className="flex items-center justify-between p-3 border-b border-border-subtle">
          <span className="text-sm font-medium text-foreground">
            {isEditing ? '编辑说说' : '发布说说'}
          </span>
          <button
            type="button"
            className="w-9 h-9 inline-flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground hover:bg-secondary"
            onClick={() => handleCancelEdit()}
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-3">{composeCard}</div>
      </div>

      <MediaPicker
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        multiple
        onPickMany={handleInsertFromLibrary}
      />

      {filterOpen ? (
        <div
          className="filter-sheet-backdrop fixed inset-0 bg-black/30 z-50"
          onClick={() => setFilterOpen(false)}
        />
      ) : null}

      <div
        ref={filterRef}
        role="dialog"
        aria-modal="true"
        aria-label="筛选"
        className={`filter-sheet fixed left-0 right-0 bg-card border-t border-border z-50 overflow-y-auto flex flex-col ${filterOpen ? 'open' : ''}`}
        style={{
          bottom: 0,
          maxHeight: '60vh',
          borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
          boxShadow: 'var(--shadow-floating)',
          display: filterOpen ? 'flex' : 'none',
        }}
      >
        <div className="flex items-center justify-between p-3 border-b border-border-subtle">
          <span className="text-sm font-medium text-foreground">筛选</span>
          <button
            type="button"
            className="w-9 h-9 inline-flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground hover:bg-secondary"
            onClick={() => setFilterOpen(false)}
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-3 space-y-3">
          <CalendarHeatmap
            moments={allMoments}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />
          <TagCloud
            tags={tagCounts}
            selectedTag={selectedTag}
            onSelectTag={setSelectedTag}
          />
          {hasActiveFilter ? (
            <Button variant="ghost" size="sm" onClick={handleClearFilters}>
              清除全部筛选
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
