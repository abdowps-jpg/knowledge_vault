import { randomUUID } from 'crypto';
import { and, count, desc, eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { db } from '../db';
import { savedSearches } from '../schema/saved_searches';
import { protectedProcedure, router } from '../trpc';

const MAX_PER_USER = 30;

export const savedSearchesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return db
      .select()
      .from(savedSearches)
      .where(eq(savedSearches.userId, ctx.user.id))
      .orderBy(desc(savedSearches.updatedAt));
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(80),
        query: z.string().min(1).max(500),
        filterJson: z.string().max(4000).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const [countRow] = await db
        .select({ total: count() })
        .from(savedSearches)
        .where(eq(savedSearches.userId, ctx.user.id));
      if ((countRow?.total ?? 0) >= MAX_PER_USER) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Maximum of ${MAX_PER_USER} saved searches allowed.`,
        });
      }
      const now = new Date();
      const id = randomUUID();
      await db.insert(savedSearches).values({
        id,
        userId: ctx.user.id,
        name: input.name.trim(),
        query: input.query.trim(),
        filterJson: input.filterJson ?? null,
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
        query: z.string().min(1).max(500).optional(),
        filterJson: z.string().max(4000).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...patch } = input;
      await db
        .update(savedSearches)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(eq(savedSearches.id, id), eq(savedSearches.userId, ctx.user.id)));
      return { success: true as const };
    }),

  execute: protectedProcedure
    .input(z.object({ id: z.string(), limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ input, ctx }) => {
      const rows = await db
        .select()
        .from(savedSearches)
        .where(and(eq(savedSearches.id, input.id), eq(savedSearches.userId, ctx.user.id)))
        .limit(1);
      const saved = rows[0];
      if (!saved) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Saved search not found' });
      }
      // Delegate to the search router's global hit via direct DB query
      const { items } = await import('../schema/items');
      const { and: andOp, eq: eqOp, isNull: isNullOp, desc: descOp, sql: sqlOp } = await import('drizzle-orm');
      const needle = `%${saved.query.trim().replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
      const results = await db
        .select()
        .from(items)
        .where(
          andOp(
            eqOp(items.userId, ctx.user.id),
            isNullOp(items.deletedAt),
            sqlOp`(lower(${items.title}) LIKE lower(${needle}) OR lower(coalesce(${items.content}, '')) LIKE lower(${needle}))`
          )
        )
        .orderBy(descOp(items.updatedAt))
        .limit(input.limit);
      return {
        name: saved.name,
        query: saved.query,
        results,
      };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await db
        .delete(savedSearches)
        .where(and(eq(savedSearches.id, input.id), eq(savedSearches.userId, ctx.user.id)));
      return { success: true as const };
    }),
});
