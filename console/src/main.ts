import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import InstallView from './views/InstallView.vue'
import LoginView from './views/LoginView.vue'
import DashboardView from './views/DashboardView.vue'
import PostsView from './views/PostsView.vue'
import PostEditView from './views/PostEditView.vue'
import SettingsView from './views/SettingsView.vue'
import MessagesView from './views/MessagesView.vue'
import TaxonomiesView from './views/TaxonomiesView.vue'
import ThemeView from './views/ThemeView.vue'
import ImageBedView from './views/ImageBedView.vue'
import ToolsView from './views/ToolsView.vue'
import MomentsView from './views/MomentsView.vue'
import PagesView from './views/PagesView.vue'
import './styles.css'

const router = createRouter({
  history: createWebHistory('/console/'),
  routes: [
    { path: '/install', component: InstallView },
    { path: '/login', component: LoginView },
    { path: '/', component: DashboardView },
    { path: '/posts', component: PostsView },
    { path: '/posts/new', component: PostEditView },
    { path: '/posts/:id', component: PostEditView },
    { path: '/pages', component: PagesView },
    { path: '/moments', component: MomentsView },
    { path: '/messages', component: MessagesView },
    { path: '/taxonomies', component: TaxonomiesView },
    { path: '/theme', component: ThemeView },
    { path: '/image-beds', component: ImageBedView },
    { path: '/settings', component: SettingsView },
    { path: '/tools', component: ToolsView },
  ],
})

router.beforeEach(async (to) => {
  if (to.path === '/install' || to.path === '/login') return true
  try {
    const res = await fetch('/install-status', { credentials: 'include' })
    const data = (await res.json()) as { initialized: boolean }
    if (!data.initialized) return '/install'
  } catch {
    // 网络异常放行
  }
  return true
})

createApp(App).use(router).mount('#app')
