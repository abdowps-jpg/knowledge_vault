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
        // Verify ownership before deleting associations.
        const owned = await db
          .select()
          .from(tags)
          .where(and(eq(tags.id, input.id), eq(tags.userId, ctx.user.id)))
          .limit(1);
        if (owned.length === 0) return { success: false };

        await db.transaction(async (tx) => {
          await tx.delete(itemTags).where(eq(itemTags.tagId, input.id));
          await tx.delete(tags).where(eq(tags.id, input.id));
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

        try {
          await db.insert(itemTags).values({
            id: randomUUID(),
            itemId: input.itemId,
            tagId: input.tagId,
          });
        } catch {
          // Concurrent duplicate insert — treat as success.
        }

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

  createMany: protectedProcedure
    .input(z.object({ names: z.array(z.string().min(1).max(80)).min(1).max(30) }))
    .mutation(async ({ input, ctx }) => {
      const normalized = Array.from(
        new Set(input.names.map((n) => n.trim().toLowerCase()).filter(Boolean))
      );
      if (normalized.length === 0) return { success: true as const, created: 0, ids: [] as string[] };

      const existing = await db
        .select()
        .from(tags)
        .where(and(eq(tags.userId, ctx.user.id), inArray(tags.name, normalized)));
      const existingSet = new Set(existing.map((t) => t.name));
      const toCreate = normalized.filter((n) => !existingSet.has(n));
      const rows = toCreate.map((name) => ({
        id: randomUUID(),
        userId: ctx.user.id,
        name,
        color: null,
        createdAt: new Date(),
      }));
      if (rows.length > 0) await db.insert(tags).values(rows);
      return {
        success: true as const,
        created: rows.length,
        ids: rows.map((r) => r.id),
      };
    }),

  merge: protectedProcedure
    .input(z.object({ keepId: z.string(), fromId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      if (input.keepId === input.fromId) {
        return { success: true as const, moved: 0 };
      }
      const rows = await db
        .select()
        .from(tags)
        .where(and(inArray(tags.id, [input.keepId, input.fromId]), eq(tags.userId, ctx.user.id)));
      if (rows.length !== 2) {
        return { success: false as const, moved: 0 };
      }
      const links = await db.select().from(itemTags).where(eq(itemTags.tagId, input.fromId));
      let moved = 0;
      for (const link of links) {
        const existing = await db
          .select()
          .from(itemTags)
          .where(and(eq(itemTags.itemId, link.itemId), eq(itemTags.tagId, input.keepId)))
          .limit(1);
        if (existing.length === 0) {
          await db.update(itemTags).set({ tagId: input.keepId }).where(eq(itemTags.id, link.id));
          moved += 1;
        } else {
          await db.delete(itemTags).where(eq(itemTags.id, link.id));
        }
      }
      await db.delete(tags).where(eq(tags.id, input.fromId));
      return { success: true as const, moved };
    }),

  listWithCounts: protectedProcedure.query(async ({ ctx }) => {
    const tagRows = await db.select().from(tags).where(eq(tags.userId, ctx.user.id));
    if (tagRows.length === 0) return [];
    const tagIds = tagRows.map((t) => t.id);
    const links = await db.select().from(itemTags).where(inArray(itemTags.tagId, tagIds));
    const itemIds = links.map((l) => l.itemId);
    const ownedItems = itemIds.length > 0
      ? await db
          .select({ id: items.id })
          .from(items)
          .where(and(inArray(items.id, itemIds), eq(items.userId, ctx.user.id)))
      : [];
    const ownedItemIds = new Set(ownedItems.map((i) => i.id));
    const countByTag = new Map<string, number>();
    for (const link of links) {
      if (!ownedItemIds.has(link.itemId)) continue;
      countByTag.set(link.tagId, (countByTag.get(link.tagId) ?? 0) + 1);
    }
    return tagRows
      .map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color ?? null,
        itemCount: countByTag.get(t.id) ?? 0,
      }))
      .sort((a, b) => b.itemCount - a.itemCount || a.name.localeCompare(b.name));
  }),

  rename: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(80),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const newName = input.name.trim().toLowerCase();
      const rows = await db
        .select()
        .from(tags)
        .where(and(eq(tags.id, input.id), eq(tags.userId, ctx.user.id)))
        .limit(1);
      const current = rows[0];
      if (!current) return { success: false as const, merged: false };

      // If another tag with the new name exists for this user, merge: point
      // all itemTags links at the target tag then delete the current tag.
      const collision = await db
        .select()
        .from(tags)
        .where(and(eq(tags.userId, ctx.user.id), eq(tags.name, newName)))
        .limit(1);
      const target = collision.find((t) => t.id !== current.id);

      if (target) {
        // Move links
        const links = await db
          .select()
          .from(itemTags)
          .where(eq(itemTags.tagId, current.id));
        for (const link of links) {
          // Skip if the item already has the target tag
          const existing = await db
            .select()
            .from(itemTags)
            .where(and(eq(itemTags.itemId, link.itemId), eq(itemTags.tagId, target.id)))
            .limit(1);
          if (existing.length === 0) {
            await db.update(itemTags).set({ tagId: target.id }).where(eq(itemTags.id, link.id));
          } else {
            await db.delete(itemTags).where(eq(itemTags.id, link.id));
          }
        }
        await db.delete(tags).where(eq(tags.id, current.id));
        return { success: true as const, merged: true, targetId: target.id };
      }

      await db.update(tags).set({ name: newName }).where(eq(tags.id, current.id));
      return { success: true as const, merged: false };
    }),
});
