import { randomUUID } from 'crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { items } from '../schema/items';
import { itemTags, tags } from '../schema/tags';
import { protectedProcedure, router } from '../trpc';

export const tagsRouter = router({
  // Get all tags for the current user
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
          .from(tags)
          .where(eq(tags.userId, ctx.user.id))
          .orderBy(desc(tags.createdAt))
          .limit(input.limit)
          .offset(cursor);

        return result || [];
      } catch (error) {
        console.error('Error fetching tags:', error);
        return [];
      }
    }),

  // Create tag
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        color: z
          .string()
          .regex(/^#([0-9a-fA-F]{6})$/, 'Color must be a hex value like #22C55E')
          .optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const newTag = {
          id: randomUUID(),
          userId: ctx.user.id,
          name: input.name.trim(),
          color: input.color ?? null,
        };

        await db.insert(tags).values(newTag);
        return newTag;
      } catch (error) {
        console.error('Error creating tag:', error);
        return null;
      }
    }),

  // Delete tag and unlink it from items
  delete: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        await db.transaction(async (tx) => {
          await tx.delete(itemTags).where(eq(itemTags.tagId, input.id));
          await tx.delete(tags).where(and(eq(tags.id, input.id), eq(tags.userId, ctx.user.id)));
        });
        return { success: true };
      } catch (error) {
        console.error('Error deleting tag:', error);
        return { success: false };
      }
    }),

  // Link tag to an item
  addToItem: protectedProcedure
    .input(
      z.object({
        itemId: z.string(),
        tagId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const ownerItem = await db
          .select()
          .from(items)
          .where(and(eq(items.id, input.itemId), eq(items.userId, ctx.user.id)))
          .limit(1);
        if (ownerItem.length === 0) {
          return { success: false };
        }

        const ownerTag = await db
          .select()
          .from(tags)
          .where(and(eq(tags.id, input.tagId), eq(tags.userId, ctx.user.id)))
          .limit(1);
        if (ownerTag.length === 0) {
          return { success: false };
        }

        const existing = await db
          .select()
          .from(itemTags)
          .where(and(eq(itemTags.itemId, input.itemId), eq(itemTags.tagId, input.tagId)))
          .limit(1);

        if (existing.length > 0) {
          return { success: true };
        }

        await db.insert(itemTags).values({
          id: randomUUID(),
          itemId: input.itemId,
          tagId: input.tagId,
        });

        return { success: true };
      } catch (error) {
        console.error('Error linking tag to item:', error);
        return { success: false };
      }
    }),

  // Unlink tag from an item
  removeFromItem: protectedProcedure
    .input(
      z.object({
        itemId: z.string(),
        tagId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const ownerItem = await db
          .select()
          .from(items)
          .where(and(eq(items.id, input.itemId), eq(items.userId, ctx.user.id)))
          .limit(1);
        if (ownerItem.length === 0) {
          return { success: false };
        }

        const ownerTag = await db
          .select()
          .from(tags)
          .where(and(eq(tags.id, input.tagId), eq(tags.userId, ctx.user.id)))
          .limit(1);
        if (ownerTag.length === 0) {
          return { success: false };
        }

        await db
          .delete(itemTags)
          .where(and(eq(itemTags.itemId, input.itemId), eq(itemTags.tagId, input.tagId)));

        return { success: true };
      } catch (error) {
        console.error('Error unlinking tag from item:', error);
        return { success: false };
      }
    }),

  // Get all tags linked to a specific item
  getItemTags: protectedProcedure
    .input(
      z.object({
        itemId: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      try {
        const ownerItem = await db
          .select()
          .from(items)
          .where(and(eq(items.id, input.itemId), eq(items.userId, ctx.user.id)))
          .limit(1);
        if (ownerItem.length === 0) {
          return [];
        }

        const links = await db.select().from(itemTags).where(eq(itemTags.itemId, input.itemId));

        if (!links || links.length === 0) {
          return [];
        }

        const tagIds = links.map((link) => link.tagId);
        const result = await db.select().from(tags).where(inArray(tags.id, tagIds));
        return result || [];
      } catch (error) {
        console.error('Error fetching item tags:', error);
        return [];
      }
    }),
});
