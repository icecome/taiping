import { CommentAuditPage } from '../../pages/CommentAuditPage'
import type { AdminRoute } from '../types'

export const routeModule: AdminRoute = {
  path: '/comments',
  element: <CommentAuditPage />,
  menu: { label: '评论', group: 'contents', priority: 3 },
}
