import { Image as ImageIcon } from 'lucide-react'
import type { AdminRoute } from '../types'
import { MediaPage } from '../../pages/MediaPage'

export const routeModule: AdminRoute = {
  path: '/media',
  element: <MediaPage />,
  menu: { label: '图床', group: 'contents', priority: 3.2 },
}

void ImageIcon
