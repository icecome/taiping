import {
  renderArchives,
  renderGuestbook,
  renderIndex,
  renderList,
  renderMoments,
  renderNotFound,
  renderPage,
  renderPost,
  renderTaxonomy,
} from './pages'
import type { SlotRenderer } from './types'

export * from './types'
export * from './pages'
export {
  ArticleCard,
  CommentForm,
  CommentList,
  EncryptGate,
  Layout,
  MomentsFeed,
  Pagination,
} from './components'

export const theme = {
  name: 'zhuosu',
  renderIndex,
  renderPost,
  renderList,
  renderArchives,
  renderTaxonomy,
  renderMoments,
  renderGuestbook,
  renderPage,
  renderNotFound,
  slots: {} as Record<string, SlotRenderer>,
  styles: ['/theme/styles/zhuosu.css'],
  scripts: [
    '/theme/scripts/main.js',
    '/theme/scripts/search.js',
    '/theme/scripts/guestbook.js',
    '/theme/scripts/moment.js',
  ],
}

export default theme
