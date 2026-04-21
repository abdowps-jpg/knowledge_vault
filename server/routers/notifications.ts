import { and, count, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { userNotifications } from '../schema/user_notifications';
import { protectedProcedure, router } from '../trpc';

export const notificationsRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).default(30),
          unreadOnly: z.boolean().default(false),
        })
        .optional()
    )
    .query(async ({ input, ctx }) => {
      const limit = input?.limit ?? 30;
      const unreadOnly = input?.unreadOnly ?? false;
      const where = unreadOnly
        ? and(eq(userNotifications.userId, ctx.user.id), eq(userNotifications.isRead, false))
        : eq(userNotifications.userId, ctx.user.id);
      const rows = await db
        .select()
        .from(userNotifications)
        .where(where)
        .orderBy(desc(userNotifications.createdAt))
        .limit(limit);
      return rows;
    }),

  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await db
      .select({ total: count() })
      .from(userNotifications)
      .where(and(eq(userNotifications.userId, ctx.user.id), eq(userNotifications.isRead, false)));
    return { count: row?.total ?? 0 };
  }),

  markRead: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await db
        .update(userNotifications)
        .set({ isRead: true })
        .where(and(eq(userNotifications.id, input.id), eq(userNotifications.userId, ctx.user.id)));
      return { success: true as const };
    }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    await db
      .update(userNotifications)
      .set({ isRead: true })
      .where(and(eq(userNotifications.userId, ctx.user.id), eq(userNotifications.isRead, false)));
    return { success: true as const };
  }),
});
