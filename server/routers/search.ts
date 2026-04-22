import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { items } from '../schema/items';
import { journal } from '../schema/journal';
import { tasks } from '../schema/tasks';
import { protectedProcedure, router } from '../trpc';

// Simple per-process recent-search LRU cache (non-persistent, fast)
const recentSearches = new Map<string, string[]>();
const MAX_RECENT = 12;

function pushRecent(userId: string, q: string) {
  const trimmed = q.trim();
  if (!trimmed) return;
  const list = recentSearches.get(userId) ?? [];
  const next = [trimmed, ...list.filter((x) => x.toLowerCase() !== trimmed.toLowerCase())].slice(0, MAX_RECENT);
  recentSearches.set(userId, next);
}

export const searchRouter = router({
  recent: protectedProcedure.query(({ ctx }) => {
    return { queries: recentSearches.get(ctx.user.id) ?? [] };
  }),

  clearRecent: protectedProcedure.mutation(({ ctx }) => {
    recentSearches.delete(ctx.user.id);
    return { success: true as const };
  }),
  trendingTerms: protectedProcedure
    .input(z.object({ days: z.number().int().min(7).max(90).default(14) }).optional())
    .query(async ({ input, ctx }) => {
      const days = input?.days ?? 14;
      const since = new Date();
      since.setDate(since.getDate() - days);
      const rows = await db
        .select({ title: items.title, content: items.content })
        .from(items)
        .where(and(eq(items.userId, ctx.user.id), isNull(items.deletedAt)))
        .limit(500);
      const stop = new Set([
        'the','and','to','of','a','in','is','it','that','for','on','with','my','me','i','you','be','was','are',
        'this','from','or','but','an','we','they','if','at','not','have','has','had','by','as','will','so','can',
      ]);
      const counts = new Map<string, number>();
      for (const r of rows) {
        const text = `${r.title ?? ''} ${r.content ?? ''}`.toLowerCase();
        const words = text.replace(/[^a-z\u0600-\u06ff\s]/g, ' ').split(/\s+/);
        for (const w of words) {
          if (w.length < 4 || stop.has(w)) continue;
          counts.set(w, (counts.get(w) ?? 0) + 1);
        }
      }
      return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 25)
        .map(([term, count]) => ({ term, count }));
    }),

  suggestCompletions: protectedProcedure
    .input(z.object({ prefix: z.string().min(1).max(40), limit: z.number().int().min(1).max(10).default(5) }))
    .query(async ({ input, ctx }) => {
      const needle = `${input.prefix.trim().replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
      const rows = await db
        .select({ title: items.title })
        .from(items)
        .where(
          and(
            eq(items.userId, ctx.user.id),
            isNull(items.deletedAt),
            sql`lower(${items.title}) LIKE lower(${needle})`
          )
        )
        .orderBy(desc(items.updatedAt))
        .limit(input.limit);
      return rows.map((r) => r.title).filter(Boolean);
    }),

  global: protectedProcedure
    .input(
      z.object({
        q: z.string().min(1).max(120),
        limit: z.number().int().min(1).max(30).default(15),
      })
    )
    .query(async ({ input, ctx }) => {
      pushRecent(ctx.user.id, input.q);
      const needle = `%${input.q.trim().replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
      const perKind = Math.max(5, Math.floor(input.limit / 3));

      const [itemRows, taskRows, journalRows] = await Promise.all([
        db
          .select({ id: items.id, title: items.title, content: items.content, updatedAt: items.updatedAt })
          .from(items)
          .where(
            and(
              eq(items.userId, ctx.user.id),
              isNull(items.deletedAt),
              sql`(lower(${items.title}) LIKE lower(${needle}) OR lower(coalesce(${items.content}, '')) LIKE lower(${needle}))`
            )
          )
          .orderBy(desc(items.updatedAt))
          .limit(perKind),
        db
          .select({
            id: tasks.id,
            title: tasks.title,
            description: tasks.description,
            isCompleted: tasks.isCompleted,
            updatedAt: tasks.updatedAt,
          })
          .from(tasks)
          .where(
            and(
              eq(tasks.userId, ctx.user.id),
              isNull(tasks.deletedAt),
              sql`(lower(${tasks.title}) LIKE lower(${needle}) OR lower(coalesce(${tasks.description}, '')) LIKE lower(${needle}))`
            )
          )
          .orderBy(desc(tasks.updatedAt))
          .limit(perKind),
        db
          .select({
            id: journal.id,
            title: journal.title,
            content: journal.content,
            entryDate: journal.entryDate,
          })
          .from(journal)
          .where(
            and(
              eq(journal.userId, ctx.user.id),
              isNull(journal.deletedAt),
              sql`(lower(coalesce(${journal.title}, '')) LIKE lower(${needle}) OR lower(coalesce(${journal.content}, '')) LIKE lower(${needle}))`
            )
          )
          .orderBy(desc(journal.entryDate))
          .limit(perKind),
      ]);

      return {
        items: itemRows.map((r) => ({
          id: r.id,
          kind: 'item' as const,
          title: r.title,
          snippet: (r.content ?? '').slice(0, 140),
        })),
        tasks: taskRows.map((r) => ({
          id: r.id,
          kind: 'task' as const,
          title: r.title,
          snippet: (r.description ?? '').slice(0, 140),
          isCompleted: Boolean(r.isCompleted),
        })),
        journal: journalRows.map((r) => ({
          id: r.id,
          kind: 'journal' as const,
          title: r.title ?? r.entryDate ?? 'Untitled',
          snippet: (r.content ?? '').slice(0, 140),
        })),
      };
    }),
});
