import { randomUUID } from 'crypto';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { journal } from '../schema/journal';
import { publicProcedure, router } from '../trpc';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

export const journalRouter = router({
  // List entries filtered by optional date range, newest first
  list: publicProcedure
    .input(
      z.object({
        startDate: dateString.optional(),
        endDate: dateString.optional(),
        limit: z.number().min(1).max(100).default(25),
        cursor: z.number().int().min(0).optional(),
      })
    )
    .query(async ({ input }) => {
      try {
        const cursor = input.cursor ?? 0;
        const conditions = [];

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
          .orderBy(desc(journal.entryDate))
          .limit(input.limit + 1)
          .offset(cursor);

        const safeResult = result || [];
        const hasMore = safeResult.length > input.limit;
        const pageItems = hasMore ? safeResult.slice(0, input.limit) : safeResult;

        return {
          items: pageItems,
          nextCursor: hasMore ? cursor + input.limit : undefined,
        };
      } catch (error) {
        console.error('Error fetching journal entries:', error);
        return { items: [], nextCursor: undefined };
      }
    }),

  // Create journal entry
  create: publicProcedure
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
    .mutation(async ({ input }) => {
      try {
        const newEntry = {
          id: randomUUID(),
          userId: 'test-user',
          entryDate: input.entryDate,
          title: input.title ?? null,
          content: input.content,
          mood: input.mood ?? null,
          location: input.location ?? null,
          weather: input.weather ?? null,
          isLocked: false,
        };

        await db.insert(journal).values(newEntry);
        return newEntry;
      } catch (error) {
        console.error('Error creating journal entry:', error);
        return null;
      }
    }),

  // Update journal entry fields
  update: publicProcedure
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
    .mutation(async ({ input }) => {
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

        await db.update(journal).set(updateData).where(eq(journal.id, id));
        return { success: true };
      } catch (error) {
        console.error('Error updating journal entry:', error);
        return { success: false };
      }
    }),

  // Delete journal entry
  delete: publicProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        await db.delete(journal).where(eq(journal.id, input.id));
        return { success: true };
      } catch (error) {
        console.error('Error deleting journal entry:', error);
        return { success: false };
      }
    }),

  // Get all entries for a specific date
  getByDate: publicProcedure
    .input(
      z.object({
        entryDate: dateString,
      })
    )
    .query(async ({ input }) => {
      try {
        const result = await db
          .select()
          .from(journal)
          .where(eq(journal.entryDate, input.entryDate))
          .orderBy(desc(journal.entryDate));

        return result || [];
      } catch (error) {
        console.error('Error fetching journal entries by date:', error);
        return [];
      }
    }),
});
