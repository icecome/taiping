import type { D1Database } from '@cloudflare/workers-types'
import type { Env } from '../env'
import { getMirrorSummary } from '../lib/mirror'

/**
 * Git 镜像导出：首期实现队列状态查询与手动重试标记。
 * 真正的 GitHub Data API 提交在配置 GITHUB_TOKEN + GITHUB_MIRROR_REPO 后启用。
 */
export async function getStatus(db: D1Database) {
  const summary = await getMirrorSummary(db)
  const recent = await db
    .prepare(
      `SELECT id, entity_type, entity_id, op, status, retry_count, last_error, created_at
       FROM mirror_queue ORDER BY created_at DESC LIMIT 20`,
    )
    .all()
  return { summary, recent: recent.results }
}

export async function retryFailed(db: D1Database): Promise<number> {
  const result = await db
    .prepare(
      `UPDATE mirror_queue SET status = 'pending', last_error = NULL
       WHERE status = 'failed'`,
    )
    .run()
  return result.meta.changes ?? 0
}

export async function processMirrorQueue(db: D1Database, env: Env): Promise<{ processed: number; skipped: number }> {
  if (!env.GITHUB_TOKEN || !env.GITHUB_MIRROR_REPO) {
    return { processed: 0, skipped: 0 }
  }
  const pending = await db
    .prepare(
      `SELECT id, entity_type, entity_id, op FROM mirror_queue
       WHERE status = 'pending' ORDER BY created_at ASC LIMIT 20`,
    )
    .all<{ id: string; entity_type: string; entity_id: string; op: string }>()

  let processed = 0
  for (const task of pending.results) {
    await db
      .prepare(`UPDATE mirror_queue SET status = 'processing' WHERE id = ?`)
      .bind(task.id)
      .run()
    try {
      const content = await buildSnapshot(db, task.entity_type, task.entity_id, task.op)
      if (content) {
        await commitToGithub(env, task.entity_type, task.entity_id, task.op, content)
      }
      await db
        .prepare(`UPDATE mirror_queue SET status = 'done', last_error = NULL WHERE id = ?`)
        .bind(task.id)
        .run()
      processed++
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await db
        .prepare(
          `UPDATE mirror_queue SET status = 'failed', retry_count = retry_count + 1, last_error = ?
           WHERE id = ?`,
        )
        .bind(message.slice(0, 500), task.id)
        .run()
    }
  }
  return { processed, skipped: pending.results.length - processed }
}

async function buildSnapshot(
  db: D1Database,
  entityType: string,
  entityId: string,
  op: string,
): Promise<string | null> {
  if (op === 'delete') {
    return `# deleted ${entityType}:${entityId}\n`
  }
  if (entityType === 'post' || entityType === 'page') {
    const row = await db
      .prepare('SELECT * FROM posts WHERE id = ?')
      .bind(entityId)
      .first<Record<string, unknown>>()
    if (!row) return null
    return toMarkdownFrontmatter(row, String(row.content_md ?? ''))
  }
  if (entityType === 'moment') {
    const row = await db
      .prepare('SELECT * FROM moments WHERE id = ?')
      .bind(entityId)
      .first<Record<string, unknown>>()
    if (!row) return null
    return toMarkdownFrontmatter(row, String(row.content_md ?? ''))
  }
  return null
}

function toMarkdownFrontmatter(meta: Record<string, unknown>, body: string): string {
  const lines: string[] = ['---']
  for (const [key, value] of Object.entries(meta)) {
    if (key === 'content_md' || key === 'content_html') continue
    if (value === null || value === undefined) continue
    const snake = key
    if (typeof value === 'object') {
      lines.push(`${snake}: ${JSON.stringify(value)}`)
    } else if (typeof value === 'boolean') {
      lines.push(`${snake}: ${value}`)
    } else {
      lines.push(`${snake}: ${JSON.stringify(value)}`)
    }
  }
  lines.push('---', '', body, '')
  return lines.join('\n')
}

async function commitToGithub(
  env: Env,
  entityType: string,
  entityId: string,
  op: string,
  content: string,
): Promise<void> {
  const [owner, repo] = env.GITHUB_MIRROR_REPO!.split('/')
  if (!owner || !repo) throw new Error('GITHUB_MIRROR_REPO must be owner/repo')
  const path =
    entityType === 'moment'
      ? `content/moments/${entityId}.md`
      : entityType === 'page'
        ? `content/pages/${entityId}.md`
        : `content/posts/${entityId}.md`

  if (op === 'delete') {
    await githubRequest(env, `DELETE /repos/${owner}/${repo}/contents/${path}`, {
      message: `mirror: delete ${entityType} ${entityId}`,
      content: '',
    })
    return
  }

  const encoded = btoa(unescape(encodeURIComponent(content)))
  await githubRequest(env, `PUT /repos/${owner}/${repo}/contents/${path}`, {
    message: `mirror: upsert ${entityType} ${entityId}`,
    content: encoded,
  })
}

async function githubRequest(env: Env, endpoint: string, body: Record<string, unknown>): Promise<void> {
  const [method, path] = endpoint.split(' ') as [string, string]
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'taiping-blog',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok && res.status !== 404) {
    const text = await res.text()
    throw new Error(`GitHub ${method} ${path} failed: ${res.status} ${text.slice(0, 200)}`)
  }
}
