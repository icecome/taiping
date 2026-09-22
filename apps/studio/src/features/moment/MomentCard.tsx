import { Link as LinkIcon, Video } from 'lucide-react'
import type { Moment } from '@taiping/content-model/moment'
import { shanghaiTimeHm } from '@taiping/shared-utils/date'
import { Card } from '../../components/ui/Card'
import { MomentImageGrid } from './MomentImageGrid'

export function MomentCard({
  moment,
  onEdit,
  onDelete,
}: {
  moment: Moment
  onEdit: (m: Moment) => void
  onDelete: (id: string) => void
}) {
  const time = shanghaiTimeHm(moment.createdAt)
  // 无作者时不显示头像，与前台 MomentsFeed 的条件渲染保持一致
  const authorInitial = moment.author?.trim().charAt(0) ?? ''

  return (
    <Card padding="sm" className="mb-2">
      <div className="flex items-start gap-2.5">
        {authorInitial ? (
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-xs text-primary-foreground shrink-0">
            {authorInitial}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground mb-1">{time}</div>
          <p className="text-sm text-foreground whitespace-pre-wrap mb-2">
            {moment.contentMd}
          </p>

          {moment.pictures?.length ? (
            <MomentImageGrid pictures={moment.pictures} />
          ) : null}

          {moment.videoUrl ? (
            <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
              <Video size={14} className="shrink-0" />
              <span className="truncate">{moment.videoUrl}</span>
            </div>
          ) : null}

          {moment.linkUrl ? (
            <div className="flex items-center gap-2 mb-2 p-2 border border-border-subtle rounded-sm bg-secondary" style={{ maxWidth: 380 }}>
              <LinkIcon size={14} className="text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-foreground truncate">
                  {moment.linkText || '链接'}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {moment.linkUrl}
                </div>
              </div>
            </div>
          ) : null}

          {moment.tagNames?.length ? (
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              {moment.tagNames.map((tag) => (
                <span key={tag} className="text-xs text-info">
                  #{tag}
                </span>
              ))}
            </div>
          ) : null}

          <div className="flex items-center gap-2 mt-1.5">
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => onEdit(moment)}
            >
              编辑
            </button>
            <span className="text-muted-foreground">·</span>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-destructive transition-colors"
              onClick={() => onDelete(moment.id)}
            >
              删除
            </button>
          </div>
        </div>
      </div>
    </Card>
  )
}
