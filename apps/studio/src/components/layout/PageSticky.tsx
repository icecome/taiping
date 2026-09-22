import { useEffect, useRef, type ReactNode } from 'react'

/** 列表/设置页吸顶区：页头+筛选/菜单固定，高度写入 --page-chrome-h 供表头 sticky 使用 */
export function PageSticky({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      document.documentElement.style.setProperty('--page-chrome-h', `${el.offsetHeight}px`)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      ro.disconnect()
      document.documentElement.style.removeProperty('--page-chrome-h')
    }
  }, [])

  return (
    <div ref={ref} className="admin-sticky-chrome">
      {children}
    </div>
  )
}
