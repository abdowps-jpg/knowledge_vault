import { randomUUID } from 'crypto';
import { and, asc, eq, inArray, lte } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { db } from '../db';
import { flashcards } from '../schema/flashcards';
import { protectedProcedure, router } from '../trpc';

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// SM-2 lite: quality 0=fail, 3=hard, 4=good, 5=easy
function updateScheduling(prev: { ease: number; interval: number; repetitions: number }, quality: number) {
  let { ease, interval, repetitions } = prev;
  if (quality < 3) {
    repetitions = 0;
    interval = 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) interval = 1;
    else if (repetitions === 2) interval = 6;
    else interval = Math.round(interval * ease);
  }
  ease = Math.max(1.3, ease + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  return { ease, interval, repetitions };
}

export const flashcardsRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        question: z.string().min(1).max(500),
        answer: z.string().min(1).max(2000),
        itemId: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const id = randomUUID();
      const now = new Date();
      await db.insert(flashcards).values({
        id,
        userId: ctx.user.id,
        itemId: input.itemId ?? null,
        question: input.question.trim(),
        answer: input.answer.trim(),
        ease: 2.5,
        interval: 1,
        repetitions: 0,
        nextReviewDate: todayYmd(),
        lastReviewedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      return { success: true as const, id };
    }),

  createMany: protectedProcedure
    .input(
      z.object({
        itemId: z.string().optional(),
        cards: z
          .array(z.object({ question: z.string().min(1).max(500), answer: z.string().min(1).max(2000) }))
          .min(1)
          .max(20),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const now = new Date();
      const today = todayYmd();
      const rows = input.cards.map((c) => ({
        id: randomUUID(),
        userId: ctx.user.id,
        itemId: input.itemId ?? null,
        question: c.question.trim(),
        answer: c.answer.trim(),
        ease: 2.5,
        interval: 1,
        repetitions: 0,
        nextReviewDate: today,
        lastReviewedAt: null,
        createdAt: now,
        updatedAt: now,
      }));
      await db.insert(flashcards).values(rows);
      return { success: true as const, created: rows.length, ids: rows.map((r) => r.id) };
    }),

  dueToday: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(30) }).optional())
    .query(async ({ input, ctx }) => {
      const today = todayYmd();
      return db
        .select()
        .from(flashcards)
        .where(and(eq(flashcards.userId, ctx.user.id), lte(flashcards.nextReviewDate, today)))
        .orderBy(asc(flashcards.nextReviewDate))
        .limit(input?.limit ?? 30);
    }),

  review: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        quality: z.number().int().min(0).max(5),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const rows = await db
        .select()
        .from(flashcards)
        .where(and(eq(flashcards.id, input.id), eq(flashcards.userId, ctx.user.id)))
        .limit(1);
      const card = rows[0];
      if (!card) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Card not found' });
      }
      const next = updateScheduling(
        { ease: card.ease, interval: card.interval, repetitions: card.repetitions },
        input.quality
      );
      const nextDate = addDays(todayYmd(), next.interval);
      await db
        .update(flashcards)
        .set({
          ease: next.ease,
          interval: next.interval,
          repetitions: next.repetitions,
          nextReviewDate: nextDate,
          lastReviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(flashcards.id, input.id));
      return {
        success: true as const,
        nextReviewDate: nextDate,
        intervalDays: next.interval,
        ease: next.ease,
      };
    }),

  list: protectedProcedure
    .input(
      z.object({ limit: z.number().int().min(1).max(200).default(100), itemId: z.string().optional() }).optional()
    )
    .query(async ({ input, ctx }) => {
      const where = input?.itemId
        ? and(eq(flashcards.userId, ctx.user.id), eq(flashcards.itemId, input.itemId))
        : eq(flashcards.userId, ctx.user.id);
      return db.select().from(flashcards).where(where).orderBy(asc(flashcards.nextReviewDate)).limit(input?.limit ?? 100);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await db.delete(flashcards).where(and(eq(flashcards.id, input.id), eq(flashcards.userId, ctx.user.id)));
      return { success: true as const };
    }),

  deleteMany: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).min(1).max(200) }))
    .mutation(async ({ input, ctx }) => {
      await db
        .delete(flashcards)
        .where(and(inArray(flashcards.id, input.ids), eq(flashcards.userId, ctx.user.id)));
      return { success: true as const, deleted: input.ids.length };
    }),

  stats: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db.select().from(flashcards).where(eq(flashcards.userId, ctx.user.id));
    const today = todayYmd();
    const due = rows.filter((r) => r.nextReviewDate <= today).length;
    const mature = rows.filter((r) => r.interval >= 21).length;
    return {
      total: rows.length,
      due,
      mature,
      learning: rows.length - mature,
      averageEase: rows.length > 0
        ? Number((rows.reduce((s, r) => s + r.ease, 0) / rows.length).toFixed(2))
        : 0,
    };
  }),
});
