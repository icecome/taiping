export function MomentImageGrid({ pictures }: { pictures: Array<{ url: string; alt?: string }> }) {
  if (!pictures.length) return null
  const count = pictures.length
  // 根据数量决定列数：1张单图，2-4张两列，5-9张三列
  const cols = count === 1 ? 1 : count <= 4 ? 2 : 3
  const maxWidth = count === 1 ? '180px' : count <= 4 ? '240px' : '280px'
  return (
    <div
      className="grid gap-1 mb-2"
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, maxWidth }}
    >
      {pictures.map((pic, i) => (
        <div
          key={i}
          className="aspect-square rounded-sm bg-secondary border border-border overflow-hidden"
        >
          <img
            src={pic.url}
            alt={pic.alt ?? ''}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      ))}
    </div>
  )
}
