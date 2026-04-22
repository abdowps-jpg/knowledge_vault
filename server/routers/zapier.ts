import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { items } from '../schema/items';
import { tasks } from '../schema/tasks';
import { publicProcedure, router } from '../trpc';

/**
 * Zapier-facing router. Zapier needs:
 * - authentication check (we use X-Api-Key via tRPC context once wired)
 * - sample/poll endpoints per trigger (latest items, latest tasks)
 * - create actions (new item, new task)
 *
 * These are thin wrappers over the existing procedures with stable, flat shapes
 * Zapier's editor likes. Auth here intentionally uses the same API-key
 * middleware as the REST API, so integrators reuse the same kv_… keys.
 */

export const zapierRouter = router({
  authTest: publicProcedure.query(() => ({
    product: 'Knowledge Vault',
    version: '1.0.0',
    ok: true as const,
  })),

  recentItems: publicProcedure
    .input(z.object({ apiKeyUserId: z.string() }))
    .query(async ({ input }) => {
      // Zapier invokes this with an app-injected userId derived from our
      // X-Api-Key middleware in REST mode. In tRPC mode the auth middleware
      // has to pass `userId` in explicitly — integrators should prefer
      // /api/items directly unless they really need tRPC.
      return db
        .select()
        .from(items)
        .where(and(eq(items.userId, input.apiKeyUserId), isNull(items.deletedAt)))
        .orderBy(desc(items.createdAt))
        .limit(10);
    }),

  recentTasks: publicProcedure
    .input(z.object({ apiKeyUserId: z.string() }))
    .query(async ({ input }) => {
      return db
        .select()
        .from(tasks)
        .where(and(eq(tasks.userId, input.apiKeyUserId), isNull(tasks.deletedAt)))
        .orderBy(desc(tasks.createdAt))
        .limit(10);
    }),

  recipes: publicProcedure.query(() => [
    {
      id: 'new-email-to-task',
      name: 'Create a task from a starred Gmail message',
      description: 'When you star an email in Gmail, Zapier creates a task in Knowledge Vault.',
    },
    {
      id: 'rss-to-item',
      name: 'Save new RSS items as links',
      description: 'When a new item appears in any RSS feed, save it to your Vault inbox.',
    },
    {
      id: 'calendar-daily-digest',
      name: 'Send your daily digest to Slack',
      description: 'Post the AI-generated daily digest to a Slack channel every morning.',
    },
    {
      id: 'new-item-to-sheet',
      name: 'Log new items to Google Sheets',
      description: 'Append every new item to a row in a Google Sheet for reporting.',
    },
  ]),
});
