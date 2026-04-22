import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "../db";
import { habits } from "../schema/habits";
import { protectedProcedure, router } from "../trpc";

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayYmd() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export const habitsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db.select().from(habits).where(eq(habits.userId, ctx.user.id));
    const today = todayYmd();
    return rows.map((habit) => ({
      ...habit,
      doneToday: habit.lastCompletedDate === today ? true : Boolean(habit.doneToday),
    }));
  }),

  create: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(120) }))
    .mutation(async ({ ctx, input }) => {
      const habit = {
        id: randomUUID(),
        userId: ctx.user.id,
        name: input.name.trim(),
        streak: 0,
        doneToday: false,
        lastCompletedDate: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await db.insert(habits).values(habit);
      return habit;
    }),

  toggleToday: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const rows = await db
        .select()
        .from(habits)
        .where(and(eq(habits.id, input.id), eq(habits.userId, ctx.user.id)))
        .limit(1);
      if (rows.length === 0) return { success: false as const };

      const current = rows[0];
      const today = todayYmd();
      const yesterday = yesterdayYmd();
      const alreadyDoneToday = current.lastCompletedDate === today || current.doneToday;

      if (alreadyDoneToday) {
        // Undo today: revert lastCompletedDate so list no longer shows doneToday, and
        // decrement streak since today's completion is being removed.
        const revertedStreak = Math.max(0, current.streak - 1);
        await db
          .update(habits)
          .set({
            doneToday: false,
            lastCompletedDate: revertedStreak > 0 ? yesterday : null,
            streak: revertedStreak,
            updatedAt: new Date(),
          })
          .where(eq(habits.id, current.id));
        return { success: true as const, doneToday: false, streak: revertedStreak };
      }

      const nextStreak = current.lastCompletedDate === yesterday ? current.streak + 1 : 1;
      await db
        .update(habits)
        .set({
          doneToday: true,
          streak: nextStreak,
          lastCompletedDate: today,
          updatedAt: new Date(),
        })
        .where(eq(habits.id, current.id));

      return { success: true as const, doneToday: true, streak: nextStreak };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(habits).where(and(eq(habits.id, input.id), eq(habits.userId, ctx.user.id)));
      return { success: true as const };
    }),

  bulkCompleteToday: protectedProcedure.mutation(async ({ ctx }) => {
    const today = todayYmd();
    const yesterday = yesterdayYmd();
    const rows = await db
      .select()
      .from(habits)
      .where(and(eq(habits.userId, ctx.user.id), eq(habits.doneToday, false)));
    let updated = 0;
    for (const h of rows) {
      const nextStreak = h.lastCompletedDate === yesterday ? (h.streak ?? 0) + 1 : 1;
      await db
        .update(habits)
        .set({
          doneToday: true,
          streak: nextStreak,
          lastCompletedDate: today,
          updatedAt: new Date(),
        })
        .where(eq(habits.id, h.id));
      updated += 1;
    }
    return { success: true as const, updated };
  }),

  summary: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db.select().from(habits).where(eq(habits.userId, ctx.user.id));
    const activeStreaks = rows.filter((h) => (h.streak ?? 0) > 0).length;
    const stalled = rows.filter((h) => !h.doneToday && (h.streak ?? 0) > 0).length;
    const idle = rows.filter((h) => (h.streak ?? 0) === 0 && !h.doneToday).length;
    return {
      total: rows.length,
      activeStreaks,
      stalled,
      idle,
      doneToday: rows.filter((h) => h.doneToday).length,
    };
  }),

  completionRate: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db.select().from(habits).where(eq(habits.userId, ctx.user.id));
    if (rows.length === 0) {
      return { overall: 0, perHabit: [] as { id: string; name: string; streak: number; doneToday: boolean }[] };
    }
    // Simple heuristic: completion rate is ratio of habits with streak > 0 to total
    const active = rows.filter((h) => (h.streak ?? 0) > 0).length;
    return {
      overall: Math.round((active / rows.length) * 100),
      perHabit: rows.map((h) => ({
        id: h.id,
        name: h.name,
        streak: h.streak ?? 0,
        doneToday: Boolean(h.doneToday),
      })),
    };
  }),

  stats: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db.select().from(habits).where(eq(habits.userId, ctx.user.id));
    const total = rows.length;
    const doneToday = rows.filter((h) => h.doneToday).length;
    const longestStreak = rows.reduce((max, h) => Math.max(max, h.streak ?? 0), 0);
    const averageStreak =
      total > 0 ? Number((rows.reduce((sum, h) => sum + (h.streak ?? 0), 0) / total).toFixed(1)) : 0;
    const topStreaks = rows
      .slice()
      .sort((a, b) => (b.streak ?? 0) - (a.streak ?? 0))
      .slice(0, 5)
      .map((h) => ({ id: h.id, name: h.name, streak: h.streak ?? 0 }));
    return {
      total,
      doneToday,
      longestStreak,
      averageStreak,
      topStreaks,
    };
  }),
});
