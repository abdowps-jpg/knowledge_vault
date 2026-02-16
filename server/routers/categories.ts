import { randomUUID } from 'crypto';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { categories, itemCategories } from '../schema/categories';
import { publicProcedure, router } from '../trpc';

export const categoriesRouter = router({
  // Get all categories
  list: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(200).default(100),
        cursor: z.number().int().min(0).optional(),
      })
    )
    .query(async ({ input }) => {
      try {
        const cursor = input.cursor ?? 0;
        const result = await db
          .select()
          .from(categories)
          .where(eq(categories.userId, 'test-user'))
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
  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        icon: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const newCategory = {
          id: randomUUID(),
          userId: 'test-user',
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
  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        icon: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const { id, ...data } = input;

        await db
          .update(categories)
          .set({
            ...data,
            updatedAt: new Date().toISOString(),
          })
          .where(and(eq(categories.id, id), eq(categories.userId, 'test-user')));

        return { success: true };
      } catch (error) {
        console.error('Error updating category:', error);
        return { success: false };
      }
    }),

  // Delete category
  delete: publicProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        await db.transaction(async (tx) => {
          await tx.delete(itemCategories).where(eq(itemCategories.categoryId, input.id));
          await tx
            .delete(categories)
            .where(and(eq(categories.id, input.id), eq(categories.userId, 'test-user')));
        });
        return { success: true };
      } catch (error) {
        console.error('Error deleting category:', error);
        return { success: false };
      }
    }),

  // Assign category to an item
  assignToItem: publicProcedure
    .input(
      z.object({
        itemId: z.string(),
        categoryId: z.string().nullable(),
      })
    )
    .mutation(async ({ input }) => {
      try {
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
});
