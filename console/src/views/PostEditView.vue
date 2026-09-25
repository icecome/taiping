<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api'
import OverTypeEditor from '../components/OverTypeEditor.vue'

const route = useRoute()
const router = useRouter()
const title = ref('')
const slug = ref('')
const text = ref('')
const status = ref('draft')
const cover = ref('')
const excerpt = ref('')
const allowComment = ref(true)
const pinned = ref(false)
const publishedAt = ref('')
const categoryInput = ref('')
const tagInput = ref('')
const showPreview = ref(false)
const showAdvanced = ref(false)
const message = ref('')
const error = ref('')
const loading = ref(false)

onMounted(async () => {
  const id = Number(route.params.id)
  if (!Number.isInteger(id)) return
  try {
    const { post } = await api.getPost(id)
    title.value = String(post.title || '')
    slug.value = String(post.slug || '')
    text.value = String((post as { contentMarkdown?: string }).contentMarkdown || '')
    status.value = String(post.status || 'draft')
    cover.value = String(post.cover || '')
    excerpt.value = String(post.excerpt || '')
    allowComment.value = post.allowComment !== false
    pinned.value = Boolean(post.pinned)
    publishedAt.value = String((post.publishedAt as string) || '').slice(0, 16)
    categoryInput.value = ((post as { categories?: Array<{ name: string }> }).categories || [])
      .map((c) => c.name)
      .join(', ')
    tagInput.value = ((post as { tags?: Array<{ name: string }> }).tags || [])
      .map((t) => t.name)
      .join(', ')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  }
})

function splitList(input: string): string[] {
  return input
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

async function save(nextStatus?: string) {
  error.value = ''
  message.value = ''
  loading.value = true
  try {
    const body = {
      title: title.value,
      slug: slug.value || title.value.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '') || `post-${Date.now()}`,
      text: text.value,
      status: nextStatus || status.value,
      cover: cover.value,
      excerpt: excerpt.value,
      allowComment: allowComment.value,
      pinned: pinned.value,
      publishedAt: publishedAt.value ? new Date(publishedAt.value).toISOString() : null,
      categories: splitList(categoryInput.value),
      tags: splitList(tagInput.value),
    }
    const id = Number(route.params.id)
    if (Number.isInteger(id)) {
      await api.updatePost(id, body)
    } else {
      await api.createPost(body)
    }
    message.value = nextStatus === 'published' ? '已发布' : '已保存'
    setTimeout(() => router.push('/posts'), 400)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div>
    <header class="page-head editor-head">
      <div>
        <p class="eyebrow">撰写</p>
        <h1 class="page-title serif">{{ route.params.id ? '编辑文章' : '撰写新文章' }}</h1>
      </div>
      <div class="row">
        <button class="ghost" type="button" @click="showPreview = !showPreview">
          {{ showPreview ? '继续编辑' : '预览' }}
        </button>
        <button class="ghost" type="button" :disabled="loading" @click="save('draft')">保存草稿</button>
        <button class="primary" type="button" :disabled="loading" @click="save('published')">发布</button>
      </div>
    </header>

    <div class="editor-layout">
      <article class="editor-surface">
        <input v-model="title" class="editor-title serif" placeholder="标题" aria-label="文章标题" />
        <div class="editor-slug muted">/posts/{{ slug || '（自动生成 slug）' }}</div>

        <div class="editor-box">
          <OverTypeEditor
            v-if="!showPreview"
            v-model="text"
            placeholder="使用 Markdown 写作，可粘贴图片上传图床…"
          />
          <div v-else class="preview-pane">{{ text || '（暂无内容）' }}</div>
        </div>

        <div class="panel" style="margin-top: 14px;">
          <button class="ghost" type="button" @click="showAdvanced = !showAdvanced">
            {{ showAdvanced ? '收起高级选项' : '高级选项' }}
          </button>
          <div v-if="showAdvanced" style="margin-top: 12px;">
            <div class="field">
              <label for="excerpt">摘要</label>
              <textarea id="excerpt" v-model="excerpt" rows="3" placeholder="留空将根据正文自动截取" />
            </div>
            <div class="field">
              <label for="cover">封面图 URL</label>
              <input id="cover" v-model="cover" placeholder="https://..." />
            </div>
          </div>
        </div>

        <p v-if="error" class="error" style="margin-top: 12px;">{{ error }}</p>
        <p v-if="message" class="success" style="margin-top: 12px;">{{ message }}</p>
      </article>

      <aside class="editor-side">
        <section class="panel">
          <h3 class="serif">发布</h3>
          <div class="field">
            <label for="status">状态</label>
            <select id="status" v-model="status">
              <option value="draft">草稿</option>
              <option value="published">已发布</option>
              <option value="private">私密</option>
              <option value="hidden">隐藏</option>
            </select>
          </div>
          <div class="field">
            <label for="pubdate">发布时间</label>
            <input id="pubdate" v-model="publishedAt" type="datetime-local" />
          </div>
          <label class="check">
            <input v-model="allowComment" type="checkbox" />
            <span>允许评论</span>
          </label>
          <label class="check">
            <input v-model="pinned" type="checkbox" />
            <span>置顶文章</span>
          </label>
        </section>

        <section class="panel">
          <h3 class="serif">分类</h3>
          <div class="field">
            <label for="cats">分类</label>
            <input id="cats" v-model="categoryInput" placeholder="生活, 技术（逗号分隔）" />
            <div class="hint">输入后保存会自动创建分类</div>
          </div>
        </section>

        <section class="panel">
          <h3 class="serif">标签</h3>
          <div class="field">
            <label for="tags">标签</label>
            <input id="tags" v-model="tagInput" placeholder="散文, 读书（逗号分隔）" />
          </div>
        </section>

        <section class="panel">
          <h3 class="serif">链接</h3>
          <div class="field">
            <label for="slug">Slug</label>
            <input id="slug" v-model="slug" placeholder="permalink-slug" />
          </div>
        </section>
      </aside>
    </div>
  </div>
</template>
