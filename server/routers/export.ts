import { db } from '../db';
import { categories, items, journal, tags, tasks } from '../schema';
import { and, eq, isNull } from 'drizzle-orm';
import { protectedProcedure, router } from '../trpc';

export const exportRouter = router({
  exportAll: protectedProcedure.query(async ({ ctx }) => {
    try {
      const [allItems, allTasks, allJournalEntries, allTags, allCategories] = await Promise.all([
        db.select().from(items).where(and(eq(items.userId, ctx.user.id), isNull(items.deletedAt))),
        db.select().from(tasks).where(and(eq(tasks.userId, ctx.user.id), isNull(tasks.deletedAt))),
        db.select().from(journal).where(and(eq(journal.userId, ctx.user.id), isNull(journal.deletedAt))),
        db.select().from(tags).where(eq(tags.userId, ctx.user.id)),
        db.select().from(categories).where(eq(categories.userId, ctx.user.id)),
      ]);

      const exportDate = new Date().toISOString();

      return {
        metadata: {
          version: '1.0.0',
          exportDate,
        },
        data: {
          items: allItems ?? [],
          tasks: allTasks ?? [],
          journalEntries: allJournalEntries ?? [],
          tags: allTags ?? [],
          categories: allCategories ?? [],
        },
      };
    } catch (error) {
      console.error('Error exporting data:', error);
      return {
        metadata: {
          version: '1.0.0',
          exportDate: new Date().toISOString(),
        },
        data: {
          items: [],
          tasks: [],
          journalEntries: [],
          tags: [],
          categories: [],
        },
      };
    }
  }),
});
