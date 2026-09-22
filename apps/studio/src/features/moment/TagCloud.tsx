import { Card } from '../../components/ui/Card'
import type { TagCount } from './tagStats'

export function TagCloud({
  tags,
  selectedTag,
  onSelectTag,
}: {
  tags: TagCount[]
  selectedTag: string | null
  onSelectTag: (tag: string | null) => void
}) {
  if (!tags.length) {
    return (
      <Card padding="sm">
        <div className="text-sm font-medium text-foreground mb-2">标签</div>
        <div className="text-xs text-muted-foreground">暂无标签</div>
      </Card>
    )
  }
  return (
    <Card padding="sm">
      <div className="text-sm font-medium text-foreground mb-2">标签</div>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <button
            key={t.name}
            type="button"
            className={`tag-pill text-xs border rounded-full px-2 py-0.5 transition-colors ${
              selectedTag === t.name
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-secondary border-border text-foreground'
            }`}
            onClick={() => onSelectTag(selectedTag === t.name ? null : t.name)}
          >
            #{t.name} ({t.count})
          </button>
        ))}
      </div>
    </Card>
  )
}
