<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { api } from '../api'

const tab = ref('basic')
const error = ref('')
const message = ref('')
const form = reactive({
  title: '',
  subtitle: '',
  description: '',
  footer: '',
  icp: '',
  guestbookEnabled: true,
  commentEnabled: true,
  postsPerPage: 10,
  momentsTitle: '',
  momentsSignature: '',
})

const tabs = [
  { id: 'basic', label: '基本设置' },
  { id: 'content', label: '内容设置' },
  { id: 'comment', label: '评论 / 留言' },
  { id: 'seo', label: 'SEO / 输出' },
]

onMounted(async () => {
  try {
    const { settings } = await api.settings()
    form.title = String(settings.title || '')
    form.subtitle = String(settings.subtitle || '')
    form.description = String(settings.description || '')
    form.footer = String(settings.footer || '')
    form.icp = String(settings.icp || '')
    form.guestbookEnabled = settings.guestbookEnabled !== false
    form.commentEnabled = settings.commentEnabled !== false
    form.postsPerPage = Number(settings.postsPerPage || 10)
    form.momentsTitle = String(settings.momentsTitle || '')
    form.momentsSignature = String(settings.momentsSignature || '')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  }
})

async function save() {
  error.value = ''
  message.value = ''
  try {
    await api.saveSettings({ ...form })
    message.value = '设置已保存'
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败'
  }
}
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h1>站点设置</h1>
        <p class="page-desc">分组配置站点信息、内容与评论策略</p>
      </div>
    </div>

    <div class="panel">
      <div class="tabs">
        <button
          v-for="t in tabs"
          :key="t.id"
          type="button"
          class="tab"
          :class="{ active: tab === t.id }"
          @click="tab = t.id"
        >
          {{ t.label }}
        </button>
      </div>

      <div v-if="tab === 'basic'" class="form-grid">
        <div class="field">
          <label>站点标题 *</label>
          <input v-model="form.title" required />
        </div>
        <div class="field">
          <label>副标题</label>
          <input v-model="form.subtitle" />
        </div>
        <div class="field full">
          <label>站点描述</label>
          <textarea v-model="form.description" rows="3" />
        </div>
        <div class="field">
          <label>页脚文案</label>
          <input v-model="form.footer" />
        </div>
        <div class="field">
          <label>ICP 备案</label>
          <input v-model="form.icp" />
        </div>
      </div>

      <div v-else-if="tab === 'content'" class="form-grid">
        <div class="field">
          <label>每页文章数</label>
          <input v-model.number="form.postsPerPage" type="number" min="1" max="50" />
        </div>
        <div class="field">
          <label>说说标题</label>
          <input v-model="form.momentsTitle" placeholder="说说" />
        </div>
        <div class="field full">
          <label>说说签名</label>
          <input v-model="form.momentsSignature" />
        </div>
      </div>

      <div v-else-if="tab === 'comment'" class="form-grid">
        <div class="field">
          <label>启用文章评论</label>
          <select v-model="form.commentEnabled">
            <option :value="true">开启</option>
            <option :value="false">关闭</option>
          </select>
        </div>
        <div class="field">
          <label>启用留言板</label>
          <select v-model="form.guestbookEnabled">
            <option :value="true">开启</option>
            <option :value="false">关闭</option>
          </select>
        </div>
        <p class="muted full">
          留言数据结构兼容 blog-comment，可在「留言」页导入历史库。
        </p>
      </div>

      <div v-else class="form-grid">
        <div class="field full">
          <label>RSS / Sitemap</label>
          <div class="hint">已启用 /rss.xml 与 /sitemap.xml，发布后自动纳入。</div>
        </div>
        <div class="field full">
          <label>缓存</label>
          <div class="hint">匿名 GET HTML 页面缓存约 5 分钟，登录后台不缓存。</div>
        </div>
      </div>

      <div class="row" style="margin-top: 8px;">
        <button class="primary" type="button" @click="save">保存设置</button>
        <span v-if="message" class="success">{{ message }}</span>
        <span v-if="error" class="error">{{ error }}</span>
      </div>
    </div>
  </div>
</template>
