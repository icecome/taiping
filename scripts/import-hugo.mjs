/**
 * 从 Hugo test_blog 经管理 API 导入文章/说说/页面到 taiping_blog
 * 用法: node scripts/import-hugo.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = process.env.HUGO_CONTENT
  ? path.resolve(process.env.HUGO_CONTENT)
  : 'C:\\opt\\workstations\\project\\blogs\\test_blog\\content'
const BASE = process.env.TAIPING_BASE || 'http://127.0.0.1:8787'
const USER = process.env.TAIPING_USER || 'admin'
const PASS = process.env.TAIPING_PASS
if (!PASS) {
  console.error('缺少 TAIPING_PASS 环境变量。示例：')
  console.error('  $env:TAIPING_PASS = "<管理口令>"; node scripts/import-hugo.mjs')
  process.exit(1)
}

const CATEGORY_BY_DIR = {
  tech: '实践实操',
  life: '庸人杂思',
  prose: '文稿汇总',
  travel: '行旅游记',
  letters: '给友信件',
}

/** @type {string} */
let cookie = ''

function parseFrontmatter(raw) {
  const text = raw.replace(/^﻿/, '')
  if (!text.startsWith('---')) {
    return { data: {}, body: text }
  }
  const end = text.indexOf('\n---', 3)
  if (end < 0) return { data: {}, body: text }
  const fm = text.slice(3, end).replace(/^\r?\n/, '')
  const body = text.slice(end + 4).replace(/^\r?\n/, '')
  return { data: parseSimpleYaml(fm), body }
}

function parseSimpleYaml(fm) {
  /** @type {Record<string, unknown>} */
  const data = {}
  let currentKey = ''
  /** @type {string[] | null} */
  let currentList = null

  for (const line of fm.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    const listMatch = line.match(/^(\s*)-\s+(.*)$/)
    if (listMatch && currentList) {
      currentList.push(stripQuotes(listMatch[2].trim()))
      continue
    }
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/)
    if (!kv) continue
    const key = kv[1]
    const value = kv[2].trim()
    if (value === '') {
      currentKey = key
      currentList = []
      data[key] = currentList
      continue
    }
    currentKey = key
    currentList = null
    if (value.startsWith('[') && value.endsWith(']')) {
      data[key] = value
        .slice(1, -1)
        .split(',')
        .map((s) => stripQuotes(s.trim()))
        .filter(Boolean)
    } else {
      data[key] = coerce(stripQuotes(value))
    }
  }
  void currentKey
  return data
}

function stripQuotes(v) {
  if (
    (v.startsWith("'") && v.endsWith("'")) ||
    (v.startsWith('"') && v.endsWith('"'))
  ) {
    return v.slice(1, -1)
  }
  return v
}

function coerce(v) {
  if (v === 'true') return true
  if (v === 'false') return false
  return v
}

function toIso(dateVal, fallbackFile) {
  if (!dateVal) {
    const m = fallbackFile.match(/(\d{8})/)
    if (m) {
      return `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6, 8)}T00:00:00.000Z`
    }
    return new Date().toISOString()
  }
  const d = new Date(String(dateVal))
  if (Number.isNaN(d.getTime())) {
    return toIso(null, fallbackFile)
  }
  return d.toISOString()
}

function excerptFrom(body) {
  const more = body.indexOf('<!-- more -->')
  const src = more >= 0 ? body.slice(0, more) : body
  return src
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_`~\[\]()!]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)
}

function listFiles(dir) {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith('.md') && !d.name.startsWith('_'))
    .map((d) => path.join(dir, d.name))
}

async function api(pathname, init = {}) {
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (init.method && init.method !== 'GET' && init.method !== 'HEAD') {
    headers.set('X-Requested-With', 'XMLHttpRequest')
  }
  if (cookie) headers.set('Cookie', cookie)
  const res = await fetch(`${BASE}${pathname}`, { ...init, headers })
  const setCookie = res.headers.get('set-cookie')
  if (setCookie) cookie = setCookie.split(';')[0]
  const json = await res.json().catch(() => null)
  return { status: res.status, json, res }
}

async function ensureCategory(name) {
  const listed = await api('/api/admin/terms?type=category')
  const hit = listed.json?.data?.find((t) => t.name === name || t.slug === name)
  if (hit) return hit
  const created = await api('/api/admin/terms', {
    method: 'POST',
    body: JSON.stringify({ type: 'category', name }),
  })
  if (!created.json?.ok) throw new Error(`create category ${name}: ${JSON.stringify(created.json)}`)
  return created.json.data
}

async function createPost(payload) {
  const res = await api('/api/admin/posts', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (res.json?.ok) return { ok: true, data: res.json.data }
  if (res.json?.error?.code === 'CONFLICT') return { ok: false, conflict: true, error: res.json.error }
  return { ok: false, error: res.json?.error || { code: String(res.status), message: 'unknown' } }
}

async function createMoment(payload) {
  const res = await api('/api/admin/moments', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (res.json?.ok) return { ok: true, data: res.json.data }
  return { ok: false, error: res.json?.error || { code: String(res.status), message: 'unknown' } }
}

function parsePictures(data) {
  const raw = data.pictures
  if (!raw) return []
  if (!Array.isArray(raw)) return []
  return raw.map((item) => {
    const s = String(item).trim()
    return { url: s }
  })
}

function parseTags(data) {
  const tags = data.tags
  if (!tags) return []
  return (Array.isArray(tags) ? tags : [tags]).map(String).map((s) => s.trim()).filter(Boolean)
}

function parseCategoriesFromFm(data) {
  const cats = data.categories
  if (!cats) return []
  return (Array.isArray(cats) ? cats : [cats]).map(String).map((s) => s.trim()).filter(Boolean)
}

async function importPosts() {
  const postsRoot = path.join(SRC, 'posts')
  const dirs = fs
    .readdirSync(postsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)

  const categoryMap = new Map()
  for (const dir of dirs) {
    const name = CATEGORY_BY_DIR[dir] || dir
    const term = await ensureCategory(name)
    categoryMap.set(dir, term)
  }

  let ok = 0
  let skip = 0
  let fail = 0

  for (const dir of dirs) {
    const files = listFiles(path.join(postsRoot, dir))
    const term = categoryMap.get(dir)
    for (const file of files) {
      const raw = fs.readFileSync(file, 'utf8')
      const { data, body } = parseFrontmatter(raw)
      const title = String(data.title || path.basename(file, '.md'))
      const slug = String(data.slug || '').trim()
      if (!slug) {
        console.warn('[skip] no slug:', path.relative(SRC, file))
        skip++
        continue
      }
      const fmCats = parseCategoriesFromFm(data)
      const categoryIds = []
      if (term) categoryIds.push(term.id)
      // frontmatter 额外分类名：若已是目录分类则忽略，否则尝试创建
      for (const c of fmCats) {
        if (c === term?.name) continue
        const t = await ensureCategory(c)
        if (!categoryIds.includes(t.id)) categoryIds.push(t.id)
      }
      const payload = {
        slug,
        type: 'post',
        title,
        contentMd: body,
        excerpt: excerptFrom(body),
        cover: data.cover ? String(data.cover) : undefined,
        status: 'published',
        publishedAt: toIso(data.date, path.basename(file)),
        categoryIds,
        tagNames: parseTags(data),
        encrypt: false,
      }
      const result = await createPost(payload)
      if (result.ok) {
        ok++
      } else if (result.conflict) {
        skip++
        console.log('[skip] exists:', slug)
      } else {
        fail++
        console.error('[fail] post', slug, result.error)
      }
    }
  }
  return { ok, skip, fail }
}

async function importPages() {
  const pageFiles = [
    { file: path.join(SRC, 'pages/about.md'), slug: 'about', template: undefined },
    { file: path.join(SRC, 'pages/update.md'), slug: 'update', template: undefined },
    { file: path.join(SRC, 'pages/guestbook.md'), slug: 'guestbook-hugo', template: 'guestbook' },
  ]
  let ok = 0
  let skip = 0
  let fail = 0
  for (const item of pageFiles) {
    if (!fs.existsSync(item.file)) continue
    const { data, body } = parseFrontmatter(fs.readFileSync(item.file, 'utf8'))
    const payload = {
      slug: item.slug,
      type: 'page',
      title: String(data.title || item.slug),
      contentMd: body,
      excerpt: excerptFrom(body),
      status: 'published',
      publishedAt: toIso(data.date, path.basename(item.file)),
      template: item.template,
      categoryIds: [],
      tagNames: [],
      encrypt: false,
    }
    const result = await createPost(payload)
    if (result.ok) ok++
    else if (result.conflict) {
      skip++
      console.log('[skip] page exists:', item.slug)
    } else {
      fail++
      console.error('[fail] page', item.slug, result.error)
    }
  }
  return { ok, skip, fail }
}

async function importMoments() {
  const files = listFiles(path.join(SRC, 'moments'))
  let ok = 0
  let skip = 0
  let fail = 0
  for (const file of files) {
    const { data, body } = parseFrontmatter(fs.readFileSync(file, 'utf8'))
    const payload = {
      contentMd: body.trim() || String(data.title || ''),
      pictures: parsePictures(data),
      videoUrl: data.video ? String(data.video) : undefined,
      linkUrl: data.link ? String(data.link) : undefined,
      linkText: data.link_text ? String(data.link_text) : undefined,
      author: data.author ? String(data.author) : '徐宋柏',
      status: 'published',
      tagNames: parseTags(data),
    }
    // 说说无 slug，按正文+时间跳过重复较难；简单按 title+date 文件名跳过可选
    const result = await createMoment(payload)
    if (result.ok) ok++
    else {
      fail++
      console.error('[fail] moment', path.basename(file), result.error)
    }
    void skip
  }
  return { ok, fail, total: files.length }
}

async function main() {
  console.log('BASE', BASE)
  console.log('SRC', SRC)
  const login = await api('/api/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: USER, password: PASS, trusted: true }),
  })
  if (!login.json?.ok) {
    console.error('login failed', login.status, login.json)
    process.exit(1)
  }
  console.log('login ok', login.json.data)

  const pages = await importPages()
  console.log('pages', pages)
  const posts = await importPosts()
  console.log('posts', posts)
  const moments = await importMoments()
  console.log('moments', moments)

  const overview = await api('/api/admin/overview')
  console.log('overview', overview.json)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
