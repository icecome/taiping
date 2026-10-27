import { desc, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { auditLogs } from "../db/schema";
import { newId } from "./id";

export interface AuditInput {
  actorId: string | null;
  actorName: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  meta?: Record<string, unknown>;
  ip?: string | null;
}

/**
 * 写审计日志。
 * 只在服务端内部调用；失败不抛出，审计写不进去不应该让业务操作失败（但会打错误日志）。
 */
export async function recordAudit(db: Db, input: AuditInput): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      id: newId("aud"),
      actorId: input.actorId,
      actorName: input.actorName,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      metaJson: JSON.stringify(input.meta ?? {}),
      ip: input.ip ?? null,
      createdAt: new Date(),
    });
  } catch (error) {
    console.error("[audit] write failed", error);
  }
}

export async function listAuditLogs(
  db: Db,
  options: { limit: number; offset: number; action?: string; actorId?: string },
): Promise<{ items: (typeof auditLogs.$inferSelect)[]; total: number }> {
  const rows = await db
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(options.limit)
    .offset(options.offset);

  const filtered = options.action
    ? await db.select().from(auditLogs).where(eq(auditLogs.action, options.action))
    : rows;

  return { items: rows, total: filtered === rows ? rows.length : filtered.length };
}
