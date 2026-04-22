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
        scope: apiKeys.scope,
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
        scope: z.enum(['read', 'write', 'admin']).default('write'),
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
        scope: input.scope,
        isActive: true,
        createdAt: new Date(),
        lastUsedAt: null,
      });

      return { key: rawKey, keyPreview, scope: input.scope };
    }),

  regenerateKey: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const rows = await db
        .select()
        .from(apiKeys)
        .where(and(eq(apiKeys.id, input.id), eq(apiKeys.userId, ctx.user.id)))
        .limit(1);
      const key = rows[0];
      if (!key) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Key not found' });
      }
      const rawKey = `kv_${randomBytes(24).toString('hex')}`;
      const keyHash = hashApiKey(rawKey);
      const keyPreview = `${rawKey.slice(0, 6)}...${rawKey.slice(-4)}`;
      await db
        .update(apiKeys)
        .set({
          keyHash,
          keyPreview,
          isActive: true,
          lastUsedAt: null,
        })
        .where(eq(apiKeys.id, input.id));
      return { key: rawKey, keyPreview, scope: key.scope };
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

  verifyWebhookUrl: protectedProcedure
    .input(z.object({ url: z.url() }))
    .mutation(async ({ input }) => {
      try {
        const urlObj = new URL(input.url);
        // SSRF-lite: block private / loopback
        const host = urlObj.hostname.toLowerCase();
        const isBlocked =
          host === 'localhost' ||
          /^127\./.test(host) ||
          /^10\./.test(host) ||
          /^169\.254\./.test(host) ||
          /^192\.168\./.test(host) ||
          /^172\.(1[6-9]|2\d|3[01])\./.test(host);
        if (isBlocked) {
          return { reachable: false, status: 0, error: 'private_host_blocked' };
        }
        const response = await fetch(input.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-kv-test': 'preflight' },
          body: JSON.stringify({ event: 'test.preflight', timestamp: new Date().toISOString() }),
          signal: AbortSignal.timeout(5000),
        });
        return { reachable: true, status: response.status, error: null };
      } catch (err: any) {
        return { reachable: false, status: 0, error: err?.message ?? 'fetch_failed' };
      }
    }),

  availableWebhookEvents: protectedProcedure.query(() => {
    return [
      { id: 'items.created', label: 'Item created', description: 'A new note/link/quote/audio was saved.' },
      { id: 'items.updated', label: 'Item updated', description: 'Title, content, or metadata changed.' },
      { id: 'items.deleted', label: 'Item deleted', description: 'Item permanently removed.' },
      { id: 'tasks.created', label: 'Task created', description: 'A new task was created.' },
      { id: 'tasks.updated', label: 'Task updated', description: 'Task title, completion state, or due date changed.' },
      { id: 'tasks.deleted', label: 'Task deleted', description: 'Task permanently removed.' },
    ];
  }),

  testWebhook: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const rows = await db
        .select()
        .from(webhookSubscriptions)
        .where(and(eq(webhookSubscriptions.id, input.id), eq(webhookSubscriptions.userId, ctx.user.id)))
        .limit(1);
      const hook = rows[0];
      if (!hook) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Webhook not found' });
      }
      try {
        const timestamp = String(Math.floor(Date.now() / 1000));
        const { createHmac } = await import('crypto');
        const body = JSON.stringify({
          event: 'test.ping',
          timestamp: new Date().toISOString(),
          data: { message: 'Test delivery from Knowledge Vault' },
        });
        const signature = hook.secret ? createHmac('sha256', hook.secret).update(`${timestamp}.${body}`).digest('hex') : null;
        const headers: Record<string, string> = {
          'content-type': 'application/json',
          'x-kv-webhook-id': hook.id,
          'x-kv-timestamp': timestamp,
          'x-kv-test': 'true',
        };
        if (signature) headers['x-kv-signature'] = `sha256=${signature}`;

        const response = await fetch(hook.url, {
          method: 'POST',
          headers,
          body,
          signal: AbortSignal.timeout(10_000),
        });
        await db
          .update(webhookSubscriptions)
          .set({ lastDeliveredAt: new Date(), lastStatus: response.status })
          .where(eq(webhookSubscriptions.id, hook.id));
        return { success: response.ok, status: response.status };
      } catch (err: any) {
        return { success: false, status: 0, error: err?.message ?? 'fetch_failed' };
      }
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
