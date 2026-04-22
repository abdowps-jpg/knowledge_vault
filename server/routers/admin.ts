import { and, count, desc, eq, gte, isNull } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { db } from '../db';
import { auditLog } from '../schema/audit_log';
import { feedback } from '../schema/feedback';
import { items } from '../schema/items';
import { journal } from '../schema/journal';
import { tasks } from '../schema/tasks';
import { users } from '../schema/users';
import { protectedProcedure, router } from '../trpc';

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

  recentAuditEvents: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(500).default(100) }).optional())
    .query(async ({ ctx, input }) => {
      await requireAdmin(ctx.user.id);
      return db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(input?.limit ?? 100);
    }),
});

export { requireAdmin };
