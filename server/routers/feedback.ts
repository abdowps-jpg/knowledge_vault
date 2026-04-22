import { randomUUID } from 'crypto';
import { and, desc, eq, gte } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { db } from '../db';
import { feedback } from '../schema/feedback';
import { protectedProcedure, router } from '../trpc';

const RATE_WINDOW_MS = 60 * 60_000;
const MAX_PER_WINDOW = 10;

export const feedbackRouter = router({
  submit: protectedProcedure
    .input(
      z.object({
        kind: z.enum(['bug', 'idea', 'praise', 'other']),
        subject: z.string().min(1).max(120),
        body: z.string().min(1).max(4000),
        appVersion: z.string().max(40).optional(),
        platform: z.string().max(40).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const cutoff = new Date(Date.now() - RATE_WINDOW_MS);
      const recent = await db
        .select()
        .from(feedback)
        .where(and(eq(feedback.userId, ctx.user.id), gte(feedback.createdAt, cutoff)));
      if (recent.length >= MAX_PER_WINDOW) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Too much feedback too quickly. Try again later.',
        });
      }
      const id = randomUUID();
      await db.insert(feedback).values({
        id,
        userId: ctx.user.id,
        kind: input.kind,
        subject: input.subject.trim(),
        body: input.body.trim(),
        appVersion: input.appVersion ?? null,
        platform: input.platform ?? null,
        createdAt: new Date(),
      });
      return { success: true as const, id };
    }),

  summary: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db.select().from(feedback).where(eq(feedback.userId, ctx.user.id));
    const byKind = new Map<string, number>();
    for (const r of rows) {
      byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + 1);
    }
    return {
      total: rows.length,
      byKind: Array.from(byKind.entries()).map(([kind, count]) => ({ kind, count })),
    };
  }),

  listMine: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(30) }).optional())
    .query(async ({ input, ctx }) => {
      return db
        .select()
        .from(feedback)
        .where(eq(feedback.userId, ctx.user.id))
        .orderBy(desc(feedback.createdAt))
        .limit(input?.limit ?? 30);
    }),
});
