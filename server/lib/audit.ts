import { randomUUID } from 'crypto';
import { and, desc, eq, gte, lt } from 'drizzle-orm';
import { db } from '../db';
import { auditLog } from '../schema/audit_log';

export type AuditContext = {
  userId: string;
  ip?: string | null;
  userAgent?: string | null;
};

export async function recordAudit(
  ctx: AuditContext,
  action: string,
  resource?: { kind?: string; id?: string }
): Promise<void> {
  try {
    await db.insert(auditLog).values({
      id: randomUUID(),
      userId: ctx.userId,
      action: action.slice(0, 80),
      resource: resource?.kind?.slice(0, 60) ?? null,
      resourceId: resource?.id?.slice(0, 100) ?? null,
      ip: (ctx.ip ?? '').slice(0, 80) || null,
      userAgent: (ctx.userAgent ?? '').slice(0, 240) || null,
      createdAt: new Date(),
    });
  } catch (err) {
    console.error('[Audit] failed to record event:', err);
  }
}

export async function listAuditForUser(userId: string, limit = 100): Promise<typeof auditLog.$inferSelect[]> {
  return db
    .select()
    .from(auditLog)
    .where(eq(auditLog.userId, userId))
    .orderBy(desc(auditLog.createdAt))
    .limit(Math.min(500, Math.max(1, limit)));
}

export async function pruneAudit(olderThan: Date): Promise<void> {
  try {
    await db.delete(auditLog).where(and(lt(auditLog.createdAt, olderThan), gte(auditLog.createdAt, new Date(0))));
  } catch (err) {
    console.error('[Audit] prune failed:', err);
  }
}
