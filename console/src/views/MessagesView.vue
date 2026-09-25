<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { api } from '../api'

type Message = {
  id: number
  visitor_name: string
  content: string
  status: string
  page_url: string
  created_at: string
  reply_content: string
  replies?: Array<{ id: number; reply_content: string; reply_type: string }>
}

const items = ref<Message[]>([])
const filter = ref('')
const error = ref('')
const replyDraft = ref('')
const importText = ref('')
const importResult = ref('')
const activeId = ref<number | null>(null)
const lastFocus = ref<HTMLElement | null>(null)

const active = computed(() => items.value.find((m) => m.id === activeId.value) || null)

const filtered = computed(() => {
  if (!filter.value) return items.value
  return items.value.filter((m) => m.status === filter.value)
})

function statusClass(status: string) {
  if (status === 'approved') return 'ok'
  if (status === 'pending') return 'warn'
  if (status === 'featured') return 'featured'
  if (status === 'spam') return 'spam'
  return ''
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    pending: '待审',
    approved: '通过',
    featured: '精选',
    spam: '垃圾',
  }
  return map[status] || status
}

async function load() {
  try {
    const data = await api.messages(filter.value || undefined)
    items.value = data.items as unknown as Message[]
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  }
}

function openDrawer(m: Message, event?: Event) {
  lastFocus.value = (event?.currentTarget as HTMLElement) || null
  activeId.value = m.id
  replyDraft.value = ''
}

function closeDrawer() {
  activeId.value = null
  replyDraft.value = ''
  lastFocus.value?.focus()
  lastFocus.value = null
}

async function act(action: string) {
  if (activeId.value == null) return
  await api.messageAction(activeId.value, action)
  await load()
  if (action === 'delete') {
    closeDrawer()
    return
  }
}

async function reply() {
  if (activeId.value == null || !replyDraft.value.trim()) return
  await api.replyMessage(activeId.value, replyDraft.value)
  replyDraft.value = ''
  await load()
}

async function importData() {
  importResult.value = ''
  try {
    const payload = JSON.parse(importText.value)
    const { summary } = await api.importMessages(payload)
    importResult.value = `导入完成：${JSON.stringify(summary)}`
    await load()
  } catch (e) {
    importResult.value = e instanceof Error ? e.message : '导入失败'
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && activeId.value != null) {
    closeDrawer()
  }
}

onMounted(() => {
  load()
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div>
    <header class="page-head">
      <div>
        <p class="eyebrow">内容</p>
        <h1 class="page-title serif">留言</h1>
        <p class="page-desc">点击条目打开抽屉，查看对话并调整状态。</p>
      </div>
    </header>

    <div class="panel">
      <div class="toolbar">
        <div class="tabs" role="tablist" aria-label="留言状态筛选">
          <button class="tab" :class="{ 'is-active': !filter }" type="button" @click="filter = ''; load()">全部</button>
          <button class="tab" :class="{ 'is-active': filter === 'pending' }" type="button" @click="filter = 'pending'; load()">待审</button>
          <button class="tab" :class="{ 'is-active': filter === 'approved' }" type="button" @click="filter = 'approved'; load()">通过</button>
          <button class="tab" :class="{ 'is-active': filter === 'featured' }" type="button" @click="filter = 'featured'; load()">精选</button>
          <button class="tab" :class="{ 'is-active': filter === 'spam' }" type="button" @click="filter = 'spam'; load()">垃圾</button>
        </div>
        <div class="spacer"></div>
        <span class="muted">共 {{ filtered.length }} 条</span>
      </div>

      <p v-if="error" class="error">{{ error }}</p>
      <div v-if="!filtered.length" class="empty">当前筛选下暂无留言</div>

      <ul v-else class="message-list">
        <li
          v-for="m in filtered"
          :key="m.id"
          class="message-item"
          tabindex="0"
          role="button"
          @click="openDrawer(m, $event)"
          @keydown.enter.prevent="openDrawer(m, $event)"
          @keydown.space.prevent="openDrawer(m, $event)"
        >
          <div class="message-head">
            <strong>{{ m.visitor_name }}</strong>
            <span class="badge" :class="statusClass(m.status)">{{ statusLabel(m.status) }}</span>
            <time>{{ m.created_at }}</time>
            <span class="message-from">{{ m.page_url }}</span>
          </div>
          <p>{{ m.content }}</p>
        </li>
      </ul>
    </div>

    <section class="panel" style="margin-top: 16px;">
      <h2 class="serif">导入 blog-comment 历史库</h2>
      <p class="muted">粘贴 JSON：{"messages":[...],"replies":[...]}</p>
      <textarea v-model="importText" rows="6" placeholder='{"messages":[],"replies":[]}' />
      <div class="row" style="margin-top: 10px;">
        <button class="primary" type="button" @click="importData">导入</button>
        <span v-if="importResult" class="muted">{{ importResult }}</span>
      </div>
    </section>

    <div v-if="active" class="drawer" @click.self="closeDrawer">
      <div class="drawer-backdrop" @click="closeDrawer"></div>
      <aside class="drawer-panel" role="dialog" aria-modal="true" aria-label="留言详情">
        <header class="drawer-head">
          <div>
            <p class="eyebrow">对话</p>
            <h2 class="serif">{{ active.visitor_name }}</h2>
          </div>
          <button class="icon-btn" type="button" aria-label="关闭" @click="closeDrawer">×</button>
        </header>

        <div class="drawer-body">
          <div class="drawer-meta">
            <div class="drawer-author">
              <div class="avatar">{{ active.visitor_name.slice(0, 1) }}</div>
              <div>
                <div class="user-name">{{ active.visitor_name }}</div>
                <div class="user-role">{{ active.created_at }} · {{ active.page_url }}</div>
              </div>
            </div>
            <div class="status-row" aria-label="留言状态">
              <button class="status-chip" :class="{ 'is-active': active.status === 'pending' }" type="button" @click="act('pending')">待审</button>
              <button class="status-chip" :class="{ 'is-active': active.status === 'approved' }" type="button" @click="act('approve')">通过</button>
              <button class="status-chip" :class="{ 'is-active': active.status === 'featured' }" type="button" @click="act('feature')">精选</button>
              <button class="status-chip" :class="{ 'is-active': active.status === 'spam' }" type="button" @click="act('spam')">垃圾</button>
            </div>
          </div>

          <div class="thread">
            <div class="bubble">
              <div class="bubble-meta">
                <span>{{ active.visitor_name }}</span>
                <span>{{ active.created_at }}</span>
              </div>
              <div>{{ active.content }}</div>
            </div>
            <div v-for="r in active.replies || []" :key="r.id" class="bubble is-me">
              <div class="bubble-meta">
                <span>博主</span>
                <span>{{ r.reply_type }}</span>
              </div>
              <div>{{ r.reply_content }}</div>
            </div>
          </div>

          <form class="reply-form" @submit.prevent="reply">
            <label class="sr-only" for="reply-input">回复内容</label>
            <textarea id="reply-input" v-model="replyDraft" rows="4" placeholder="写下回复…"></textarea>
            <div class="reply-actions">
              <button class="btn ghost sm" type="button" @click="act('delete')">删除</button>
              <button class="btn primary" type="submit">发送回复</button>
            </div>
          </form>
        </div>
      </aside>
    </div>
  </div>
</template>
