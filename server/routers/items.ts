import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { items } from '../schema';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db';

export const itemsRouter = router({
  // قراءة كل العناصر
  // Get all items
  list: publicProcedure
    .input(z.object({
      location: z.enum(['inbox', 'library', 'archive']).optional(),
      limit: z.number().default(50),
    }))
    .query(async ({ input }) => {
      const conditions = [];
      
      if (input.location) {
        conditions.push(eq(items.location, input.location));
      }
      
      const result = await db
        .select()
        .from(items)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(items.createdAt))
        .limit(input.limit);
      
      return result;
    }),

  // إضافة عنصر جديد
  // Create new item
  create: publicProcedure
    .input(z.object({
      type: z.enum(['note', 'quote', 'link', 'audio']),
      title: z.string(),
      content: z.string().optional(),
      url: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const newItem = {
        id: crypto.randomUUID(),
        userId: 'test-user', // هنعدلها لاحقاً بعد Authentication
        type: input.type,
        title: input.title,
        content: input.content || null,
        url: input.url || null,
        location: 'inbox' as const,
        isFavorite: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      
      await db.insert(items).values(newItem);
      return newItem;
    }),

  // تعديل عنصر
  // Update item
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
        .set({ ...data, updatedAt: new Date() })
        .where(eq(items.id, id));
      
      return { success: true };
    }),

  // حذف عنصر
  // Delete item
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