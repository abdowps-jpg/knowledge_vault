import { randomUUID } from 'crypto';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { db } from '../db';
import { journal } from '../schema/journal';
import { protectedProcedure, router } from '../trpc';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

export const journalRouter = router({
  // List entries filtered by optional date range, newest first
  list: protectedProcedure
    .input(
      z.object({
        startDate: dateString.optional(),
        endDate: dateString.optional(),
        limit: z.number().min(1).max(100).default(25),
        cursor: z.number().int().min(0).optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      try {
        const cursor = input.cursor ?? 0;
        const conditions = [eq(journal.userId, ctx.user.id)];

        if (input.startDate) {
          conditions.push(gte(journal.entryDate, input.startDate));
        }

        if (input.endDate) {
          conditions.push(lte(journal.entryDate, input.endDate));
        }

        const result = await db
          .select()
          .from(journal)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(journal.entryDate), desc(journal.createdAt))
          .limit(input.limit + 1)
          .offset(cursor);

        const safeResult = result || [];
        const hasMore = safeResult.length > input.limit;
        const pageItems = hasMore ? safeResult.slice(0, input.limit) : safeResult;

        const payload = {
          items: pageItems,
          nextCursor: hasMore ? cursor + input.limit : undefined,
        };
        console.log('[Journal/List] user:', ctx.user.id, 'count:', payload.items.length, 'range:', input.startDate, input.endDate);
        return payload;
      } catch (error) {
        console.error('Error fetching journal entries:', error);
        return { items: [], nextCursor: undefined };
      }
    }),

  // Create journal entry
  create: protectedProcedure
    .input(
      z.object({
        entryDate: dateString,
        title: z.string().nullable().optional(),
        content: z.string().min(1),
        mood: z.string().nullable().optional(),
        location: z.string().nullable().optional(),
        weather: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        console.log('[Journal/Create] input:', input, 'user:', ctx.user.id);
        const newEntry = {
          id: randomUUID(),
          userId: ctx.user.id,
          entryDate: input.entryDate,
          title: input.title ?? null,
          content: input.content,
          mood: input.mood ?? null,
          location: input.location ?? null,
          weather: input.weather ?? null,
          isLocked: false,
        };

        await db.insert(journal).values(newEntry);
        console.log('[Journal/Create] created id:', newEntry.id);
        return newEntry;
      } catch (error) {
        console.error('Error creating journal entry:', error);
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create journal entry' });
      }
    }),

  // Update journal entry fields
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        entryDate: dateString.optional(),
        title: z.string().nullable().optional(),
        content: z.string().optional(),
        mood: z.string().nullable().optional(),
        location: z.string().nullable().optional(),
        weather: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const { id, ...data } = input;
        const updateData: Record<string, unknown> = {
          updatedAt: new Date(),
        };

        if (typeof data.entryDate !== 'undefined') updateData.entryDate = data.entryDate;
        if (typeof data.title !== 'undefined') updateData.title = data.title;
        if (typeof data.content !== 'undefined') updateData.content = data.content;
        if (typeof data.mood !== 'undefined') updateData.mood = data.mood;
        if (typeof data.location !== 'undefined') updateData.location = data.location;
        if (typeof data.weather !== 'undefined') updateData.weather = data.weather;

        await db
          .update(journal)
          .set(updateData)
          .where(and(eq(journal.id, id), eq(journal.userId, ctx.user.id)));
        return { success: true };
      } catch (error) {
        console.error('Error updating journal entry:', error);
        return { success: false };
      }
    }),

  // Delete journal entry
  delete: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        await db.delete(journal).where(and(eq(journal.id, input.id), eq(journal.userId, ctx.user.id)));
        return { success: true };
      } catch (error) {
        console.error('Error deleting journal entry:', error);
        return { success: false };
      }
    }),

  // Get all entries for a specific date
  getByDate: protectedProcedure
    .input(
      z.object({
        entryDate: dateString,
      })
    )
    .query(async ({ input, ctx }) => {
      try {
        const result = await db
          .select()
          .from(journal)
          .where(and(eq(journal.entryDate, input.entryDate), eq(journal.userId, ctx.user.id)))
          .orderBy(desc(journal.entryDate));

        return result || [];
      } catch (error) {
        console.error('Error fetching journal entries by date:', error);
        return [];
      }
    }),

  syncJournal: protectedProcedure
    .input(
      z.object({
        since: z.number().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const sinceDate = input.since ? new Date(input.since) : new Date(0);
      const result = await db
        .select()
        .from(journal)
        .where(and(eq(journal.userId, ctx.user.id), gte(journal.updatedAt, sinceDate)))
        .orderBy(desc(journal.updatedAt));
      return result ?? [];
    }),
});
