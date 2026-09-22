import { SettingsPage } from '../../pages/SettingsPage'
import type { AdminRoute } from '../types'

export const routeModule: AdminRoute = {
  path: '/settings',
  element: <SettingsPage />,
  menu: { label: '设置', group: 'system', priority: 5 },
}
