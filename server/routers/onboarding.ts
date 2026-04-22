import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { onboarding } from '../schema/onboarding';
import { protectedProcedure, router } from '../trpc';

const ALL_STEPS = [
  'welcome',
  'firstItem',
  'firstTask',
  'firstJournal',
  'firstHabit',
  'enablePush',
  'tryAI',
] as const;

export const onboardingRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db.select().from(onboarding).where(eq(onboarding.userId, ctx.user.id)).limit(1);
    const record = rows[0];
    const completedSteps = record ? record.completedSteps.split(',').filter(Boolean) : [];
    return {
      completedSteps,
      allSteps: ALL_STEPS,
      completed: Boolean(record?.completedAt),
      progress: completedSteps.length / ALL_STEPS.length,
    };
  }),

  markStep: protectedProcedure
    .input(z.object({ step: z.string().min(1).max(40) }))
    .mutation(async ({ input, ctx }) => {
      const rows = await db.select().from(onboarding).where(eq(onboarding.userId, ctx.user.id)).limit(1);
      const now = new Date();
      const prev = rows[0];
      const current = prev ? prev.completedSteps.split(',').filter(Boolean) : [];
      if (!current.includes(input.step)) current.push(input.step);
      const allDone = ALL_STEPS.every((s) => current.includes(s));
      const completedSteps = current.join(',');
      if (prev) {
        await db
          .update(onboarding)
          .set({
            completedSteps,
            completedAt: allDone ? now : prev.completedAt ?? null,
            updatedAt: now,
          })
          .where(eq(onboarding.userId, ctx.user.id));
      } else {
        await db.insert(onboarding).values({
          userId: ctx.user.id,
          completedSteps,
          completedAt: allDone ? now : null,
          updatedAt: now,
        });
      }
      return { success: true as const, completed: allDone };
    }),

  reset: protectedProcedure.mutation(async ({ ctx }) => {
    await db.delete(onboarding).where(eq(onboarding.userId, ctx.user.id));
    return { success: true as const };
  }),
});
