import { db } from '../db';
import { categories, items, itemTags, journal, tags, tasks } from '../schema';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { protectedProcedure, router } from '../trpc';

function escapeFrontMatterValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function sanitizeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || 'untitled';
}

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

  exportMarkdown: protectedProcedure.query(async ({ ctx }) => {
    const [allItems, allTags] = await Promise.all([
      db
        .select()
        .from(items)
        .where(and(eq(items.userId, ctx.user.id), isNull(items.deletedAt)))
        .orderBy(asc(items.createdAt)),
      db.select().from(tags).where(eq(tags.userId, ctx.user.id)),
    ]);

    const itemIds = allItems.map((i) => i.id);
    const allLinks = itemIds.length > 0
      ? await db.select().from(itemTags).where(inArray(itemTags.itemId, itemIds))
      : [];
    const tagNameById = new Map(allTags.map((t) => [t.id, t.name]));
    const tagsByItem = new Map<string, string[]>();
    for (const link of allLinks) {
      const name = tagNameById.get(link.tagId);
      if (!name) continue;
      const list = tagsByItem.get(link.itemId) ?? [];
      list.push(name);
      tagsByItem.set(link.itemId, list);
    }

    const files = allItems.map((it) => {
      const itemTagList = tagsByItem.get(it.id) ?? [];
      const createdAt = it.createdAt instanceof Date ? it.createdAt : null;
      const dateStr = createdAt ? createdAt.toISOString().slice(0, 10) : '0000-00-00';
      const frontMatter = [
        '---',
        `title: ${escapeFrontMatterValue(it.title || 'Untitled')}`,
        `type: ${it.type}`,
        createdAt ? `createdAt: ${createdAt.toISOString()}` : '',
        it.url ? `url: ${escapeFrontMatterValue(it.url)}` : '',
        itemTagList.length > 0
          ? `tags: [${itemTagList.map((t) => escapeFrontMatterValue(t)).join(', ')}]`
          : '',
        '---',
        '',
      ]
        .filter(Boolean)
        .join('\n');
      const body = (it.content ?? '').trim();
      const markdown = `${frontMatter}# ${it.title || 'Untitled'}\n\n${body}\n`;
      return {
        filename: `${dateStr}-${sanitizeFilename(it.title || 'untitled')}.md`,
        content: markdown,
      };
    });

    return {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      count: files.length,
      files,
    };
  }),
});
