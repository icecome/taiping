<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'

type PostRow = {
  id: number
  title: string
  slug: string
  status: string
  pinned: number
  comments_num: number
  created_at: string
  modified_at: string
  published_at: string | null
}

const posts = ref<PostRow[]>([])
const keyword = ref('')
const statusFilter = ref('')
const error = ref('')

const filtered = computed(() => {
  return posts.value.filter((p) => {
    const okStatus = !statusFilter.value || p.status === statusFilter.value
    const okKey =
      !keyword.value ||
      p.title.toLowerCase().includes(keyword.value.toLowerCase()) ||
      p.slug.includes(keyword.value)
    return okStatus && okKey
  })
})

async function load() {
  try {
    const data = await api.posts()
    posts.value = data.posts as unknown as PostRow[]
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  }
}

async function remove(id: number) {
  if (!confirm('确定删除这篇文章？')) return
  await api.deletePost(id)
  await load()
}

function statusClass(status: string) {
  if (status === 'published') return 'ok'
  if (status === 'draft') return 'warn'
  return ''
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    published: '已发布',
    draft: '草稿',
    private: '私密',
    hidden: '隐藏',
  }
  return map[status] || status
}

onMounted(load)
</script>

<template>
  <div>
    <header class="page-head">
      <div>
        <p class="eyebrow">内容</p>
        <h1 class="page-title serif">文章</h1>
        <p class="page-desc">撰写入口在顶部工具栏，列表专注筛选与管理。</p>
      </div>
    </header>

    <div class="panel">
      <div class="toolbar">
        <label class="search-field">
          <span class="sr-only">搜索文章</span>
          <input v-model="keyword" type="search" placeholder="搜索标题 / slug" />
        </label>
        <label class="select-field">
          <span class="sr-only">状态筛选</span>
          <select v-model="statusFilter">
            <option value="">全部状态</option>
            <option value="published">已发布</option>
            <option value="draft">草稿</option>
            <option value="private">私密</option>
          </select>
        </label>
        <div class="spacer"></div>
        <span class="muted">共 {{ filtered.length }} 篇</span>
      </div>

      <p v-if="error" class="error">{{ error }}</p>
      <div v-if="!filtered.length" class="empty">没有匹配的文章</div>

      <ul v-else class="post-rows">
        <li v-for="p in filtered" :key="p.id" class="post-row">
          <div>
            <RouterLink class="post-title" :to="`/posts/${p.id}`">{{ p.title }}</RouterLink>
            <div class="post-meta">
              <span class="badge" :class="statusClass(p.status)">{{ statusLabel(p.status) }}</span>
              <span>/posts/{{ p.slug }}</span>
              <span class="dot" aria-hidden="true"></span>
              <span>更新于 {{ p.modified_at }}</span>
              <span class="dot" aria-hidden="true"></span>
              <span>{{ p.comments_num || 0 }} 评论</span>
            </div>
          </div>
          <div class="post-actions">
            <RouterLink class="btn ghost sm" :to="`/posts/${p.id}`">编辑</RouterLink>
            <button class="btn ghost sm danger-text" type="button" @click="remove(p.id)">删除</button>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>
