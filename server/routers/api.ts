import { createHash, randomBytes, randomUUID } from 'crypto';
import { and, count, desc, eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { db } from '../db';
import { apiKeys, webhookSubscriptions } from '../schema/api_keys';
import { protectedProcedure, router } from '../trpc';

function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

export const apiRouter = router({
  listKeys: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPreview: apiKeys.keyPreview,
        isActive: apiKeys.isActive,
        createdAt: apiKeys.createdAt,
        lastUsedAt: apiKeys.lastUsedAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.userId, ctx.user.id))
      .orderBy(desc(apiKeys.createdAt));
    return rows;
  }),

  generateKey: protectedProcedure
    .input(
      z.object({
        name: z.string().min(2).max(80).default('Default key'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const [countRow] = await db
        .select({ total: count() })
        .from(apiKeys)
        .where(and(eq(apiKeys.userId, ctx.user.id), eq(apiKeys.isActive, true)));
      if ((countRow?.total ?? 0) >= 10) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Maximum of 10 active API keys allowed.' });
      }

      const rawKey = `kv_${randomBytes(24).toString('hex')}`;
      const keyHash = hashApiKey(rawKey);
      const keyPreview = `${rawKey.slice(0, 6)}...${rawKey.slice(-4)}`;

      await db.insert(apiKeys).values({
        id: randomUUID(),
        userId: ctx.user.id,
        name: input.name.trim(),
        keyHash,
        keyPreview,
        isActive: true,
        createdAt: new Date(),
        lastUsedAt: null,
      });

      return { key: rawKey, keyPreview };
    }),

  revokeKey: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await db
        .update(apiKeys)
        .set({ isActive: false })
        .where(and(eq(apiKeys.id, input.id), eq(apiKeys.userId, ctx.user.id)));
      return { success: true as const };
    }),

  listWebhooks: protectedProcedure.query(async ({ ctx }) => {
    return db
      .select()
      .from(webhookSubscriptions)
      .where(eq(webhookSubscriptions.userId, ctx.user.id))
      .orderBy(desc(webhookSubscriptions.createdAt));
  }),

  createWebhook: protectedProcedure
    .input(
      z.object({
        url: z.url(),
        event: z.enum(['items.created', 'items.updated', 'items.deleted', 'tasks.created', 'tasks.updated', 'tasks.deleted']),
        secret: z.string().min(4).max(120).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const [wCountRow] = await db
        .select({ total: count() })
        .from(webhookSubscriptions)
        .where(and(eq(webhookSubscriptions.userId, ctx.user.id), eq(webhookSubscriptions.isActive, true)));
      if ((wCountRow?.total ?? 0) >= 20) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Maximum of 20 active webhooks allowed.' });
      }

      const newWebhook = {
        id: randomUUID(),
        userId: ctx.user.id,
        url: input.url.trim(),
        event: input.event,
        secret: input.secret?.trim() || null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await db.insert(webhookSubscriptions).values(newWebhook);
      return { success: true as const, id: newWebhook.id };
    }),

  deleteWebhook: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await db
        .delete(webhookSubscriptions)
        .where(and(eq(webhookSubscriptions.id, input.id), eq(webhookSubscriptions.userId, ctx.user.id)));
      return { success: true as const };
    }),
});

export function buildApiKeyHash(rawKey: string): string {
  return hashApiKey(rawKey);
}
