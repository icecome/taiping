<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

type Meta = { id: number; name: string; slug: string; type: string; count: number }

const categories = ref<Meta[]>([])
const tags = ref<Meta[]>([])
const error = ref('')
const categoryDraft = ref('')
const tagDraft = ref('')
const selected = ref<{ type: 'category' | 'tag'; id: number; name: string } | null>(null)

async function load() {
  try {
    const res = await fetch('/api/taxonomies', { credentials: 'include' })
    const data = await res.json()
    categories.value = (data.categories || []) as Meta[]
    tags.value = (data.tags || []) as Meta[]
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  }
}

async function create(type: 'category' | 'tag') {
  const name = (type === 'category' ? categoryDraft.value : tagDraft.value).trim()
  if (!name) return
  await fetch('/api/taxonomies', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, name }),
  })
  if (type === 'category') categoryDraft.value = ''
  else tagDraft.value = ''
  await load()
}

async function remove(type: 'category' | 'tag', item: Meta) {
  if (!confirm(`确定删除「${item.name}」？`)) return
  await fetch(`/api/taxonomies/${item.id}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type }),
  })
  if (selected.value?.id === item.id) selected.value = null
  await load()
}

function pick(type: 'category' | 'tag', item: Meta) {
  selected.value = { type, id: item.id, name: item.name }
}

const selectedLabel = computed(() =>
  selected.value ? `当前：${selected.value.name}` : '选择左侧分类或标签',
)

onMounted(load)
</script>

<template>
  <div>
    <header class="page-head">
      <div>
        <p class="eyebrow">内容</p>
        <h1 class="page-title serif">分类 / 标签</h1>
        <p class="page-desc">维护结构，并管理与文章的关联。</p>
      </div>
    </header>

    <p v-if="error" class="error">{{ error }}</p>

    <div class="taxo-grid">
      <section class="panel taxo-panel">
        <div class="panel-head">
          <h2 class="serif">分类</h2>
        </div>
        <form class="inline-form" @submit.prevent="create('category')">
          <label class="sr-only" for="category-name">新分类名称</label>
          <input id="category-name" v-model="categoryDraft" type="text" placeholder="新分类名称，如「读书札记」" />
          <button class="btn primary sm" type="submit">添加</button>
        </form>
        <div v-if="!categories.length" class="empty">暂无分类</div>
        <ul v-else class="taxo-list">
          <li
            v-for="c in categories"
            :key="c.id"
            class="taxo-item"
            :class="{ 'is-active': selected?.id === c.id && selected?.type === 'category' }"
          >
            <button class="taxo-main" type="button" @click="pick('category', c)">
              <span class="taxo-name">{{ c.name }}</span>
              <span class="taxo-count">{{ c.count }} 篇文章</span>
            </button>
            <div class="taxo-actions">
              <button class="btn ghost sm danger-text" type="button" @click="remove('category', c)">删除</button>
            </div>
          </li>
        </ul>
      </section>

      <section class="panel taxo-panel">
        <div class="panel-head">
          <h2 class="serif">标签</h2>
        </div>
        <form class="inline-form" @submit.prevent="create('tag')">
          <label class="sr-only" for="tag-name">新标签名称</label>
          <input id="tag-name" v-model="tagDraft" type="text" placeholder="新标签名称，如「随笔」" />
          <button class="btn primary sm" type="submit">添加</button>
        </form>
        <div v-if="!tags.length" class="empty">暂无标签</div>
        <ul v-else class="taxo-list">
          <li
            v-for="t in tags"
            :key="t.id"
            class="taxo-item"
            :class="{ 'is-active': selected?.id === t.id && selected?.type === 'tag' }"
          >
            <button class="taxo-main" type="button" @click="pick('tag', t)">
              <span class="taxo-name">{{ t.name }}</span>
              <span class="taxo-count">{{ t.count }} 篇文章</span>
            </button>
            <div class="taxo-actions">
              <button class="btn ghost sm danger-text" type="button" @click="remove('tag', t)">删除</button>
            </div>
          </li>
        </ul>
      </section>

      <section class="panel taxo-posts">
        <div class="panel-head">
          <h2 class="serif">关联文章</h2>
          <div class="taxo-active muted">{{ selectedLabel }}</div>
        </div>
        <p class="muted taxo-hint">
          为当前分类 / 标签添加文章，可在文章编辑页填写分类与标签；此处用于选中查看。
        </p>
        <div v-if="!selected" class="empty">尚未选择分类 / 标签</div>
        <div v-else class="empty">已选中「{{ selected.name }}」，关联管理可在文章编辑页维护。</div>
      </section>
    </div>
  </div>
</template>
