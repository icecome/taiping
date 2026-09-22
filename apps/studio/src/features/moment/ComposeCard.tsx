import { useEffect, useRef, useState } from 'react'
import { Hash, Image as ImageIcon, Link as LinkIcon, Send, Video } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ImageGridEditor } from '../../components/media/ImageGridEditor'
import type { ComposeState, MomentDraft } from './composeState'

export interface ComposeCardProps {
  state: ComposeState
  patchDraft: (patch: Partial<MomentDraft>) => void
  onAddPictures: (files: File[]) => void
  onRemovePicture: (uid: string) => void
  onRetryPicture: (uid: string) => void
  onReorderPictures: (from: number, to: number) => void
  onOpenLibrary: () => void
  onPublish: () => void
  onCancel: () => void
  canSubmit: boolean
  hasUploading: boolean
  hasFailed: boolean
  isSubmitting: boolean
  mediaConfigured: boolean
  mediaHint?: string
}

export function ComposeCard({
  state,
  patchDraft,
  onAddPictures,
  onRemovePicture,
  onRetryPicture,
  onReorderPictures,
  onOpenLibrary,
  onPublish,
  onCancel,
  canSubmit,
  hasUploading,
  hasFailed,
  isSubmitting,
  mediaConfigured,
  mediaHint,
}: ComposeCardProps) {
  const maxLen = 2000
  const draft = state.draft
  const isEditing = state.mode === 'editing'
  const [showVideo, setShowVideo] = useState(Boolean(draft.videoUrl))
  const [showLink, setShowLink] = useState(Boolean(draft.linkUrl))
  const [showTagInput, setShowTagInput] = useState(draft.tagNames.length > 0)
  const [newTag, setNewTag] = useState('')
  const [imageMenuOpen, setImageMenuOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  // 编辑目标切换时同步面板内的显隐开关
  useEffect(() => {
    setShowVideo(Boolean(draft.videoUrl))
    setShowLink(Boolean(draft.linkUrl))
    setShowTagInput(draft.tagNames.length > 0)
  }, [state.editingId, state.mode, draft.videoUrl, draft.linkUrl, draft.tagNames.length])

  // 点击外部收起图片菜单
  useEffect(() => {
    if (!imageMenuOpen) return
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setImageMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [imageMenuOpen])

  const handleAddTag = () => {
    const trimmed = newTag.trim()
    if (trimmed && !draft.tagNames.includes(trimmed)) {
      patchDraft({ tagNames: [...draft.tagNames, trimmed] })
    }
    setNewTag('')
  }

  return (
    <Card padding="md" className={`mb-4 moment-compose-card ${isEditing ? 'compose-editing' : ''}`}>
      {isEditing ? (
        <div className="compose-mode-bar">
          <span className="compose-mode-badge">编辑模式</span>
          <span className="compose-mode-hint">正在编辑已发布的说说</span>
        </div>
      ) : null}

      <textarea
        className="input-base border-0 resize-none focus:!shadow-none !p-0"
        rows={3}
        value={draft.contentMd}
        onChange={(e) => patchDraft({ contentMd: e.target.value.slice(0, maxLen) })}
        placeholder="这一刻的想法…"
      />

      <div className="flex flex-wrap items-center gap-1.5 mt-3 border-t border-border-subtle pt-2">
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button
            type="button"
            className="btn-ghost btn-sm moment-tool-btn"
            title="添加图片"
            aria-haspopup="menu"
            aria-expanded={imageMenuOpen}
            onClick={() => setImageMenuOpen((v) => !v)}
          >
            <ImageIcon size={14} />
            <span>图片</span>
          </button>
          {imageMenuOpen ? (
            <div className="compose-image-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                className="compose-image-menu-item"
                disabled={!mediaConfigured}
                onClick={() => {
                  setImageMenuOpen(false)
                  fileInputRef.current?.click()
                }}
              >
                上传本地图片
                <span className="compose-image-menu-hint">
                  {mediaConfigured ? '支持多选，自动存入图床' : '需先配置图床'}
                </span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="compose-image-menu-item"
                disabled={!mediaConfigured}
                onClick={() => {
                  setImageMenuOpen(false)
                  onOpenLibrary()
                }}
              >
                从图床选择
                <span className="compose-image-menu-hint">
                  {mediaConfigured ? '浏览已上传的图片' : '需先配置图床'}
                </span>
              </button>
            </div>
          ) : null}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            multiple
            className="hidden"
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? [])
              if (picked.length) onAddPictures(picked)
              e.target.value = ''
            }}
          />
        </div>

        <button
          type="button"
          className="btn-ghost btn-sm moment-tool-btn"
          title="添加视频"
          onClick={() => setShowVideo(!showVideo)}
        >
          <Video size={14} />
          <span>视频</span>
        </button>
        <button
          type="button"
          className="btn-ghost btn-sm moment-tool-btn"
          title="添加链接"
          onClick={() => setShowLink(!showLink)}
        >
          <LinkIcon size={14} />
          <span>链接</span>
        </button>
        <button
          type="button"
          className="btn-ghost btn-sm moment-tool-btn"
          title="添加标签"
          onClick={() => setShowTagInput(!showTagInput)}
        >
          <Hash size={14} />
          <span>标签</span>
        </button>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">
            {draft.contentMd.length}/{maxLen}
          </span>
          {isEditing ? (
            <Button variant="secondary" size="sm" onClick={onCancel} disabled={isSubmitting}>
              取消
            </Button>
          ) : null}
          <Button
            variant="primary"
            size="sm"
            icon={<Send size={14} />}
            disabled={!canSubmit || isSubmitting}
            onClick={onPublish}
          >
            {isSubmitting ? '发布中…' : isEditing ? '保存' : '发布'}
          </Button>
        </div>
      </div>

      {hasUploading ? (
        <div className="compose-block-hint">还有图片正在上传，完成后才能发布</div>
      ) : hasFailed ? (
        <div className="compose-block-hint compose-block-error">
          有图片上传失败，请重试或移除后再发布
        </div>
      ) : null}

      <ImageGridEditor
        pictures={draft.pictures}
        onAddLocal={() => fileInputRef.current?.click()}
        onRemove={onRemovePicture}
        onRetry={onRetryPicture}
        onReorder={onReorderPictures}
        addDisabled={!mediaConfigured}
        addDisabledHint={mediaHint || '需先配置图床'}
      />

      {showVideo ? (
        <div className="flex items-center gap-2 mt-3">
          <Video size={14} className="text-muted-foreground shrink-0" />
          <input
            className="input-base text-xs"
            style={{ maxWidth: 340 }}
            placeholder="视频链接"
            value={draft.videoUrl}
            onChange={(e) => patchDraft({ videoUrl: e.target.value })}
          />
        </div>
      ) : null}

      {showLink ? (
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <LinkIcon size={14} className="text-muted-foreground shrink-0" />
          <input
            className="input-base text-xs"
            style={{ maxWidth: 240 }}
            placeholder="链接地址"
            value={draft.linkUrl}
            onChange={(e) => patchDraft({ linkUrl: e.target.value })}
          />
          <input
            className="input-base text-xs"
            style={{ maxWidth: 160 }}
            placeholder="链接文案"
            value={draft.linkText}
            onChange={(e) => patchDraft({ linkText: e.target.value })}
          />
        </div>
      ) : null}

      {showTagInput ? (
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <Hash size={14} className="text-muted-foreground shrink-0" />
          {draft.tagNames.map((tag) => (
            <span key={tag} className="badge badge-muted gap-1">
              #{tag}
              <button
                type="button"
                onClick={() => patchDraft({ tagNames: draft.tagNames.filter((t) => t !== tag) })}
                aria-label={`移除标签 ${tag}`}
                style={{ lineHeight: 1 }}
              >
                ×
              </button>
            </span>
          ))}
          <input
            className="input-base text-xs"
            style={{ maxWidth: 140 }}
            placeholder="新标签后回车"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleAddTag()
              }
            }}
          />
          <button type="button" className="btn-ghost btn-sm" onClick={handleAddTag}>
            添加
          </button>
        </div>
      ) : null}
    </Card>
  )
}
