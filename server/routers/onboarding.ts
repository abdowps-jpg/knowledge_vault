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

const STEP_META: Record<(typeof ALL_STEPS)[number], { title: string; description: string; icon: string }> = {
  welcome: { title: 'Welcome to Knowledge Vault', description: 'Explore the main tabs and settings.', icon: 'waving_hand' },
  firstItem: { title: 'Save your first item', description: 'Write a note, save a link, or clip a quote.', icon: 'bookmark_add' },
  firstTask: { title: 'Create your first task', description: 'Something actionable with a due date.', icon: 'check_circle' },
  firstJournal: { title: 'Write a journal entry', description: 'A short daily reflection.', icon: 'edit_note' },
  firstHabit: { title: 'Track a habit', description: 'Pick one small daily habit to start.', icon: 'local_fire_department' },
  enablePush: { title: 'Enable push notifications', description: 'Stay on top of mentions and reminders.', icon: 'notifications_active' },
  tryAI: { title: 'Try an AI feature', description: 'Summarize, suggest tags, or ask your vault a question.', icon: 'auto_awesome' },
};

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

  checklist: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db.select().from(onboarding).where(eq(onboarding.userId, ctx.user.id)).limit(1);
    const completed = new Set(rows[0] ? rows[0].completedSteps.split(',').filter(Boolean) : []);
    return ALL_STEPS.map((step) => ({
      step,
      done: completed.has(step),
      ...STEP_META[step],
    }));
  }),

  nextStep: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db.select().from(onboarding).where(eq(onboarding.userId, ctx.user.id)).limit(1);
    const completed = rows[0] ? rows[0].completedSteps.split(',').filter(Boolean) : [];
    const next = ALL_STEPS.find((s) => !completed.includes(s));
    return {
      nextStep: next ?? null,
      completedCount: completed.length,
      totalCount: ALL_STEPS.length,
      percent: Math.round((completed.length / ALL_STEPS.length) * 100),
      isDone: next === undefined,
    };
  }),

  reset: protectedProcedure.mutation(async ({ ctx }) => {
    await db.delete(onboarding).where(eq(onboarding.userId, ctx.user.id));
    return { success: true as const };
  }),
});
