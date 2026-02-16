import { db } from '../db';
import { categories, items, journal, tags, tasks } from '../schema';
import { publicProcedure, router } from '../trpc';

export const exportRouter = router({
  exportAll: publicProcedure.query(async () => {
    try {
      const [allItems, allTasks, allJournalEntries, allTags, allCategories] = await Promise.all([
        db.select().from(items),
        db.select().from(tasks),
        db.select().from(journal),
        db.select().from(tags),
        db.select().from(categories),
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
