<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

type Moment = {
  id: string
  contentHtml: string
  createdAt: string
  author?: string
  tags?: string[]
}

const moments = ref<Moment[]>([])
const content = ref('')
const error = ref('')
const message = ref('')
const tagFilter = ref('')

function plainText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
}

function shortDate(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const visibleMoments = computed(() => {
  if (!tagFilter.value) return moments.value
  return moments.value.filter((m) => (m.tags || []).includes(tagFilter.value))
})

const tagCloud = computed(() => {
  const counts = new Map<string, number>()
  moments.value.forEach((m) => {
    const tags = m.tags || extractTags(plainText(m.contentHtml))
    tags.forEach((t) => counts.set(t, (counts.get(t) || 0) + 1))
  })
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
})

function extractTags(text: string) {
  const matches = text.match(/#[^\s#]+/g) || []
  return matches.map((t) => t.slice(1)).slice(0, 4)
}

const monthLabel = computed(() => {
  const now = new Date()
  return `${now.getFullYear()}年${now.getMonth() + 1}月`
})

const calendarDays = computed(() => {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const today = now.getDate()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startOffset = (new Date(year, month, 1).getDay() + 6) % 7

  const activity = new Map<number, number>()
  moments.value.forEach((m) => {
    const d = new Date(m.createdAt)
    if (d.getFullYear() === year && d.getMonth() === month) {
      activity.set(d.getDate(), (activity.get(d.getDate()) || 0) + 1)
    }
  })

  const cells: Array<{ day: number | null; level: number; today: boolean }> = []
  for (let i = 0; i < startOffset; i += 1) cells.push({ day: null, level: 0, today: false })
  for (let day = 1; day <= daysInMonth; day += 1) {
    const count = activity.get(day) || 0
    const level = count <= 0 ? 0 : count === 1 ? 2 : count === 2 ? 3 : 4
    cells.push({ day, level, today: day === today })
  }
  const remainder = (7 - ((startOffset + daysInMonth) % 7)) % 7
  for (let i = 0; i < remainder; i += 1) cells.push({ day: null, level: 0, today: false })
  return cells
})

async function load() {
  try {
    const res = await fetch('/api/moments')
    const data = await res.json()
    moments.value = data.moments || []
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  }
}

async function publish() {
  error.value = ''
  message.value = ''
  try {
    const res = await fetch('/api/moments', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: content.value }),
    })
    if (!res.ok) throw new Error('发布失败')
    content.value = ''
    message.value = '已发布'
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '发布失败'
  }
}

function filterByTag(tag: string) {
  tagFilter.value = tagFilter.value === tag ? '' : tag
}

onMounted(load)
</script>

<template>
  <div>
    <header class="page-head">
      <div>
        <p class="eyebrow">内容</p>
        <h1 class="page-title serif">说说</h1>
        <p class="page-desc">左侧随手记，右侧回顾节奏与主题。</p>
      </div>
    </header>

    <div class="moments-layout">
      <div class="moments-main">
        <section class="panel moment-composer">
          <div class="panel-head">
            <h2 class="serif">写点什么</h2>
            <span class="muted">短内容 · 支持换行</span>
          </div>
          <div class="field">
            <label class="sr-only" for="moment-input">说说内容</label>
            <textarea id="moment-input" v-model="content" rows="3" maxlength="280" placeholder="此刻的想法、摘录或碎片记录…"></textarea>
          </div>
          <div class="composer-actions">
            <span class="muted">{{ content.length }} / 280</span>
            <button class="primary" type="button" @click="publish">发布</button>
          </div>
          <p v-if="message" class="success">{{ message }}</p>
          <p v-if="error" class="error">{{ error }}</p>
        </section>

        <section class="panel">
          <div class="panel-head">
            <h2 class="serif">时间线</h2>
            <span class="muted">
              共 {{ moments.length }} 条
              <button v-if="tagFilter" class="tag-chip" type="button" @click="tagFilter = ''">显示全部</button>
            </span>
          </div>
          <div v-if="!visibleMoments.length" class="empty">暂无说说</div>
          <ul v-else class="moment-list">
            <li v-for="m in visibleMoments" :key="m.id" class="moment-item">
              <div class="moment-date">{{ shortDate(m.createdAt) }}</div>
              <div>
                <div class="moment-body">{{ plainText(m.contentHtml) }}</div>
                <div class="moment-meta">
                  <span>{{ m.createdAt }}</span>
                  <button
                    v-for="t in m.tags || extractTags(plainText(m.contentHtml))"
                    :key="t"
                    class="tag-chip"
                    type="button"
                    @click="filterByTag(t)"
                  >
                    #{{ t }}
                  </button>
                </div>
              </div>
            </li>
          </ul>
        </section>
      </div>

      <aside class="moments-side">
        <section class="panel">
          <div class="panel-head">
            <h2 class="serif">活跃日历</h2>
            <span class="muted">{{ monthLabel }}</span>
          </div>
          <div class="calendar" aria-label="当月说说活跃日历">
            <div class="calendar-weekdays" aria-hidden="true">
              <span>一</span><span>二</span><span>三</span><span>四</span>
              <span>五</span><span>六</span><span>日</span>
            </div>
            <div class="calendar-grid">
              <span
                v-for="(c, i) in calendarDays"
                :key="i"
                class="calendar-day"
                :class="{ 'is-empty': c.day == null, 'is-today': c.today }"
                :data-level="c.level"
                :title="c.day ? `${monthLabel}${c.day}日` : ''"
              >{{ c.day ?? '' }}</span>
            </div>
          </div>
          <div class="heatmap-legend">
            <span>少</span>
            <i data-level="0"></i>
            <i data-level="1"></i>
            <i data-level="2"></i>
            <i data-level="3"></i>
            <i data-level="4"></i>
            <span>多</span>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <h2 class="serif">标签云</h2>
          </div>
          <div v-if="!tagCloud.length" class="empty">暂无标签</div>
          <div v-else class="tag-cloud">
            <button
              v-for="[name, count] in tagCloud"
              :key="name"
              class="tag-cloud-item"
              type="button"
              :style="{ fontSize: `${12 + Math.min(count, 4) * 2}px` }"
              @click="filterByTag(name)"
            >
              #{{ name }}<small>{{ count }}</small>
            </button>
          </div>
        </section>
      </aside>
    </div>
  </div>
</template>
