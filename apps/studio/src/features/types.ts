import type { ReactElement } from 'react'

export interface AdminRouteMenu {
  label: string
  /** overview 独立置顶，不显示分组标题 */
  group?: 'overview' | 'contents' | 'appearance' | 'system'
  priority?: number
}

export interface AdminRoute {
  path: string
  element: ReactElement
  menu?: AdminRouteMenu
  /** 不在侧边栏显示，但仍注册路由 */
  hidden?: boolean
}
