import type { AdminRoute } from '../types'
import { PostEditPage } from '../../pages/PostEditPage'
import { PostListPage } from '../../pages/PostListPage'

export const routeModules: AdminRoute[] = [
  {
    path: '/pages',
    element: <PostListPage contentType="page" />,
    menu: { label: '页面', group: 'contents', priority: 1.5 },
  },
  {
    path: '/pages/new',
    element: <PostEditPage contentType="page" />,
    hidden: true,
  },
  {
    path: '/pages/:id',
    element: <PostEditPage contentType="page" />,
    hidden: true,
  },
]
