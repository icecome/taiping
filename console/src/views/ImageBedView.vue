<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'

type Bed = {
  id: number
  name: string
  type: string
  is_default: number
  enabled: number
  config: Record<string, unknown>
}

const beds = ref<Bed[]>([])
const error = ref('')
const message = ref('')
const showForm = ref(false)
const editingId = ref<number | null>(null)

const form = reactive({
  name: '',
  type: 'github',
  isDefault: true,
  // github
  githubToken: '',
  githubOwner: '',
  githubRepo: '',
  githubBranch: 'main',
  githubPath: 'uploads',
  githubCdn: '',
  // s3
  s3Endpoint: '',
  s3Region: 'auto',
  s3Bucket: '',
  s3AccessKey: '',
  s3SecretKey: '',
  s3PublicUrl: '',
  s3Prefix: '',
  // webdav
  webdavEndpoint: '',
  webdavUser: '',
  webdavPassword: '',
  webdavBasePath: '',
  webdavPublicUrl: '',
  // custom
  customUrl: '',
  customField: 'file',
  customUrlPath: 'url',
})

function resetForm() {
  editingId.value = null
  form.name = ''
  form.type = 'github'
  form.isDefault = true
  form.githubToken = ''
  form.githubOwner = ''
  form.githubRepo = ''
  form.githubBranch = 'main'
  form.githubPath = 'uploads'
  form.githubCdn = ''
  form.s3Endpoint = ''
  form.s3Region = 'auto'
  form.s3Bucket = ''
  form.s3AccessKey = ''
  form.s3SecretKey = ''
  form.s3PublicUrl = ''
  form.s3Prefix = ''
  form.webdavEndpoint = ''
  form.webdavUser = ''
  form.webdavPassword = ''
  form.webdavBasePath = ''
  form.webdavPublicUrl = ''
  form.customUrl = ''
  form.customField = 'file'
  form.customUrlPath = 'url'
}

function buildConfig(): Record<string, unknown> {
  if (form.type === 'github') {
    return {
      github: {
        token: form.githubToken,
        owner: form.githubOwner,
        repo: form.githubRepo,
        branch: form.githubBranch,
        path: form.githubPath,
        cdnBase: form.githubCdn,
      },
    }
  }
  if (form.type === 's3') {
    return {
      s3: {
        endpoint: form.s3Endpoint,
        region: form.s3Region,
        bucket: form.s3Bucket,
        accessKeyId: form.s3AccessKey,
        secretAccessKey: form.s3SecretKey,
        publicUrl: form.s3PublicUrl,
        keyPrefix: form.s3Prefix,
        pathStyle: true,
      },
    }
  }
  if (form.type === 'webdav') {
    return {
      webdav: {
        endpoint: form.webdavEndpoint,
        username: form.webdavUser,
        password: form.webdavPassword,
        basePath: form.webdavBasePath,
        publicUrl: form.webdavPublicUrl,
      },
    }
  }
  return {
    custom_http: {
      uploadUrl: form.customUrl,
      fieldName: form.customField,
      urlJsonPath: form.customUrlPath,
    },
  }
}

function fillFromBed(bed: Bed) {
  editingId.value = bed.id
  form.name = bed.name
  form.type = bed.type
  form.isDefault = Boolean(bed.is_default)
  const cfg = bed.config as Record<string, Record<string, string>>
  if (bed.type === 'github' && cfg.github) {
    form.githubToken = cfg.github.token || ''
    form.githubOwner = cfg.github.owner || ''
    form.githubRepo = cfg.github.repo || ''
    form.githubBranch = cfg.github.branch || 'main'
    form.githubPath = cfg.github.path || ''
    form.githubCdn = cfg.github.cdnBase || ''
  }
  if (bed.type === 's3' && cfg.s3) {
    form.s3Endpoint = cfg.s3.endpoint || ''
    form.s3Region = cfg.s3.region || 'auto'
    form.s3Bucket = cfg.s3.bucket || ''
    form.s3AccessKey = cfg.s3.accessKeyId || ''
    form.s3SecretKey = cfg.s3.secretAccessKey || ''
    form.s3PublicUrl = cfg.s3.publicUrl || ''
    form.s3Prefix = cfg.s3.keyPrefix || ''
  }
  if (bed.type === 'webdav' && cfg.webdav) {
    form.webdavEndpoint = cfg.webdav.endpoint || ''
    form.webdavUser = cfg.webdav.username || ''
    form.webdavPassword = cfg.webdav.password || ''
    form.webdavBasePath = cfg.webdav.basePath || ''
    form.webdavPublicUrl = cfg.webdav.publicUrl || ''
  }
  if (bed.type === 'custom_http' && cfg.custom_http) {
    form.customUrl = cfg.custom_http.uploadUrl || ''
    form.customField = cfg.custom_http.fieldName || 'file'
    form.customUrlPath = cfg.custom_http.urlJsonPath || 'url'
  }
  showForm.value = true
}

async function load() {
  error.value = ''
  try {
    const res = await fetch('/api/image-beds', { credentials: 'include' })
    const data = await res.json()
    if (!res.ok) throw new Error((data as { error?: string }).error || '加载失败')
    beds.value = (data as { items: Bed[] }).items || []
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  }
}

async function save() {
  error.value = ''
  message.value = ''
  try {
    const body = {
      name: form.name,
      type: form.type,
      config: buildConfig(),
      isDefault: form.isDefault,
    }
    const url = editingId.value ? `/api/image-beds/${editingId.value}` : '/api/image-beds'
    const res = await fetch(url, {
      method: editingId.value ? 'PUT' : 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((data as { error?: string }).error || '保存失败')
    message.value = '已保存'
    showForm.value = false
    resetForm()
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败'
  }
}

async function remove(id: number) {
  if (!confirm('删除该图床配置？')) return
  await fetch(`/api/image-beds/${id}`, { method: 'DELETE', credentials: 'include' })
  await load()
}

async function setDefault(id: number) {
  await fetch(`/api/image-beds/${id}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isDefault: true }),
  })
  await load()
}

onMounted(load)
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h1>图床</h1>
        <p class="page-desc">自定义图片上传源（S3 / WebDAV / GitHub / 自定义 HTTP），类似 PicList</p>
      </div>
      <button class="primary" type="button" @click="showForm = true; resetForm()">添加图床</button>
    </div>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="message" class="success">{{ message }}</p>

    <div v-if="showForm" class="panel" style="margin-bottom: 16px;">
      <h2>{{ editingId ? '编辑图床' : '添加图床' }}</h2>
      <div class="form-grid">
        <div class="field">
          <label>名称 *</label>
          <input v-model="form.name" placeholder="例如：GitHub 图床" />
        </div>
        <div class="field">
          <label>类型</label>
          <select v-model="form.type">
            <option value="github">GitHub 仓库</option>
            <option value="s3">S3 兼容（R2/MinIO/OSS/COS）</option>
            <option value="webdav">WebDAV</option>
            <option value="custom_http">自定义 HTTP</option>
          </select>
        </div>
        <div class="field full">
          <label class="check-item">
            <input v-model="form.isDefault" type="checkbox" />
            设为默认图床
          </label>
        </div>
      </div>

      <div v-if="form.type === 'github'" class="form-grid">
        <div class="field"><label>Token *</label><input v-model="form.githubToken" type="password" /></div>
        <div class="field"><label>Owner *</label><input v-model="form.githubOwner" /></div>
        <div class="field"><label>Repo *</label><input v-model="form.githubRepo" /></div>
        <div class="field"><label>Branch</label><input v-model="form.githubBranch" /></div>
        <div class="field"><label>Path</label><input v-model="form.githubPath" placeholder="uploads" /></div>
        <div class="field"><label>CDN Base（可选）</label><input v-model="form.githubCdn" placeholder="https://cdn.jsdelivr.net/gh/..." /></div>
      </div>

      <div v-else-if="form.type === 's3'" class="form-grid">
        <div class="field"><label>Endpoint *</label><input v-model="form.s3Endpoint" placeholder="https://s3.amazonaws.com" /></div>
        <div class="field"><label>Region</label><input v-model="form.s3Region" /></div>
        <div class="field"><label>Bucket *</label><input v-model="form.s3Bucket" /></div>
        <div class="field"><label>Access Key *</label><input v-model="form.s3AccessKey" /></div>
        <div class="field"><label>Secret Key *</label><input v-model="form.s3SecretKey" type="password" /></div>
        <div class="field"><label>Public URL</label><input v-model="form.s3PublicUrl" placeholder="https://img.example.com" /></div>
        <div class="field"><label>Key Prefix</label><input v-model="form.s3Prefix" placeholder="blog" /></div>
      </div>

      <div v-else-if="form.type === 'webdav'" class="form-grid">
        <div class="field"><label>Endpoint *</label><input v-model="form.webdavEndpoint" placeholder="https://dav.example.com/dav" /></div>
        <div class="field"><label>用户名</label><input v-model="form.webdavUser" /></div>
        <div class="field"><label>密码</label><input v-model="form.webdavPassword" type="password" /></div>
        <div class="field"><label>Base Path</label><input v-model="form.webdavBasePath" placeholder="images" /></div>
        <div class="field"><label>Public URL</label><input v-model="form.webdavPublicUrl" /></div>
      </div>

      <div v-else class="form-grid">
        <div class="field"><label>上传 URL *</label><input v-model="form.customUrl" /></div>
        <div class="field"><label>文件字段名</label><input v-model="form.customField" /></div>
        <div class="field"><label>URL JSON 路径</label><input v-model="form.customUrlPath" placeholder="data.url" /></div>
      </div>

      <div class="row">
        <button class="primary" type="button" @click="save">保存</button>
        <button class="ghost" type="button" @click="showForm = false">取消</button>
      </div>
    </div>

    <div class="panel">
      <div v-if="!beds.length" class="empty">尚未配置图床。添加后撰写页可粘贴/拖拽图片上传。</div>
      <div v-else class="list-cards">
        <div v-for="b in beds" :key="b.id" class="list-item">
          <div>
            <strong>{{ b.name }}</strong>
            <div class="meta">
              <span class="badge">{{ b.type }}</span>
              <span class="badge" :class="b.is_default ? 'ok' : ''">{{ b.is_default ? '默认' : '备用' }}</span>
              <span class="badge" :class="b.enabled ? 'ok' : 'warn'">{{ b.enabled ? '启用' : '停用' }}</span>
            </div>
          </div>
          <div class="row" style="gap: 6px;">
            <button v-if="!b.is_default" class="ghost" type="button" @click="setDefault(b.id)">设默认</button>
            <button class="ghost" type="button" @click="fillFromBed(b)">编辑</button>
            <button class="ghost" type="button" @click="remove(b.id)">删除</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
