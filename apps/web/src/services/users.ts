import type { SessionUser } from '../env'
import { hashPassword, verifyPassword } from '../lib/crypto'
import { nowIso } from '@taiping/shared-utils'

type UserRow = {
  id: number
  name: string
  email: string
  password_hash: string
  display_name: string
  role: string
  created_at: string
  last_login_at: string | null
}

function rowToSession(row: UserRow): SessionUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    displayName: row.display_name || row.name,
    role: row.role as SessionUser['role'],
  }
}

export async function findUserByName(db: D1Database, name: string): Promise<UserRow | null> {
  return db.prepare(`SELECT * FROM users WHERE name = ?`).bind(name).first<UserRow>()
}

export async function verifyLogin(db: D1Database, name: string, password: string): Promise<SessionUser | null> {
  const row = await findUserByName(db, name)
  if (!row) return null
  if (!await verifyPassword(password, row.password_hash)) return null
  await db.prepare(`UPDATE users SET last_login_at = ? WHERE id = ?`).bind(nowIso(), row.id).run()
  return rowToSession(row)
}

export async function createUser(
  db: D1Database,
  input: { name: string; email: string; password: string; role?: SessionUser['role'] },
): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO users (name, email, password_hash, display_name, url, avatar, role, created_at)
       VALUES (?, ?, ?, ?, '', '', ?, ?)`,
    )
    .bind(
      input.name,
      input.email,
      await hashPassword(input.password),
      input.name,
      input.role || 'admin',
      nowIso(),
    )
    .run()
  return Number(result.meta.last_row_id)
}

export async function countUsers(db: D1Database): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) AS c FROM users`).first<{ c: number }>()
  return row?.c ?? 0
}
