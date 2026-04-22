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
  snoozeUntil: null as Date | null,
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

  byType: protectedProcedure
    .input(z.object({ type: z.string().min(1).max(40), limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ input, ctx }) => {
      return db
        .select()
        .from(userNotifications)
        .where(and(eq(userNotifications.userId, ctx.user.id), eq(userNotifications.type, input.type)))
        .orderBy(desc(userNotifications.createdAt))
        .limit(input.limit);
    }),

  realtimeStatus: protectedProcedure.query(async ({ ctx }) => {
    const { connectedClientCount, listConnectedUsers } = await import('../lib/realtime');
    const connectedUsers = listConnectedUsers();
    return {
      totalConnections: connectedClientCount(),
      self: { connected: connectedUsers.includes(ctx.user.id) },
    };
  }),

  previewLatest: protectedProcedure.query(async ({ ctx }) => {
    return db
      .select()
      .from(userNotifications)
      .where(eq(userNotifications.userId, ctx.user.id))
      .orderBy(desc(userNotifications.createdAt))
      .limit(5);
  }),

  digest: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select()
      .from(userNotifications)
      .where(and(eq(userNotifications.userId, ctx.user.id), eq(userNotifications.isRead, false)));
    const byType = new Map<string, number>();
    for (const r of rows) {
      byType.set(r.type, (byType.get(r.type) ?? 0) + 1);
    }
    return {
      unreadTotal: rows.length,
      byType: Array.from(byType.entries()).map(([type, count]) => ({ type, count })),
      oldest: rows
        .slice()
        .sort((a, b) =>
          (a.createdAt ? new Date(a.createdAt).getTime() : 0) -
          (b.createdAt ? new Date(b.createdAt).getTime() : 0)
        )[0] ?? null,
    };
  }),

  snoozeAll: protectedProcedure
    .input(z.object({ minutes: z.number().int().min(15).max(24 * 60) }))
    .mutation(async ({ input, ctx }) => {
      const until = new Date(Date.now() + input.minutes * 60 * 1000);
      const existing = await db
        .select()
        .from(notificationPrefs)
        .where(eq(notificationPrefs.userId, ctx.user.id))
        .limit(1);
      const now = new Date();
      if (existing.length > 0) {
        await db
          .update(notificationPrefs)
          .set({ snoozeUntil: until, updatedAt: now })
          .where(eq(notificationPrefs.userId, ctx.user.id));
      } else {
        await db.insert(notificationPrefs).values({
          userId: ctx.user.id,
          ...DEFAULT_PREFS,
          snoozeUntil: until,
          updatedAt: now,
        });
      }
      return { success: true as const, until: until.toISOString() };
    }),

  unsnooze: protectedProcedure.mutation(async ({ ctx }) => {
    await db
      .update(notificationPrefs)
      .set({ snoozeUntil: null, updatedAt: new Date() })
      .where(eq(notificationPrefs.userId, ctx.user.id));
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
