import { randomUUID } from 'crypto';
import { and, desc, eq } from 'drizzle-orm';
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

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await db.delete(reviews).where(and(eq(reviews.id, input.id), eq(reviews.userId, ctx.user.id)));
      return { success: true as const };
    }),
});
