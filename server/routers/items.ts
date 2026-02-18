import { z } from 'zod';
import { protectedProcedure, router } from '../trpc';
import { items } from '../schema';
import { eq, and, desc, asc, sql, gte, inArray } from 'drizzle-orm';
import { db } from '../db';
import { randomUUID } from 'crypto';
import { itemTags, tags } from '../schema/tags';
import { itemCategories } from '../schema/categories';

export const itemsRouter = router({
  // قراءة كل العناصر
  list: protectedProcedure
    .input(z.object({
      location: z.enum(['inbox', 'library', 'archive']).optional(),
      isFavorite: z.boolean().optional(),
      type: z.enum(['note', 'quote', 'link', 'audio']).optional(),
      categoryId: z.string().optional(),
      recentDays: z.number().optional(),
      sortBy: z.enum(['createdAt', 'title']).default('createdAt'),
      sortOrder: z.enum(['asc', 'desc']).default('desc'),
      limit: z.number().min(1).max(100).default(25),
      cursor: z.number().int().min(0).optional(),
    }))
    .query(async ({ input, ctx }) => {
      try {
        const cursor = input.cursor ?? 0;
        const conditions = [eq(items.userId, ctx.user.id)];
        
        if (input.location) {
          conditions.push(eq(items.location, input.location));
        }

        if (typeof input.isFavorite === 'boolean') {
          conditions.push(eq(items.isFavorite, input.isFavorite));
        }

        if (input.type) {
          conditions.push(eq(items.type, input.type));
        }

        if (input.categoryId) {
          conditions.push(eq(itemCategories.categoryId, input.categoryId));
        }

        if (input.recentDays && input.recentDays > 0) {
          const recentThreshold = new Date(Date.now() - input.recentDays * 24 * 60 * 60 * 1000);
          conditions.push(gte(items.createdAt, recentThreshold));
        }
        
        const rows = await db
          .select()
          .from(items)
          .leftJoin(itemCategories, eq(itemCategories.itemId, items.id))
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(
            input.sortBy === 'title'
              ? input.sortOrder === 'asc'
                ? asc(items.title)
                : desc(items.title)
              : input.sortOrder === 'asc'
              ? asc(items.createdAt)
              : desc(items.createdAt)
          )
          .limit(input.limit + 1)
          .offset(cursor);

        if (!rows || rows.length === 0) {
          return { items: [], nextCursor: undefined };
        }

        const hasMore = rows.length > input.limit;
        const pageRows = hasMore ? rows.slice(0, input.limit) : rows;
        const mappedItems = pageRows.map((row) => ({
          ...row.items,
          tags: [] as Array<{ id: string; name: string; color: string | null }>,
        }));
        const itemIds = mappedItems.map((item: any) => item.id);

        if (itemIds.length === 0) {
          return { items: mappedItems, nextCursor: undefined };
        }

        const tagRows = await db
          .select()
          .from(itemTags)
          .innerJoin(tags, eq(tags.id, itemTags.tagId))
          .where(inArray(itemTags.itemId, itemIds));

        const tagsByItemId = new Map<string, Array<{ id: string; name: string; color: string | null }>>();
        for (const row of tagRows) {
          const entry = tagsByItemId.get(row.item_tags.itemId) ?? [];
          entry.push({
            id: row.tags.id,
            name: row.tags.name,
            color: row.tags.color,
          });
          tagsByItemId.set(row.item_tags.itemId, entry);
        }

        const categoryLinks = await db
          .select()
          .from(itemCategories)
          .where(inArray(itemCategories.itemId, itemIds));

        const categoryByItemId = new Map<string, string>();
        for (const link of categoryLinks) {
          categoryByItemId.set(link.itemId, link.categoryId);
        }

        return {
          items: mappedItems.map((item: any) => ({
            ...item,
            tags: tagsByItemId.get(item.id) ?? [],
            categoryId: categoryByItemId.get(item.id) ?? null,
          })),
          nextCursor: hasMore ? cursor + input.limit : undefined,
        };
      } catch (error) {
        console.error('Error fetching items:', error);
        return { items: [], nextCursor: undefined };
      }
    }),

  // Get single item with its tags
  getWithTags: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      try {
        const rows = await db
          .select()
          .from(items)
          .leftJoin(itemTags, eq(itemTags.itemId, items.id))
          .leftJoin(tags, eq(tags.id, itemTags.tagId))
          .where(and(eq(items.id, input.id), eq(items.userId, ctx.user.id)));

        if (!rows || rows.length === 0) {
          return null;
        }

        const baseItem = rows[0].items;
        const categoryLink = await db
          .select()
          .from(itemCategories)
          .where(eq(itemCategories.itemId, input.id))
          .limit(1);

        const result = {
          ...baseItem,
          tags: [] as Array<{ id: string; name: string; color: string | null }>,
          categoryId: categoryLink[0]?.categoryId ?? null,
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
  create: protectedProcedure
    .input(z.object({
      type: z.enum(['note', 'quote', 'link', 'audio']),
      title: z.string(),
      content: z.string().optional(),
      url: z.string().optional(),
      location: z.enum(['inbox', 'library', 'archive']).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const newItem = {
          id: randomUUID(),
          userId: ctx.user.id,
          type: input.type,
          title: input.title,
          content: input.content || null,
          url: input.url || null,
          location: input.location ?? ('inbox' as const),
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
  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      title: z.string().optional(),
      content: z.string().optional(),
      location: z.enum(['inbox', 'library', 'archive']).optional(),
      isFavorite: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      
      await db
        .update(items)
        .set({ ...data, updatedAt: sql`(strftime('%s', 'now'))` })
        .where(and(eq(items.id, id), eq(items.userId, ctx.user.id)));
      
      return { success: true };
    }),

  // Toggle favorite status
  toggleFavorite: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const existing = await db
          .select()
          .from(items)
          .where(and(eq(items.id, input.id), eq(items.userId, ctx.user.id)))
          .limit(1);

        if (!existing || existing.length === 0) {
          return { success: false, isFavorite: false };
        }

        const nextIsFavorite = !existing[0].isFavorite;

        await db
          .update(items)
          .set({
            isFavorite: nextIsFavorite,
            updatedAt: sql`(strftime('%s', 'now'))`,
          })
          .where(and(eq(items.id, input.id), eq(items.userId, ctx.user.id)));

        return { success: true, isFavorite: nextIsFavorite };
      } catch (error) {
        console.error('Error toggling favorite:', error);
        return { success: false, isFavorite: false };
      }
    }),

  // حذف عنصر
  delete: protectedProcedure
    .input(z.object({
      id: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      await db
        .delete(items)
        .where(and(eq(items.id, input.id), eq(items.userId, ctx.user.id)));
      
      return { success: true };
    }),

  syncItems: protectedProcedure
    .input(
      z.object({
        since: z.number().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const sinceDate = input.since ? new Date(input.since) : new Date(0);
      const result = await db
        .select()
        .from(items)
        .where(and(eq(items.userId, ctx.user.id), gte(items.updatedAt, sinceDate)))
        .orderBy(desc(items.updatedAt));
      return result ?? [];
    }),
});
