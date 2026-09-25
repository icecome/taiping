<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const userName = ref('')
const isLogin = computed(() => route.path === '/login' || route.path === '/install')
const pendingMessages = ref(0)

const nav = [
  {
    group: '内容',
    items: [
      { to: '/posts', label: '文章', icon: '文' },
      { to: '/pages', label: '页面', icon: '页' },
      { to: '/moments', label: '说说', icon: '说' },
      { to: '/messages', label: '留言', icon: '评' },
      { to: '/taxonomies', label: '分类 / 标签', icon: '类' },
    ],
  },
  {
    group: '外观与系统',
    items: [
      { to: '/theme', label: '主题设置', icon: '观' },
      { to: '/image-beds', label: '图床', icon: '图' },
      { to: '/settings', label: '站点设置', icon: '设' },
      { to: '/tools', label: '工具', icon: '工' },
    ],
  },
]

const crumb = computed(() => {
  for (const g of nav) {
    for (const item of g.items) {
      if (route.path.startsWith(item.to)) return item.label
    }
  }
  if (route.path.startsWith('/posts')) return '文章'
  return '仪表盘'
})

onMounted(async () => {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' })
    const data = (await res.json()) as { user?: { displayName?: string; name?: string } | null }
    userName.value = data.user?.displayName || data.user?.name || ''
  } catch {
    userName.value = ''
  }
  try {
    const res = await fetch('/api/admin/messages?status=pending', { credentials: 'include' })
    const data = (await res.json()) as { items?: unknown[] }
    pendingMessages.value = data.items?.length || 0
  } catch {
    pendingMessages.value = 0
  }
})

async function logout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
  } catch {
    // ignore
  }
  router.push('/login')
}
</script>

<template>
  <div class="shell" :class="{ 'shell--flat': isLogin }">
    <aside v-if="!isLogin" class="sidebar" aria-label="主导航">
      <RouterLink class="brand" to="/">
        <span class="brand-mark" aria-hidden="true">太</span>
        <div>
          <div class="brand-title">太平</div>
          <div class="brand-sub">Tai-Ping Console</div>
        </div>
      </RouterLink>

      <nav class="nav">
        <div class="nav-group">
          <div class="nav-group-title">工作台</div>
          <RouterLink class="nav-item" to="/">
            <span class="nav-icon" aria-hidden="true">台</span>
            <span>仪表盘</span>
          </RouterLink>
        </div>
        <div v-for="g in nav" :key="g.group" class="nav-group">
          <div class="nav-group-title">{{ g.group }}</div>
          <RouterLink v-for="item in g.items" :key="item.to" class="nav-item" :to="item.to">
            <span class="nav-icon" aria-hidden="true">{{ item.icon }}</span>
            <span>{{ item.label }}</span>
            <span v-if="item.to === '/messages' && pendingMessages > 0" class="nav-badge">
              {{ pendingMessages }}
            </span>
          </RouterLink>
        </div>
      </nav>

      <div class="side-foot">
        <div class="user-row">
          <div class="user-chip">
            <span class="avatar">{{ (userName || '管')[0] }}</span>
            <div>
              <div class="user-name">{{ userName || '管理员' }}</div>
              <div class="user-role">超级管理员</div>
            </div>
          </div>
          <button type="button" class="logout" @click="logout">退出</button>
        </div>
      </div>
    </aside>

    <div class="main-wrap">
      <header v-if="!isLogin" class="topbar">
        <div class="crumbs">
          <span>太平</span>
          <span aria-hidden="true">/</span>
          <span class="crumb-current">{{ crumb }}</span>
        </div>
        <div class="top-actions">
          <RouterLink class="btn primary" to="/posts/new">撰写文章</RouterLink>
        </div>
      </header>

      <main class="content">
        <RouterView />
      </main>
    </div>
  </div>
</template>
