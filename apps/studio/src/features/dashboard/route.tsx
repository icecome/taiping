import { DashboardPage } from '../../pages/DashboardPage'
import type { AdminRoute } from '../types'

export const routeModule: AdminRoute = {
  path: '/',
  element: <DashboardPage />,
  menu: { label: '概览', group: 'overview', priority: 0 },
}
