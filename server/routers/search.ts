import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { items } from '../schema/items';
import { journal } from '../schema/journal';
import { tasks } from '../schema/tasks';
import { protectedProcedure, router } from '../trpc';

export const searchRouter = router({
  global: protectedProcedure
    .input(
      z.object({
        q: z.string().min(1).max(120),
        limit: z.number().int().min(1).max(30).default(15),
      })
    )
    .query(async ({ input, ctx }) => {
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
