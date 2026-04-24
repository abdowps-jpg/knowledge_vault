import { and, count, desc, eq, gte, isNull, like, or, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { db } from '../db';
import { attachments } from '../schema/attachments';
import { auditLog } from '../schema/audit_log';
import { feedback } from '../schema/feedback';
import { items } from '../schema/items';
import { journal } from '../schema/journal';
import { tasks } from '../schema/tasks';
import { users } from '../schema/users';
import { webhookSubscriptions } from '../schema/api_keys';
import { protectedProcedure, router } from '../trpc';

/**
 * Turn a list of `{ createdAt, ... }` rows into a 30-slot array counting
 * occurrences per calendar day ending today. Slot 0 is 29 days ago, slot
 * 29 is today. Days with no activity stay at 0.
 */
function bucketBy30Days(rows: Array<{ createdAt: Date | null }>): number[] {
  const buckets = new Array<number>(30).fill(0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startMs = today.getTime() - 29 * 86400_000;
  for (const row of rows) {
    if (!row.createdAt) continue;
    const rowDay = new Date(row.createdAt);
    rowDay.setHours(0, 0, 0, 0);
    const offset = Math.floor((rowDay.getTime() - startMs) / 86400_000);
    if (offset >= 0 && offset < 30) {
      buckets[offset] += 1;
    }
  }
  return buckets;
}

/**
 * Distinct users per day across the last 30 days — treating any audit_log
 * entry as evidence of activity. Same slot semantics as `bucketBy30Days`.
 */
function dauBuckets(rows: Array<{ userId: string; createdAt: Date | null }>): number[] {
  const perDay = Array.from({ length: 30 }, () => new Set<string>());
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startMs = today.getTime() - 29 * 86400_000;
  for (const row of rows) {
    if (!row.createdAt) continue;
    const rowDay = new Date(row.createdAt);
    rowDay.setHours(0, 0, 0, 0);
    const offset = Math.floor((rowDay.getTime() - startMs) / 86400_000);
    if (offset >= 0 && offset < 30) {
      perDay[offset].add(row.userId);
    }
  }
  return perDay.map((s) => s.size);
}

async function requireAdmin(userId: string) {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = rows[0];
  if (!user?.isAdmin) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin privileges required' });
  }
  return user;
}

export const adminRouter = router({
  whoami: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
    return { isAdmin: Boolean(rows[0]?.isAdmin) };
  }),

  systemStats: protectedProcedure.query(async ({ ctx }) => {
    await requireAdmin(ctx.user.id);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [userCount] = await db.select({ total: count() }).from(users);
    const [activeUsers] = await db.select({ total: count() }).from(users).where(eq(users.isActive, true));
    const [newUsersWeek] = await db
      .select({ total: count() })
      .from(users)
      .where(gte(users.createdAt, weekAgo));
    const [itemCount] = await db.select({ total: count() }).from(items).where(isNull(items.deletedAt));
    const [taskCount] = await db.select({ total: count() }).from(tasks).where(isNull(tasks.deletedAt));
    const [journalCount] = await db.select({ total: count() }).from(journal).where(isNull(journal.deletedAt));
    const [feedbackCount] = await db.select({ total: count() }).from(feedback);
    return {
      users: {
        total: userCount?.total ?? 0,
        active: activeUsers?.total ?? 0,
        newThisWeek: newUsersWeek?.total ?? 0,
      },
      content: {
        items: itemCount?.total ?? 0,
        tasks: taskCount?.total ?? 0,
        journal: journalCount?.total ?? 0,
      },
      feedback: feedbackCount?.total ?? 0,
      serverUptimeSeconds: Math.round(process.uptime()),
    };
  }),

  listUsers: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(50) }).optional())
    .query(async ({ ctx, input }) => {
      await requireAdmin(ctx.user.id);
      return db
        .select({
          id: users.id,
          email: users.email,
          username: users.username,
          isActive: users.isActive,
          isAdmin: users.isAdmin,
          emailVerified: users.emailVerified,
          createdAt: users.createdAt,
        })
        .from(users)
        .orderBy(desc(users.createdAt))
        .limit(input?.limit ?? 50);
    }),

  setUserActive: protectedProcedure
    .input(z.object({ userId: z.string(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx.user.id);
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Admins cannot deactivate themselves' });
      }
      await db.update(users).set({ isActive: input.isActive, updatedAt: new Date() }).where(eq(users.id, input.userId));
      return { success: true as const };
    }),

  grantAdmin: protectedProcedure
    .input(z.object({ userId: z.string(), isAdmin: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx.user.id);
      if (input.userId === ctx.user.id && !input.isAdmin) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Admins cannot revoke their own admin role' });
      }
      await db.update(users).set({ isAdmin: input.isAdmin, updatedAt: new Date() }).where(eq(users.id, input.userId));
      return { success: true as const };
    }),

  listFeedback: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).default(50) }).optional())
    .query(async ({ ctx, input }) => {
      await requireAdmin(ctx.user.id);
      return db.select().from(feedback).orderBy(desc(feedback.createdAt)).limit(input?.limit ?? 50);
    }),

  markFeedbackAddressed: protectedProcedure
    .input(z.object({ id: z.string(), note: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx.user.id);
      const rows = await db
        .select({ id: feedback.id })
        .from(feedback)
        .where(eq(feedback.id, input.id))
        .limit(1);
      if (rows.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Feedback not found' });
      }
      await db
        .update(feedback)
        .set({ addressedAt: new Date(), addressedNote: input.note?.trim() || null })
        .where(eq(feedback.id, input.id));
      return { success: true as const };
    }),

  recentAuditEvents: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(500).default(100) }).optional())
    .query(async ({ ctx, input }) => {
      await requireAdmin(ctx.user.id);
      return db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(input?.limit ?? 100);
    }),

  userUsage: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireAdmin(ctx.user.id);

      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000);

      const aiRows = await db
        .select({ createdAt: auditLog.createdAt })
        .from(auditLog)
        .where(
          and(
            eq(auditLog.userId, input.userId),
            like(auditLog.action, 'ai.%'),
            gte(auditLog.createdAt, thirtyDaysAgo)
          )
        );

      const [itemCountRow] = await db
        .select({ total: count() })
        .from(items)
        .where(and(eq(items.userId, input.userId), isNull(items.deletedAt)));

      const [taskCountRow] = await db
        .select({ total: count() })
        .from(tasks)
        .where(and(eq(tasks.userId, input.userId), isNull(tasks.deletedAt)));

      // Storage for this user = sum(attachment.file_size) for attachments
      // attached to items the user owns. Journal attachments would need a
      // separate join; left out intentionally.
      const [storageRow] = await db
        .select({
          bytes: sql<number>`COALESCE(SUM(${attachments.fileSize}), 0)`,
        })
        .from(attachments)
        .innerJoin(items, eq(items.id, attachments.itemId))
        .where(eq(items.userId, input.userId));

      return {
        aiCalls30d: bucketBy30Days(aiRows),
        storageBytes: Number(storageRow?.bytes ?? 0),
        itemsCount: itemCountRow?.total ?? 0,
        tasksCount: taskCountRow?.total ?? 0,
      };
    }),

  systemTrends: protectedProcedure.query(async ({ ctx }) => {
    await requireAdmin(ctx.user.id);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000);

    const signupRows = await db
      .select({ createdAt: users.createdAt })
      .from(users)
      .where(gte(users.createdAt, thirtyDaysAgo));

    const activityRows = await db
      .select({ userId: auditLog.userId, createdAt: auditLog.createdAt })
      .from(auditLog)
      .where(gte(auditLog.createdAt, thirtyDaysAgo));

    return {
      signups30d: bucketBy30Days(signupRows),
      dau30d: dauBuckets(activityRows),
    };
  }),

  failedWebhooks: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).default(50) }).optional())
    .query(async ({ ctx, input }) => {
      await requireAdmin(ctx.user.id);
      const rows = await db
        .select()
        .from(webhookSubscriptions)
        .where(
          or(
            sql`${webhookSubscriptions.failureCount} > 0`,
            sql`${webhookSubscriptions.lastStatus} >= 400`
          )
        )
        .orderBy(desc(webhookSubscriptions.lastDeliveredAt))
        .limit(input?.limit ?? 50);
      return rows;
    }),
});

export { requireAdmin };
