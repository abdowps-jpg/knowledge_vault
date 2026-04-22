import { randomUUID } from 'crypto';
import { and, count, desc, eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { db } from '../db';
import { templates } from '../schema/templates';
import { protectedProcedure, router } from '../trpc';

const MAX_PER_USER = 50;

export const templatesRouter = router({
  list: protectedProcedure
    .input(z.object({ kind: z.enum(['item', 'task', 'journal']).optional() }).optional())
    .query(async ({ input, ctx }) => {
      const kind = input?.kind;
      const where = kind
        ? and(eq(templates.userId, ctx.user.id), eq(templates.kind, kind))
        : eq(templates.userId, ctx.user.id);
      return db.select().from(templates).where(where).orderBy(desc(templates.updatedAt));
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(80),
        kind: z.enum(['item', 'task', 'journal']),
        body: z.string().min(1).max(20_000),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const [countRow] = await db
        .select({ total: count() })
        .from(templates)
        .where(eq(templates.userId, ctx.user.id));
      if ((countRow?.total ?? 0) >= MAX_PER_USER) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Maximum of ${MAX_PER_USER} templates allowed.`,
        });
      }
      const now = new Date();
      const id = randomUUID();
      await db.insert(templates).values({
        id,
        userId: ctx.user.id,
        name: input.name.trim(),
        kind: input.kind,
        body: input.body,
        createdAt: now,
        updatedAt: now,
      });
      return { success: true as const, id };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(80).optional(),
        body: z.string().min(1).max(20_000).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...patch } = input;
      await db
        .update(templates)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(eq(templates.id, id), eq(templates.userId, ctx.user.id)));
      return { success: true as const };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await db
        .delete(templates)
        .where(and(eq(templates.id, input.id), eq(templates.userId, ctx.user.id)));
      return { success: true as const };
    }),
});
