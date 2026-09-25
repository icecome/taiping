<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '../api'

const postCount = ref(0)
const messageCount = ref(0)
const publishedCount = ref(0)
const draftCount = ref(0)
const pendingCount = ref(0)
const recentPosts = ref<Array<{ id: number; title: string; status: string; modified_at: string }>>([])
const recentMessages = ref<Array<{ id: number; visitor_name: string; content: string; status: string; created_at: string }>>([])
const error = ref('')

onMounted(async () => {
  try {
    const [posts, messages] = await Promise.all([api.posts(), api.messages()])
    recentPosts.value = posts.posts as unknown as typeof recentPosts.value
    postCount.value = posts.posts.length
    publishedCount.value = posts.posts.filter((p) => p.status === 'published').length
    draftCount.value = posts.posts.filter((p) => p.status === 'draft').length
    recentMessages.value = (messages.items as unknown as typeof recentMessages.value).slice(0, 5)
    messageCount.value = messages.items.length
    pendingCount.value = messages.items.filter((m) => m.status === 'pending').length
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  }
})

function statusClass(status: string) {
  if (status === 'published' || status === 'approved') return 'ok'
  if (status === 'draft' || status === 'pending') return 'warn'
  if (status === 'featured') return 'featured'
  if (status === 'spam') return 'spam'
  return ''
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    published: '已发布',
    draft: '草稿',
    pending: '待审',
    approved: '已通过',
    featured: '精选',
    spam: '垃圾',
    private: '私密',
  }
  return map[status] || status
}
</script>

<template>
  <div>
    <header class="page-head">
      <div>
        <p class="eyebrow">工作台</p>
        <h1 class="page-title serif">继续写点什么</h1>
        <p class="page-desc">站点概要与最近动态，对齐笔记软件的安静阅读节奏。</p>
      </div>
    </header>

    <p v-if="error" class="error">{{ error }}</p>

    <div class="metrics">
      <article class="metric">
        <div class="metric-label">文章</div>
        <div class="metric-value">{{ postCount }}</div>
        <div class="metric-sub">已发布 {{ publishedCount }} · 草稿 {{ draftCount }}</div>
      </article>
      <article class="metric">
        <div class="metric-label">留言</div>
        <div class="metric-value">{{ messageCount }}</div>
        <div class="metric-sub">待审 {{ pendingCount }}</div>
      </article>
      <article class="metric">
        <div class="metric-label">待办</div>
        <div class="metric-value">{{ draftCount + pendingCount }}</div>
        <div class="metric-sub">草稿 {{ draftCount }} · 待审留言 {{ pendingCount }}</div>
      </article>
      <article class="metric">
        <div class="metric-label">前台主题</div>
        <div class="metric-value metric-value--text">拙素</div>
        <div class="metric-sub">纸书排版 · 朱红点缀</div>
      </article>
    </div>

    <div class="split">
      <section class="panel">
        <div class="panel-head">
          <h2 class="serif">最近文章</h2>
          <RouterLink class="btn ghost sm" to="/posts">全部</RouterLink>
        </div>
        <div v-if="!recentPosts.length" class="empty">还没有文章</div>
        <ul v-else class="doc-list">
          <li v-for="p in recentPosts.slice(0, 6)" :key="p.id">
            <RouterLink class="doc-title" :to="`/posts/${p.id}`">{{ p.title }}</RouterLink>
            <div class="doc-meta">
              <span class="badge" :class="statusClass(p.status)">{{ statusLabel(p.status) }}</span>
              <span>{{ p.modified_at }}</span>
            </div>
          </li>
        </ul>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2 class="serif">快捷入口</h2>
        </div>
        <div class="quick-list">
          <a class="quick-row quick-row--hero" href="/" target="_blank" rel="noopener">
            <span class="quick-mark">站</span>
            <span>
              <span class="quick-title">前往站点</span>
              <span class="quick-desc">打开前台首页，预览阅读效果</span>
            </span>
          </a>
          <RouterLink class="quick-row" to="/posts/new">
            <span class="quick-mark">写</span>
            <span>
              <span class="quick-title">撰写文章</span>
              <span class="quick-desc">Markdown 写作与发布</span>
            </span>
          </RouterLink>
          <RouterLink class="quick-row" to="/posts">
            <span class="quick-mark">文</span>
            <span>
              <span class="quick-title">管理文章</span>
              <span class="quick-desc">筛选、编辑、删除</span>
            </span>
          </RouterLink>
          <RouterLink class="quick-row" to="/messages">
            <span class="quick-mark">评</span>
            <span>
              <span class="quick-title">审核留言</span>
              <span class="quick-desc">{{ pendingCount }} 条待处理</span>
            </span>
          </RouterLink>
          <RouterLink class="quick-row" to="/taxonomies">
            <span class="quick-mark">类</span>
            <span>
              <span class="quick-title">分类标签</span>
              <span class="quick-desc">组织内容结构</span>
            </span>
          </RouterLink>
        </div>
      </section>
    </div>

    <section class="panel">
      <div class="panel-head">
        <h2 class="serif">最近留言</h2>
        <RouterLink class="btn ghost sm" to="/messages">全部</RouterLink>
      </div>
      <div v-if="!recentMessages.length" class="empty">暂无留言</div>
      <ul v-else class="message-list">
        <li v-for="m in recentMessages" :key="m.id" class="message-item">
          <div class="message-head">
            <strong>{{ m.visitor_name }}</strong>
            <span class="badge" :class="statusClass(m.status)">{{ statusLabel(m.status) }}</span>
            <time>{{ m.created_at }}</time>
          </div>
          <p>{{ m.content }}</p>
        </li>
      </ul>
    </section>
  </div>
</template>
