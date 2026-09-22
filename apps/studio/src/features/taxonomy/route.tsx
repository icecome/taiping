import { TaxonomyPage } from '../../pages/TaxonomyPage'
import type { AdminRoute } from '../types'

export const routeModule: AdminRoute = {
  path: '/taxonomy',
  element: <TaxonomyPage />,
  menu: { label: '分类标签', group: 'contents', priority: 3.5 },
}
