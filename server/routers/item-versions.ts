import { randomUUID } from 'crypto';
import { and, desc, eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { db } from '../db';
import { ensureItemAccess, getItemAccessById } from '../lib/item-access';
import { items } from '../schema/items';
import { itemVersions } from '../schema/item_versions';
import { protectedProcedure, router } from '../trpc';

export const itemVersionsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        itemId: z.string(),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ input, ctx }) => {
      const access = await getItemAccessById({
        itemId: input.itemId,
        userId: ctx.user.id,
        userEmail: ctx.user.email,
      });
      ensureItemAccess(access, 'view');

      return db
        .select()
        .from(itemVersions)
        .where(eq(itemVersions.itemId, input.itemId))
        .orderBy(desc(itemVersions.createdAt))
        .limit(input.limit);
    }),

  restore: protectedProcedure
    .input(
      z.object({
        versionId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const versionRows = await db.select().from(itemVersions).where(eq(itemVersions.id, input.versionId)).limit(1);
      const version = versionRows[0];
      if (!version) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Version not found' });
      }
      const access = await getItemAccessById({
        itemId: version.itemId,
        userId: ctx.user.id,
        userEmail: ctx.user.email,
      });
      ensureItemAccess(access, 'edit');

      const currentRows = await db.select().from(items).where(eq(items.id, version.itemId)).limit(1);
      const current = currentRows[0];
      if (current) {
        await db.insert(itemVersions).values({
          id: randomUUID(),
          itemId: current.id,
          userId: current.userId,
          title: current.title,
          content: current.content,
          createdAt: new Date(),
        });
      }

      await db
        .update(items)
        .set({
          title: version.title,
          content: version.content ?? '',
          updatedAt: new Date(),
        })
        .where(and(eq(items.id, version.itemId), eq(items.userId, ctx.user.id)));

      return { success: true as const, itemId: version.itemId };
    }),

  compare: protectedProcedure
    .input(z.object({ itemId: z.string(), versionId: z.string() }))
    .query(async ({ input, ctx }) => {
      const access = await getItemAccessById({
        itemId: input.itemId,
        userId: ctx.user.id,
        userEmail: ctx.user.email,
      });
      ensureItemAccess(access, 'view');

      const [currentRows, versionRows] = await Promise.all([
        db.select().from(items).where(eq(items.id, input.itemId)).limit(1),
        db.select().from(itemVersions).where(eq(itemVersions.id, input.versionId)).limit(1),
      ]);
      const current = currentRows[0];
      const version = versionRows[0];
      if (!current || !version || version.itemId !== input.itemId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Version or item not found' });
      }

      // Cheap line-level diff: mark lines added/removed/unchanged
      const a = (version.content ?? '').split('\n');
      const b = (current.content ?? '').split('\n');
      const maxLines = 500;
      const lines: { kind: 'same' | 'added' | 'removed'; text: string }[] = [];
      const aSet = new Set(a);
      const bSet = new Set(b);

      for (const line of b.slice(0, maxLines)) {
        if (aSet.has(line)) lines.push({ kind: 'same', text: line });
        else lines.push({ kind: 'added', text: line });
      }
      for (const line of a.slice(0, maxLines)) {
        if (!bSet.has(line)) lines.push({ kind: 'removed', text: line });
      }

      return {
        titleBefore: version.title,
        titleAfter: current.title,
        titleChanged: version.title !== current.title,
        diffLines: lines,
      };
    }),
});
