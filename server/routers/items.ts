import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { items } from '../schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../db';
import { randomUUID } from 'crypto';
import { itemTags, tags } from '../schema/tags';

export const itemsRouter = router({
  // قراءة كل العناصر
  list: publicProcedure
    .input(z.object({
      location: z.enum(['inbox', 'library', 'archive']).optional(),
      limit: z.number().default(50),
    }))
    .query(async ({ input }) => {
      try {
        const conditions = [];
        
        if (input.location) {
          conditions.push(eq(items.location, input.location));
        }
        
        const rows = await db
          .select()
          .from(items)
          .leftJoin(itemTags, eq(itemTags.itemId, items.id))
          .leftJoin(tags, eq(tags.id, itemTags.tagId))
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(items.createdAt))
          .limit(input.limit);

        if (!rows || rows.length === 0) {
          return [];
        }

        const itemMap = new Map<string, any>();

        for (const row of rows) {
          const item = row.items;
          const tag = row.tags;

          if (!itemMap.has(item.id)) {
            itemMap.set(item.id, {
              ...item,
              tags: [],
            });
          }

          if (tag) {
            const existingItem = itemMap.get(item.id);
            const alreadyAdded = existingItem.tags.some((t: any) => t.id === tag.id);

            if (!alreadyAdded) {
              existingItem.tags.push({
                id: tag.id,
                name: tag.name,
                color: tag.color,
              });
            }
          }
        }

        return Array.from(itemMap.values());
      } catch (error) {
        console.error('Error fetching items:', error);
        return [];
      }
    }),

  // Get single item with its tags
  getWithTags: publicProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .query(async ({ input }) => {
      try {
        const rows = await db
          .select()
          .from(items)
          .leftJoin(itemTags, eq(itemTags.itemId, items.id))
          .leftJoin(tags, eq(tags.id, itemTags.tagId))
          .where(eq(items.id, input.id));

        if (!rows || rows.length === 0) {
          return null;
        }

        const baseItem = rows[0].items;
        const result = {
          ...baseItem,
          tags: [] as Array<{ id: string; name: string; color: string | null }>,
        };

        for (const row of rows) {
          if (row.tags) {
            const alreadyAdded = result.tags.some((t) => t.id === row.tags!.id);
            if (!alreadyAdded) {
              result.tags.push({
                id: row.tags.id,
                name: row.tags.name,
                color: row.tags.color,
              });
            }
          }
        }

        return result;
      } catch (error) {
        console.error('Error fetching item with tags:', error);
        return null;
      }
    }),

  // إضافة عنصر جديد
  create: publicProcedure
    .input(z.object({
      type: z.enum(['note', 'quote', 'link', 'audio']),
      title: z.string(),
      content: z.string().optional(),
      url: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const newItem = {
          id: randomUUID(),
          userId: 'test-user',
          type: input.type,
          title: input.title,
          content: input.content || null,
          url: input.url || null,
          location: 'inbox' as const,
          isFavorite: false,
        };
        
        await db.insert(items).values(newItem);
        return newItem;
      } catch (error) {
        console.error('Error creating item:', error);
        throw error;
      }
    }),

  // تعديل عنصر
  update: publicProcedure
    .input(z.object({
      id: z.string(),
      title: z.string().optional(),
      content: z.string().optional(),
      location: z.enum(['inbox', 'library', 'archive']).optional(),
      isFavorite: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      
      await db
        .update(items)
        .set({ ...data, updatedAt: sql`(strftime('%s', 'now'))` })
        .where(eq(items.id, id));
      
      return { success: true };
    }),

  // حذف عنصر
  delete: publicProcedure
    .input(z.object({
      id: z.string(),
    }))
    .mutation(async ({ input }) => {
      await db
        .delete(items)
        .where(eq(items.id, input.id));
      
      return { success: true };
    }),
});
