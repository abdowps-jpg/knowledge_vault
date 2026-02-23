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
        await db
          .update(habits)
          .set({
            doneToday: false,
            updatedAt: new Date(),
          })
          .where(eq(habits.id, current.id));
        return { success: true as const, doneToday: false, streak: current.streak };
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
});
