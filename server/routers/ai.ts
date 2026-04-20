import { TRPCError } from '@trpc/server';
import { and, desc, eq, gte, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { invokeLLM } from '../_core/llm';
import { items } from '../schema/items';
import { journal } from '../schema/journal';
import { tags } from '../schema/tags';
import { tasks } from '../schema/tasks';
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

  relatedItems: protectedProcedure
    .input(z.object({ itemId: z.string(), limit: z.number().int().min(1).max(10).default(5) }))
    .mutation(async ({ input, ctx }) => {
      enforceLlmQuota(ctx.user.id);
      const source = await loadItemForUser(input.itemId, ctx.user.id);

      const pool = await db
        .select()
        .from(items)
        .where(and(eq(items.userId, ctx.user.id), isNull(items.deletedAt)))
        .orderBy(desc(items.updatedAt))
        .limit(200);

      const candidates = pool.filter((it) => it.id !== source.id);
      if (candidates.length === 0) {
        return { related: [] as { id: string; title: string; reason: string }[] };
      }

      const sourceText = extractContentText(source.title, source.content, source.url);
      const catalog = candidates
        .map((c) => {
          const title = (c.title ?? '').slice(0, 120).replace(/\s+/g, ' ');
          const snippet = (c.content ?? '').slice(0, 140).replace(/\s+/g, ' ');
          return `${c.id}\t${title}\t${snippet}`;
        })
        .join('\n');

      const result = await invokeLLM({
        messages: [
          {
            role: 'system',
            content:
              'You find the most relevant knowledge items related to a source item. ' +
              'Prefer conceptual relatedness (same topic, same problem, followups) over surface word overlap. ' +
              'Catalog lines are tab-separated: <id>\\t<title>\\t<snippet>. ' +
              'Return only ids present in the catalog. If nothing is genuinely related, return an empty array.',
          },
          {
            role: 'user',
            content: `Source item:\n${sourceText}\n\nCatalog (tab-separated):\n${catalog}\n\nReturn at most ${input.limit} related items with a one-line reason.`,
          },
        ],
        outputSchema: {
          name: 'related_items',
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              related: {
                type: 'array',
                maxItems: 10,
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
            required: ['related'],
          },
          strict: true,
        },
      });

      const raw = result.choices?.[0]?.message?.content ?? '';
      const body = typeof raw === 'string' ? raw : raw.map((p) => ('text' in p ? p.text : '')).join('');
      let parsed: { related?: { id?: unknown; reason?: unknown }[] } = {};
      try {
        parsed = JSON.parse(body);
      } catch {
        parsed = { related: [] };
      }
      const byId = new Map(candidates.map((c) => [c.id, c]));
      const out: { id: string; title: string; reason: string }[] = [];
      for (const r of parsed.related ?? []) {
        const id = typeof r.id === 'string' ? r.id : null;
        const reason = typeof r.reason === 'string' ? r.reason.slice(0, 200) : '';
        if (!id) continue;
        const item = byId.get(id);
        if (!item) continue;
        out.push({ id: item.id, title: item.title, reason });
        if (out.length >= input.limit) break;
      }
      return { related: out };
    }),

  dailyDigest: protectedProcedure.mutation(async ({ ctx }) => {
    enforceLlmQuota(ctx.user.id);

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [todayItems, todayTasks, todayJournal] = await Promise.all([
      db
        .select()
        .from(items)
        .where(and(eq(items.userId, ctx.user.id), isNull(items.deletedAt), gte(items.createdAt, startOfDay)))
        .orderBy(desc(items.createdAt))
        .limit(50),
      db
        .select()
        .from(tasks)
        .where(and(eq(tasks.userId, ctx.user.id), isNull(tasks.deletedAt), gte(tasks.createdAt, startOfDay)))
        .orderBy(desc(tasks.createdAt))
        .limit(50),
      db
        .select()
        .from(journal)
        .where(and(eq(journal.userId, ctx.user.id), isNull(journal.deletedAt), gte(journal.createdAt, startOfDay)))
        .orderBy(desc(journal.createdAt))
        .limit(10),
    ]);

    const totalCount = todayItems.length + todayTasks.length + todayJournal.length;
    if (totalCount === 0) {
      return {
        digest: '',
        highlights: [] as string[],
        suggestions: [] as string[],
        counts: { items: 0, tasks: 0, journal: 0 },
      };
    }

    const itemLines = todayItems
      .slice(0, 30)
      .map((it) => `- [${it.type}] ${it.title}${it.content ? `: ${it.content.slice(0, 120).replace(/\s+/g, ' ')}` : ''}`)
      .join('\n');
    const taskLines = todayTasks
      .slice(0, 30)
      .map((t) => `- ${t.isCompleted ? '✓' : '○'} ${t.title}`)
      .join('\n');
    const journalLines = todayJournal
      .slice(0, 5)
      .map((j) => `- ${j.title ?? '(untitled)'}: ${(j.content ?? '').slice(0, 200).replace(/\s+/g, ' ')}`)
      .join('\n');

    const result = await invokeLLM({
      messages: [
        {
          role: 'system',
          content:
            "You write a tight daily digest for a knowledge-worker's personal vault. " +
            'Output: a 2-3 sentence overview of the day, 3-5 short highlight bullets, ' +
            'and 2-4 concrete suggestions for tomorrow (follow-up tasks, gaps to fill, ' +
            'connections to make). No preamble, no meta commentary. Direct, useful prose.',
        },
        {
          role: 'user',
          content:
            `Items captured today (${todayItems.length}):\n${itemLines || '(none)'}\n\n` +
            `Tasks today (${todayTasks.length}):\n${taskLines || '(none)'}\n\n` +
            `Journal entries today (${todayJournal.length}):\n${journalLines || '(none)'}`,
        },
      ],
      outputSchema: {
        name: 'daily_digest',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            digest: { type: 'string', minLength: 1, maxLength: 600 },
            highlights: {
              type: 'array',
              minItems: 0,
              maxItems: 5,
              items: { type: 'string', minLength: 1, maxLength: 200 },
            },
            suggestions: {
              type: 'array',
              minItems: 0,
              maxItems: 4,
              items: { type: 'string', minLength: 1, maxLength: 200 },
            },
          },
          required: ['digest', 'highlights', 'suggestions'],
        },
        strict: true,
      },
    });

    const raw = result.choices?.[0]?.message?.content ?? '';
    const body = typeof raw === 'string' ? raw : raw.map((p) => ('text' in p ? p.text : '')).join('');
    let parsed: { digest?: unknown; highlights?: unknown; suggestions?: unknown } = {};
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = {};
    }

    const digest = typeof parsed.digest === 'string' ? parsed.digest.trim().slice(0, 600) : '';
    const highlights = Array.isArray(parsed.highlights)
      ? parsed.highlights
          .filter((h): h is string => typeof h === 'string')
          .map((h) => h.trim().slice(0, 200))
          .filter(Boolean)
          .slice(0, 5)
      : [];
    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions
          .filter((s): s is string => typeof s === 'string')
          .map((s) => s.trim().slice(0, 200))
          .filter(Boolean)
          .slice(0, 4)
      : [];

    return {
      digest,
      highlights,
      suggestions,
      counts: {
        items: todayItems.length,
        tasks: todayTasks.length,
        journal: todayJournal.length,
      },
    };
  }),
});
