import { randomUUID } from 'crypto';
import { and, desc, eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { db } from '../db';
import { reviews } from '../schema/reviews';
import { protectedProcedure, router } from '../trpc';

export const reviewsRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          kind: z.enum(['daily', 'weekly', 'monthly']).optional(),
          limit: z.number().int().min(1).max(100).default(30),
        })
        .optional()
    )
    .query(async ({ input, ctx }) => {
      const limit = input?.limit ?? 30;
      const where = input?.kind
        ? and(eq(reviews.userId, ctx.user.id), eq(reviews.kind, input.kind))
        : eq(reviews.userId, ctx.user.id);
      return db.select().from(reviews).where(where).orderBy(desc(reviews.createdAt)).limit(limit);
    }),

  upsert: protectedProcedure
    .input(
      z.object({
        kind: z.enum(['daily', 'weekly', 'monthly']),
        periodKey: z.string().min(4).max(20),
        wins: z.string().max(4000).optional(),
        improvements: z.string().max(4000).optional(),
        nextFocus: z.string().max(4000).optional(),
        aiSummary: z.string().max(4000).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const existing = await db
        .select()
        .from(reviews)
        .where(
          and(
            eq(reviews.userId, ctx.user.id),
            eq(reviews.kind, input.kind),
            eq(reviews.periodKey, input.periodKey)
          )
        )
        .limit(1);
      const now = new Date();
      if (existing[0]) {
        await db
          .update(reviews)
          .set({
            wins: input.wins ?? existing[0].wins,
            improvements: input.improvements ?? existing[0].improvements,
            nextFocus: input.nextFocus ?? existing[0].nextFocus,
            aiSummary: input.aiSummary ?? existing[0].aiSummary,
            updatedAt: now,
          })
          .where(eq(reviews.id, existing[0].id));
        return { id: existing[0].id, updated: true as const };
      }
      const id = randomUUID();
      await db.insert(reviews).values({
        id,
        userId: ctx.user.id,
        kind: input.kind,
        periodKey: input.periodKey,
        wins: input.wins ?? null,
        improvements: input.improvements ?? null,
        nextFocus: input.nextFocus ?? null,
        aiSummary: input.aiSummary ?? null,
        createdAt: now,
        updatedAt: now,
      });
      return { id, updated: false as const };
    }),

  periodKey: protectedProcedure
    .input(z.object({ kind: z.enum(['daily', 'weekly', 'monthly']), at: z.string().optional() }))
    .query(({ input }) => {
      const d = input.at ? new Date(input.at) : new Date();
      if (Number.isNaN(d.getTime())) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid date' });
      }
      if (input.kind === 'daily') {
        return { key: d.toISOString().slice(0, 10) };
      }
      if (input.kind === 'monthly') {
        return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` };
      }
      // weekly: ISO week approximation
      const start = new Date(d);
      const day = (start.getDay() + 6) % 7; // 0 = Monday
      start.setDate(start.getDate() - day);
      const year = start.getFullYear();
      const onejan = new Date(year, 0, 1);
      const week = Math.ceil(((start.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7);
      return { key: `${year}-W${String(week).padStart(2, '0')}` };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await db.delete(reviews).where(and(eq(reviews.id, input.id), eq(reviews.userId, ctx.user.id)));
      return { success: true as const };
    }),
});
