import type { AdminRoute } from '../types'
import { PostEditPage } from '../../pages/PostEditPage'
import { PostListPage } from '../../pages/PostListPage'

export const routeModules: AdminRoute[] = [
  {
    path: '/posts',
    element: <PostListPage contentType="post" />,
    menu: { label: '文章', group: 'contents', priority: 1 },
  },
  {
    path: '/posts/new',
    element: <PostEditPage contentType="post" />,
    hidden: true,
  },
  {
    path: '/posts/:id',
    element: <PostEditPage contentType="post" />,
    hidden: true,
  },
]
