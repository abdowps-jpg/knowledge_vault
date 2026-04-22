import { randomUUID } from 'crypto';
import { and, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
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
        const conditions = [eq(journal.userId, ctx.user.id), isNull(journal.deletedAt)];

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
          .where(and(eq(journal.entryDate, input.entryDate), eq(journal.userId, ctx.user.id), isNull(journal.deletedAt)))
          .orderBy(desc(journal.entryDate));

        return result || [];
      } catch (error) {
        console.error('Error fetching journal entries by date:', error);
        return [];
      }
    }),

  byDateRange: protectedProcedure
    .input(
      z.object({
        start: dateString,
        end: dateString,
      })
    )
    .query(async ({ input, ctx }) => {
      return db
        .select()
        .from(journal)
        .where(
          and(
            eq(journal.userId, ctx.user.id),
            isNull(journal.deletedAt),
            gte(journal.entryDate, input.start),
            lte(journal.entryDate, input.end)
          )
        )
        .orderBy(desc(journal.entryDate));
    }),

  wordCloud: protectedProcedure
    .input(z.object({ days: z.number().int().min(7).max(365).default(30) }).optional())
    .query(async ({ ctx, input }) => {
      const days = input?.days ?? 30;
      const since = new Date();
      since.setDate(since.getDate() - days);
      const rows = await db
        .select({ content: journal.content })
        .from(journal)
        .where(and(eq(journal.userId, ctx.user.id), isNull(journal.deletedAt), gte(journal.createdAt, since)));
      const stopwords = new Set([
        'the', 'and', 'a', 'to', 'of', 'in', 'i', 'is', 'it', 'that', 'this', 'for', 'on', 'with', 'my', 'me',
        'but', 'was', 'at', 'not', 'be', 'are', 'as', 'you', 'have', 'had', 'has', 'so', 'an', 'or', 'if',
        'we', 'do', 'just', 'from', 'they', 'he', 'she', 'them', 'by', 'about', 'all', 'were', 'can', 'will',
        'some', 'more', 'up', 'out', 'what', 'when', 'how', 'there', 'their', 'than', 'then', 'which', 'been',
        'also', 'any', 'our', 'its', 'his', 'her', 'very', 'even', 'only', 'too', 'now', 'after', 'before',
        'over', 'still', 'much', 'get', 'got', 'one', 'two', 'like',
      ]);
      const counts = new Map<string, number>();
      for (const r of rows) {
        if (!r.content) continue;
        const words = r.content
          .toLowerCase()
          .replace(/[^a-z\u0600-\u06ff\s]/g, ' ')
          .split(/\s+/)
          .filter((w) => w.length > 3 && !stopwords.has(w));
        for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
      }
      return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 40)
        .map(([word, count]) => ({ word, count }));
    }),

  streakStats: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select({ entryDate: journal.entryDate })
      .from(journal)
      .where(and(eq(journal.userId, ctx.user.id), isNull(journal.deletedAt)));
    const days = new Set<string>();
    for (const r of rows) {
      if (r.entryDate && typeof r.entryDate === 'string') {
        days.add(r.entryDate.slice(0, 10));
      }
    }

    // Current streak: walk back from today while days contain that key
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    let current = 0;
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    while (days.has(fmt(cursor))) {
      current += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    // Longest streak: sort and walk
    let longest = 0;
    if (days.size > 0) {
      const sorted = Array.from(days).sort();
      let run = 1;
      for (let i = 1; i < sorted.length; i += 1) {
        const prev = new Date(sorted[i - 1]);
        const curr = new Date(sorted[i]);
        if (curr.getTime() - prev.getTime() === 86400000) run += 1;
        else {
          longest = Math.max(longest, run);
          run = 1;
        }
      }
      longest = Math.max(longest, run);
    }
    return { current, longest, totalUniqueDays: days.size };
  }),

  stats: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select()
      .from(journal)
      .where(and(eq(journal.userId, ctx.user.id), isNull(journal.deletedAt)));
    const total = rows.length;
    let wordCount = 0;
    let charCount = 0;
    const uniqueDates = new Set<string>();
    for (const r of rows) {
      const content = r.content ?? '';
      charCount += content.length;
      wordCount += content.trim() ? content.trim().split(/\s+/).length : 0;
      if (r.entryDate) uniqueDates.add(String(r.entryDate).slice(0, 10));
    }
    return {
      totalEntries: total,
      uniqueDays: uniqueDates.size,
      totalWords: wordCount,
      totalChars: charCount,
      averageWordsPerEntry: total > 0 ? Math.round(wordCount / total) : 0,
    };
  }),

  moodStats: protectedProcedure.query(async ({ ctx }) => {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const rows = await db
      .select()
      .from(journal)
      .where(and(eq(journal.userId, ctx.user.id), isNull(journal.deletedAt), gte(journal.createdAt, since)));
    const counts = new Map<string, number>();
    for (const r of rows) {
      if (!r.mood) continue;
      const key = r.mood.toLowerCase().trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const distribution = Array.from(counts.entries())
      .map(([mood, count]) => ({ mood, count }))
      .sort((a, b) => b.count - a.count);
    return { total: rows.length, distribution };
  }),

  searchFast: protectedProcedure
    .input(
      z.object({
        q: z.string().min(1).max(120),
        limit: z.number().int().min(1).max(50).default(20),
      })
    )
    .query(async ({ input, ctx }) => {
      const needle = `%${input.q.trim().replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
      const rows = await db
        .select()
        .from(journal)
        .where(
          and(
            eq(journal.userId, ctx.user.id),
            isNull(journal.deletedAt),
            sql`(lower(coalesce(${journal.title}, '')) LIKE lower(${needle}) OR lower(coalesce(${journal.content}, '')) LIKE lower(${needle}))`
          )
        )
        .orderBy(desc(journal.entryDate))
        .limit(input.limit);
      return rows;
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
