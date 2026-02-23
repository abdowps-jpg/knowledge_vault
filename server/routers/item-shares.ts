import { randomUUID } from 'crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { db } from '../db';
import { itemShares } from '../schema/item_shares';
import { items } from '../schema/items';
import { protectedProcedure, router } from '../trpc';

export const itemSharesRouter = router({
  listForItem: protectedProcedure
    .input(
      z.object({
        itemId: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      const ownerRows = await db
        .select()
        .from(items)
        .where(and(eq(items.id, input.itemId), eq(items.userId, ctx.user.id)))
        .limit(1);
      if (ownerRows.length === 0) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only item owner can list shares' });
      }

      return db
        .select()
        .from(itemShares)
        .where(eq(itemShares.itemId, input.itemId));
    }),

  create: protectedProcedure
    .input(
      z.object({
        itemId: z.string(),
        email: z.email(),
        permission: z.enum(['view', 'edit']).default('view'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const normalizedEmail = input.email.trim().toLowerCase();

      const ownerRows = await db
        .select()
        .from(items)
        .where(and(eq(items.id, input.itemId), eq(items.userId, ctx.user.id)))
        .limit(1);
      if (ownerRows.length === 0) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only item owner can share this item' });
      }

      const existing = await db
        .select()
        .from(itemShares)
        .where(and(eq(itemShares.itemId, input.itemId), eq(itemShares.sharedWithEmail, normalizedEmail)))
        .limit(1);
      const current = existing[0];

      if (current) {
        await db
          .update(itemShares)
          .set({
            permission: input.permission,
            updatedAt: new Date(),
          })
          .where(eq(itemShares.id, current.id));
        return { success: true as const, id: current.id };
      }

      const newShare = {
        id: randomUUID(),
        itemId: input.itemId,
        ownerUserId: ctx.user.id,
        sharedWithEmail: normalizedEmail,
        permission: input.permission,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await db.insert(itemShares).values(newShare);
      return { success: true as const, id: newShare.id };
    }),

  revoke: protectedProcedure
    .input(
      z.object({
        shareId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const shareRows = await db.select().from(itemShares).where(eq(itemShares.id, input.shareId)).limit(1);
      const share = shareRows[0];
      if (!share) {
        return { success: true as const };
      }
      if (share.ownerUserId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only item owner can revoke this share' });
      }
      await db.delete(itemShares).where(eq(itemShares.id, input.shareId));
      return { success: true as const };
    }),

  sharedWithMe: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select()
      .from(itemShares)
      .where(eq(itemShares.sharedWithEmail, ctx.user.email.trim().toLowerCase()));
    if (rows.length === 0) return [];

    const sharedItemIds = rows.map((row) => row.itemId);
    const sharedItems = await db.select().from(items).where(inArray(items.id, sharedItemIds));

    const itemById = new Map(sharedItems.map((item) => [item.id, item]));
    return rows
      .map((share) => {
        const item = itemById.get(share.itemId);
        if (!item) return null;
        return {
          shareId: share.id,
          permission: share.permission,
          sharedAt: share.createdAt,
          item,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  }),
});
