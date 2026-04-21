import { randomUUID } from 'crypto';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { categories, itemCategories } from '../schema/categories';
import { items } from '../schema/items';
import { protectedProcedure, router } from '../trpc';

export const categoriesRouter = router({
  // Get all categories
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(200).default(100),
        cursor: z.number().int().min(0).optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      try {
        const cursor = input.cursor ?? 0;
        const result = await db
          .select()
          .from(categories)
          .where(eq(categories.userId, ctx.user.id))
          .orderBy(desc(categories.createdAt))
          .limit(input.limit)
          .offset(cursor);

        return result || [];
      } catch (error) {
        console.error('Error fetching categories:', error);
        return [];
      }
    }),

  // Create category
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        icon: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const newCategory = {
          id: randomUUID(),
          userId: ctx.user.id,
          name: input.name.trim(),
          icon: input.icon || 'folder',
        };

        await db.insert(categories).values(newCategory);
        return newCategory;
      } catch (error) {
        console.error('Error creating category:', error);
        return null;
      }
    }),

  // Update category
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        icon: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const { id, ...data } = input;

        await db
          .update(categories)
          .set({
            ...data,
            updatedAt: new Date().toISOString(),
          })
          .where(and(eq(categories.id, id), eq(categories.userId, ctx.user.id)));

        return { success: true };
      } catch (error) {
        console.error('Error updating category:', error);
        return { success: false };
      }
    }),

  // Delete category
  delete: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        // Verify ownership before deleting associations.
        const owned = await db
          .select({ id: categories.id })
          .from(categories)
          .where(and(eq(categories.id, input.id), eq(categories.userId, ctx.user.id)))
          .limit(1);
        if (owned.length === 0) return { success: false };

        await db.transaction(async (tx) => {
          await tx.delete(itemCategories).where(eq(itemCategories.categoryId, input.id));
          await tx.delete(categories).where(eq(categories.id, input.id));
        });
        return { success: true };
      } catch (error) {
        console.error('Error deleting category:', error);
        return { success: false };
      }
    }),

  // Assign category to an item
  assignToItem: protectedProcedure
    .input(
      z.object({
        itemId: z.string(),
        categoryId: z.string().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const ownerItem = await db
          .select({ id: items.id })
          .from(items)
          .where(and(eq(items.id, input.itemId), eq(items.userId, ctx.user.id)))
          .limit(1);
        if (ownerItem.length === 0) {
          return { success: false, categoryId: null };
        }

        if (input.categoryId) {
          const ownerCategory = await db
            .select({ id: categories.id })
            .from(categories)
            .where(and(eq(categories.id, input.categoryId), eq(categories.userId, ctx.user.id)))
            .limit(1);
          if (ownerCategory.length === 0) {
            return { success: false, categoryId: null };
          }
        }

        await db.transaction(async (tx) => {
          await tx.delete(itemCategories).where(eq(itemCategories.itemId, input.itemId));

          if (!input.categoryId) {
            return;
          }

          await tx.insert(itemCategories).values({
            id: randomUUID(),
            itemId: input.itemId,
            categoryId: input.categoryId,
          });
        });

        return { success: true, categoryId: input.categoryId };
      } catch (error) {
        console.error('Error assigning category to item:', error);
        return { success: false, categoryId: null };
      }
    }),

  listWithCounts: protectedProcedure.query(async ({ ctx }) => {
    const cats = await db.select().from(categories).where(eq(categories.userId, ctx.user.id));
    if (cats.length === 0) return [];
    const catIds = cats.map((c) => c.id);
    const links = await db.select().from(itemCategories).where(inArray(itemCategories.categoryId, catIds));
    const itemIds = links.map((l) => l.itemId);
    const ownedItems = itemIds.length > 0
      ? await db
          .select({ id: items.id })
          .from(items)
          .where(and(inArray(items.id, itemIds), eq(items.userId, ctx.user.id), isNull(items.deletedAt)))
      : [];
    const ownedItemIds = new Set(ownedItems.map((i) => i.id));
    const countByCategory = new Map<string, number>();
    for (const link of links) {
      if (!ownedItemIds.has(link.itemId)) continue;
      countByCategory.set(link.categoryId, (countByCategory.get(link.categoryId) ?? 0) + 1);
    }
    return cats.map((c) => ({
      id: c.id,
      name: c.name,
      icon: c.icon ?? null,
      itemCount: countByCategory.get(c.id) ?? 0,
    }));
  }),
});
