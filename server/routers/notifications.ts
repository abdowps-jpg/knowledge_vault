import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { notificationPrefs } from '../schema/notification_prefs';
import { userNotifications } from '../schema/user_notifications';
import { protectedProcedure, router } from '../trpc';

const DEFAULT_PREFS = {
  mentionEnabled: true,
  itemCommentEnabled: true,
  itemSharedEnabled: true,
  taskDueEnabled: true,
  quietStartMinutes: null as number | null,
  quietEndMinutes: null as number | null,
};

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

  bulkMarkRead: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).min(1).max(200) }))
    .mutation(async ({ input, ctx }) => {
      await db
        .update(userNotifications)
        .set({ isRead: true })
        .where(
          and(
            eq(userNotifications.userId, ctx.user.id),
            inArray(userNotifications.id, input.ids)
          )
        );
      return { success: true as const, marked: input.ids.length };
    }),

  getPrefs: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select()
      .from(notificationPrefs)
      .where(eq(notificationPrefs.userId, ctx.user.id))
      .limit(1);
    return rows[0] ?? { userId: ctx.user.id, ...DEFAULT_PREFS, updatedAt: new Date() };
  }),

  updatePrefs: protectedProcedure
    .input(
      z.object({
        mentionEnabled: z.boolean().optional(),
        itemCommentEnabled: z.boolean().optional(),
        itemSharedEnabled: z.boolean().optional(),
        taskDueEnabled: z.boolean().optional(),
        quietStartMinutes: z.number().int().min(0).max(1439).nullable().optional(),
        quietEndMinutes: z.number().int().min(0).max(1439).nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const existing = await db
        .select()
        .from(notificationPrefs)
        .where(eq(notificationPrefs.userId, ctx.user.id))
        .limit(1);
      const now = new Date();
      if (existing.length > 0) {
        await db
          .update(notificationPrefs)
          .set({ ...input, updatedAt: now })
          .where(eq(notificationPrefs.userId, ctx.user.id));
      } else {
        await db.insert(notificationPrefs).values({
          userId: ctx.user.id,
          ...DEFAULT_PREFS,
          ...input,
          updatedAt: now,
        });
      }
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
