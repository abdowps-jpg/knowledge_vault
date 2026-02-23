import { createHash, randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { db } from '../db';
import { items } from '../schema/items';
import { publicLinks } from '../schema/public_links';
import { users } from '../schema/users';
import { protectedProcedure, publicProcedure, router } from '../trpc';

function normalizePassword(password?: string): string | null {
  if (!password) return null;
  const trimmed = password.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

export const publicLinksRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        itemId: z.string(),
        expiresInDays: z.number().int().min(1).max(365).optional(),
        password: z.string().min(4).max(128).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const ownerRows = await db
        .select()
        .from(items)
        .where(and(eq(items.id, input.itemId), eq(items.userId, ctx.user.id)))
        .limit(1);
      if (ownerRows.length === 0) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only item owner can create public links' });
      }

      const normalizedPassword = normalizePassword(input.password);
      const linkId = randomUUID();
      const token = randomUUID().replace(/-/g, '');
      const expiresAt =
        typeof input.expiresInDays === 'number'
          ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
          : null;

      await db.insert(publicLinks).values({
        id: linkId,
        token,
        itemId: input.itemId,
        ownerUserId: ctx.user.id,
        passwordHash: normalizedPassword ? hashPassword(normalizedPassword) : null,
        expiresAt,
        isRevoked: false,
        createdAt: new Date(),
      });

      return {
        success: true as const,
        id: linkId,
        token,
        urlPath: `/public/${token}`,
      };
    }),

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
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only item owner can list links' });
      }

      return db.select().from(publicLinks).where(eq(publicLinks.itemId, input.itemId));
    }),

  revoke: protectedProcedure
    .input(
      z.object({
        linkId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const linkRows = await db.select().from(publicLinks).where(eq(publicLinks.id, input.linkId)).limit(1);
      const link = linkRows[0];
      if (!link) return { success: true as const };
      if (link.ownerUserId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only owner can revoke this link' });
      }

      await db.update(publicLinks).set({ isRevoked: true }).where(eq(publicLinks.id, input.linkId));
      return { success: true as const };
    }),

  getPublic: publicProcedure
    .input(
      z.object({
        token: z.string().min(8),
        password: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const linkRows = await db.select().from(publicLinks).where(eq(publicLinks.token, input.token)).limit(1);
      const link = linkRows[0];
      if (!link || link.isRevoked) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Public link not found' });
      }
      if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Public link has expired' });
      }
      if (link.passwordHash) {
        const incomingPassword = normalizePassword(input.password);
        if (!incomingPassword) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Password required' });
        }
        if (hashPassword(incomingPassword) !== link.passwordHash) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid password' });
        }
      }

      const itemRows = await db.select().from(items).where(eq(items.id, link.itemId)).limit(1);
      const item = itemRows[0];
      if (!item) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Item not found' });
      }

      const ownerRows = await db.select().from(users).where(eq(users.id, link.ownerUserId)).limit(1);
      const owner = ownerRows[0];

      return {
        item: {
          id: item.id,
          type: item.type,
          title: item.title,
          content: item.content,
          url: item.url,
          createdAt: item.createdAt,
        },
        owner: {
          username: owner?.username ?? null,
          email: owner?.email ?? null,
        },
        protected: Boolean(link.passwordHash),
        expiresAt: link.expiresAt,
      };
    }),
});
