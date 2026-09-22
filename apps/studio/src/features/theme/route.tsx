import type { AdminRoute } from '../types'
import { ThemePage } from '../../pages/ThemePage'

export const routeModule: AdminRoute = {
  path: '/theme',
  element: <ThemePage />,
  menu: { label: '主题', group: 'appearance', priority: 4 },
}
