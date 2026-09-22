import type { D1Database } from '@cloudflare/workers-types'
import type { MirrorEntityType, MirrorOp } from '@taiping/content-model/mirror'
import { createId } from '@taiping/shared-utils'

export async function enqueueMirror(
  db: D1Database,
  entityType: MirrorEntityType,
  entityId: string,
  op: MirrorOp,
): Promise<string> {
  const id = createId('mq')
  await db
    .prepare(
      `INSERT INTO mirror_queue (id, entity_type, entity_id, op, status, retry_count, created_at)
       VALUES (?, ?, ?, ?, 'pending', 0, ?)`,
    )
    .bind(id, entityType, entityId, op, new Date().toISOString())
    .run()
  return id
}

export async function getMirrorSummary(db: D1Database) {
  const rows = await db
    .prepare(
      `SELECT status, COUNT(*) as count FROM mirror_queue GROUP BY status`,
    )
    .all<{ status: string; count: number }>()
  const summary = { pending: 0, processing: 0, failed: 0, done: 0 }
  for (const row of rows.results) {
    const key = row.status as keyof typeof summary
    if (key in summary) summary[key] = Number(row.count)
  }
  return summary
}
