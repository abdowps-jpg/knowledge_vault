import { TRPCError } from '@trpc/server';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { invokeLLM } from '../_core/llm';
import { items } from '../schema/items';
import { tags } from '../schema/tags';
import { protectedProcedure, router } from '../trpc';

const LLM_WINDOW_MS = 60 * 60_000;
const LLM_MAX_PER_WINDOW = 60;
const llmUsage = new Map<string, { count: number; resetAt: number }>();

function enforceLlmQuota(userId: string) {
  const now = Date.now();
  const entry = llmUsage.get(userId);
  if (!entry || now > entry.resetAt) {
    llmUsage.set(userId, { count: 1, resetAt: now + LLM_WINDOW_MS });
    return;
  }
  entry.count += 1;
  if (entry.count > LLM_MAX_PER_WINDOW) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: 'AI quota exceeded. Try again later.',
    });
  }
}

function extractContentText(title: string, content: string | null | undefined, url: string | null | undefined): string {
  const parts = [title.trim()];
  if (content && content.trim()) parts.push(content.trim());
  if (url && url.trim()) parts.push(`URL: ${url.trim()}`);
  const joined = parts.join('\n\n');
  return joined.length > 6000 ? `${joined.slice(0, 6000)}…` : joined;
}

async function loadItemForUser(itemId: string, userId: string) {
  const rows = await db
    .select()
    .from(items)
    .where(and(eq(items.id, itemId), eq(items.userId, userId), isNull(items.deletedAt)))
    .limit(1);
  const item = rows[0];
  if (!item) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Item not found' });
  }
  return item;
}

export const aiRouter = router({
  suggestTags: protectedProcedure
    .input(z.object({ itemId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      enforceLlmQuota(ctx.user.id);
      const item = await loadItemForUser(input.itemId, ctx.user.id);
      const existingTags = await db.select().from(tags).where(eq(tags.userId, ctx.user.id));
      const existingNames = existingTags.map((t) => t.name).slice(0, 200);

      const text = extractContentText(item.title, item.content, item.url);

      const result = await invokeLLM({
        messages: [
          {
            role: 'system',
            content:
              'You suggest concise, lowercase tags for personal knowledge items. ' +
              'Prefer reusing existing tags when relevant. Output 3–5 tags total. ' +
              'Each tag must be 1–3 words, lowercase, no punctuation except hyphens.',
          },
          {
            role: 'user',
            content: `Existing tags: ${existingNames.length ? existingNames.join(', ') : '(none)'}\n\nItem content:\n${text}`,
          },
        ],
        outputSchema: {
          name: 'tag_suggestions',
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              tags: {
                type: 'array',
                minItems: 1,
                maxItems: 5,
                items: { type: 'string', minLength: 1, maxLength: 40 },
              },
            },
            required: ['tags'],
          },
          strict: true,
        },
      });

      const raw = result.choices?.[0]?.message?.content ?? '';
      const body = typeof raw === 'string' ? raw : raw.map((p) => ('text' in p ? p.text : '')).join('');
      let parsed: { tags?: unknown } = {};
      try {
        parsed = JSON.parse(body);
      } catch {
        parsed = { tags: [] };
      }
      const suggestions = Array.isArray(parsed.tags)
        ? parsed.tags
            .filter((t): t is string => typeof t === 'string')
            .map((t) => t.trim().toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-'))
            .filter((t) => t.length > 0 && t.length <= 40)
            .slice(0, 5)
        : [];

      return { suggestions };
    }),

  search: protectedProcedure
    .input(z.object({ query: z.string().min(2).max(300), limit: z.number().int().min(1).max(20).default(10) }))
    .mutation(async ({ input, ctx }) => {
      enforceLlmQuota(ctx.user.id);

      const candidatePool = await db
        .select()
        .from(items)
        .where(and(eq(items.userId, ctx.user.id), isNull(items.deletedAt)))
        .orderBy(desc(items.updatedAt))
        .limit(200);

      if (candidatePool.length === 0) {
        return { results: [] as Array<{ id: string; title: string; reason: string }> };
      }

      const candidateLines = candidatePool
        .map((item) => {
          const title = (item.title ?? '').slice(0, 120).replace(/\s+/g, ' ');
          const snippet = (item.content ?? '').slice(0, 160).replace(/\s+/g, ' ');
          return `${item.id}\t${title}\t${snippet}`;
        })
        .join('\n');

      const result = await invokeLLM({
        messages: [
          {
            role: 'system',
            content:
              'You rank a user\'s personal knowledge items by semantic relevance to their query. ' +
              'Return only items genuinely relevant to the query. If none are relevant, return an empty array. ' +
              'Each line of the catalog is formatted as: <id>\\t<title>\\t<snippet>. ' +
              'Your output must reference only ids present in the catalog.',
          },
          {
            role: 'user',
            content: `Query: ${input.query}\n\nCatalog (tab-separated):\n${candidateLines}\n\nReturn at most ${input.limit} matches ordered most-relevant first.`,
          },
        ],
        outputSchema: {
          name: 'search_results',
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              matches: {
                type: 'array',
                maxItems: 20,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    id: { type: 'string', minLength: 1, maxLength: 100 },
                    reason: { type: 'string', minLength: 1, maxLength: 200 },
                  },
                  required: ['id', 'reason'],
                },
              },
            },
            required: ['matches'],
          },
          strict: true,
        },
      });

      const raw = result.choices?.[0]?.message?.content ?? '';
      const body = typeof raw === 'string' ? raw : raw.map((p) => ('text' in p ? p.text : '')).join('');
      let parsed: { matches?: Array<{ id?: unknown; reason?: unknown }> } = {};
      try {
        parsed = JSON.parse(body);
      } catch {
        parsed = { matches: [] };
      }

      const itemById = new Map(candidatePool.map((item) => [item.id, item]));
      const results: Array<{ id: string; title: string; reason: string }> = [];
      for (const match of parsed.matches ?? []) {
        const id = typeof match.id === 'string' ? match.id : null;
        const reason = typeof match.reason === 'string' ? match.reason.slice(0, 200) : '';
        if (!id) continue;
        const item = itemById.get(id);
        if (!item) continue;
        results.push({ id: item.id, title: item.title, reason });
        if (results.length >= input.limit) break;
      }

      return { results };
    }),

  summarize: protectedProcedure
    .input(z.object({ itemId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      enforceLlmQuota(ctx.user.id);
      const item = await loadItemForUser(input.itemId, ctx.user.id);
      const text = extractContentText(item.title, item.content, item.url);
      if (text.trim().length < 40) {
        return { summary: '' };
      }

      const result = await invokeLLM({
        messages: [
          {
            role: 'system',
            content:
              'Summarize the given content in 1–3 concise sentences. ' +
              'Focus on the key insight or main point. No preamble, no meta commentary.',
          },
          { role: 'user', content: text },
        ],
        outputSchema: {
          name: 'item_summary',
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              summary: { type: 'string', minLength: 1, maxLength: 600 },
            },
            required: ['summary'],
          },
          strict: true,
        },
      });

      const raw = result.choices?.[0]?.message?.content ?? '';
      const body = typeof raw === 'string' ? raw : raw.map((p) => ('text' in p ? p.text : '')).join('');
      let parsed: { summary?: unknown } = {};
      try {
        parsed = JSON.parse(body);
      } catch {
        parsed = { summary: '' };
      }
      const summary = typeof parsed.summary === 'string' ? parsed.summary.trim().slice(0, 600) : '';
      return { summary };
    }),
});
