import { MomentListPage } from '../../pages/MomentListPage'
import type { AdminRoute } from '../types'

export const routeModule: AdminRoute = {
  path: '/moments',
  element: <MomentListPage />,
  menu: { label: '说说', group: 'contents', priority: 2 },
}
