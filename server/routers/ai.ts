import { TRPCError } from '@trpc/server';
import { and, desc, eq, gte, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { invokeLLM } from '../_core/llm';
import { recordAudit } from '../lib/audit';
import { categories } from '../schema/categories';
import { items } from '../schema/items';
import { journal } from '../schema/journal';
import { tags } from '../schema/tags';
import { tasks } from '../schema/tasks';
import { protectedProcedure, router } from '../trpc';

function logAiCall(userId: string, action: string, resourceId?: string) {
  recordAudit({ userId }, `ai.${action}`, resourceId ? { kind: 'item', id: resourceId } : undefined).catch(() => {});
}

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

function quotaSnapshot(userId: string) {
  const now = Date.now();
  const entry = llmUsage.get(userId);
  if (!entry || now > entry.resetAt) {
    return {
      used: 0,
      max: LLM_MAX_PER_WINDOW,
      remaining: LLM_MAX_PER_WINDOW,
      resetAt: null as string | null,
    };
  }
  return {
    used: entry.count,
    max: LLM_MAX_PER_WINDOW,
    remaining: Math.max(0, LLM_MAX_PER_WINDOW - entry.count),
    resetAt: new Date(entry.resetAt).toISOString(),
  };
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
  quota: protectedProcedure.query(({ ctx }) => quotaSnapshot(ctx.user.id)),

  suggestTags: protectedProcedure
    .input(z.object({ itemId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      enforceLlmQuota(ctx.user.id);
      logAiCall(ctx.user.id, 'suggestTags', input.itemId);
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
      logAiCall(ctx.user.id, 'search');

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
      logAiCall(ctx.user.id, 'summarize', input.itemId);
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

  expand: protectedProcedure
    .input(
      z.object({
        itemId: z.string(),
        tone: z.enum(['neutral', 'concise', 'detailed']).default('neutral'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      enforceLlmQuota(ctx.user.id);
      logAiCall(ctx.user.id, 'expand', input.itemId);
      const item = await loadItemForUser(input.itemId, ctx.user.id);
      const text = extractContentText(item.title, item.content, item.url);
      if (text.trim().length < 5) {
        return { expanded: '' };
      }

      const toneInstruction: Record<typeof input.tone, string> = {
        neutral: 'Keep a natural, factual tone.',
        concise: 'Be tight and punchy. No filler.',
        detailed: 'Expand fully with context, reasoning, and relevant caveats.',
      };

      const result = await invokeLLM({
        messages: [
          {
            role: 'system',
            content:
              'You expand a user\'s short note into clear, well-structured prose. ' +
              'Preserve the original meaning and voice — do not invent facts. ' +
              'Output plain markdown (paragraphs, bullet lists where natural). ' +
              'No preamble, no meta commentary, no headings unless the input had structure. ' +
              `${toneInstruction[input.tone]}`,
          },
          { role: 'user', content: text },
        ],
        outputSchema: {
          name: 'expanded_note',
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              expanded: { type: 'string', minLength: 1, maxLength: 4000 },
            },
            required: ['expanded'],
          },
          strict: true,
        },
      });

      const raw = result.choices?.[0]?.message?.content ?? '';
      const body = typeof raw === 'string' ? raw : raw.map((p) => ('text' in p ? p.text : '')).join('');
      let parsed: { expanded?: unknown } = {};
      try {
        parsed = JSON.parse(body);
      } catch {
        parsed = { expanded: '' };
      }
      const expanded = typeof parsed.expanded === 'string' ? parsed.expanded.trim().slice(0, 4000) : '';
      return { expanded };
    }),

  extractTasks: protectedProcedure
    .input(z.object({ itemId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      enforceLlmQuota(ctx.user.id);
      logAiCall(ctx.user.id, 'extractTasks', input.itemId);
      const item = await loadItemForUser(input.itemId, ctx.user.id);
      const text = extractContentText(item.title, item.content, item.url);
      if (text.trim().length < 30) {
        return { tasks: [] as { title: string; priority: 'low' | 'medium' | 'high' }[] };
      }

      const result = await invokeLLM({
        messages: [
          {
            role: 'system',
            content:
              'Extract concrete action items from the given content. ' +
              'Return 0-8 tasks, each with a short imperative title (e.g. "Email X", "Research Y") ' +
              'and a priority estimate (low/medium/high). Skip vague ideas that are not actionable. ' +
              'If the content has no real actions, return an empty list.',
          },
          { role: 'user', content: text },
        ],
        outputSchema: {
          name: 'extracted_tasks',
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              tasks: {
                type: 'array',
                minItems: 0,
                maxItems: 8,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    title: { type: 'string', minLength: 1, maxLength: 200 },
                    priority: { type: 'string', enum: ['low', 'medium', 'high'] },
                  },
                  required: ['title', 'priority'],
                },
              },
            },
            required: ['tasks'],
          },
          strict: true,
        },
      });

      const raw = result.choices?.[0]?.message?.content ?? '';
      const body = typeof raw === 'string' ? raw : raw.map((p) => ('text' in p ? p.text : '')).join('');
      let parsed: { tasks?: { title?: unknown; priority?: unknown }[] } = {};
      try {
        parsed = JSON.parse(body);
      } catch {
        parsed = { tasks: [] };
      }
      const out: { title: string; priority: 'low' | 'medium' | 'high' }[] = [];
      for (const t of parsed.tasks ?? []) {
        const title = typeof t.title === 'string' ? t.title.trim().slice(0, 200) : '';
        const p = typeof t.priority === 'string' && ['low', 'medium', 'high'].includes(t.priority)
          ? (t.priority as 'low' | 'medium' | 'high')
          : 'medium';
        if (title) out.push({ title, priority: p });
        if (out.length >= 8) break;
      }
      return { tasks: out };
    }),

  askVault: protectedProcedure
    .input(z.object({ question: z.string().min(3).max(500) }))
    .mutation(async ({ input, ctx }) => {
      enforceLlmQuota(ctx.user.id);
      logAiCall(ctx.user.id, 'askVault');

      // Fetch top-200 most recently updated items and keyword-prefilter
      const pool = await db
        .select()
        .from(items)
        .where(and(eq(items.userId, ctx.user.id), isNull(items.deletedAt)))
        .orderBy(desc(items.updatedAt))
        .limit(200);

      if (pool.length === 0) {
        return { answer: 'You have no items yet.', citations: [] as { id: string; title: string }[] };
      }

      const context = pool
        .slice(0, 40)
        .map((it) => {
          const title = (it.title ?? '').slice(0, 120).replace(/\s+/g, ' ');
          const snippet = (it.content ?? '').slice(0, 300).replace(/\s+/g, ' ');
          return `[${it.id}] ${title}\n${snippet}`;
        })
        .join('\n\n');

      const result = await invokeLLM({
        messages: [
          {
            role: 'system',
            content:
              'Answer the user\'s question using ONLY the catalog of their own items below. ' +
              'Every factual claim should cite item ids in square brackets like [id]. ' +
              'If the catalog does not contain an answer, say so plainly — do not fabricate. ' +
              'Keep the answer to 1-4 short paragraphs.',
          },
          {
            role: 'user',
            content: `Question: ${input.question}\n\nCatalog:\n${context}`,
          },
        ],
        outputSchema: {
          name: 'vault_answer',
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              answer: { type: 'string', minLength: 1, maxLength: 3000 },
              citedIds: {
                type: 'array',
                maxItems: 10,
                items: { type: 'string', minLength: 1, maxLength: 100 },
              },
            },
            required: ['answer', 'citedIds'],
          },
          strict: true,
        },
      });

      const raw = result.choices?.[0]?.message?.content ?? '';
      const body = typeof raw === 'string' ? raw : raw.map((p) => ('text' in p ? p.text : '')).join('');
      let parsed: { answer?: unknown; citedIds?: unknown } = {};
      try {
        parsed = JSON.parse(body);
      } catch {
        parsed = {};
      }
      const answer = typeof parsed.answer === 'string' ? parsed.answer.trim().slice(0, 3000) : '';
      const itemById = new Map(pool.map((i) => [i.id, i.title]));
      const citations: { id: string; title: string }[] = [];
      if (Array.isArray(parsed.citedIds)) {
        for (const id of parsed.citedIds) {
          if (typeof id !== 'string') continue;
          const title = itemById.get(id);
          if (!title) continue;
          citations.push({ id, title });
          if (citations.length >= 10) break;
        }
      }
      return { answer, citations };
    }),

  proofread: protectedProcedure
    .input(z.object({ itemId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      enforceLlmQuota(ctx.user.id);
      logAiCall(ctx.user.id, 'proofread', input.itemId);
      const item = await loadItemForUser(input.itemId, ctx.user.id);
      const text = extractContentText(item.title, item.content, item.url);
      if (text.trim().length < 10) {
        return { cleaned: '', changes: [] as string[] };
      }
      const result = await invokeLLM({
        messages: [
          {
            role: 'system',
            content:
              'Proofread the given text. Fix grammar, typos, punctuation, and unclear phrasing. ' +
              'Preserve the author\'s voice, meaning, structure, and markdown formatting. ' +
              'Do not add new ideas or facts. Return the corrected text plus a short list of the ' +
              'notable changes made.',
          },
          { role: 'user', content: text },
        ],
        outputSchema: {
          name: 'proofread_result',
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              cleaned: { type: 'string', minLength: 1, maxLength: 8000 },
              changes: {
                type: 'array',
                maxItems: 5,
                items: { type: 'string', minLength: 1, maxLength: 200 },
              },
            },
            required: ['cleaned', 'changes'],
          },
          strict: true,
        },
      });
      const raw = result.choices?.[0]?.message?.content ?? '';
      const body = typeof raw === 'string' ? raw : raw.map((p) => ('text' in p ? p.text : '')).join('');
      let parsed: { cleaned?: unknown; changes?: unknown } = {};
      try {
        parsed = JSON.parse(body);
      } catch {
        parsed = {};
      }
      const cleaned = typeof parsed.cleaned === 'string' ? parsed.cleaned.trim().slice(0, 8000) : '';
      const changes = Array.isArray(parsed.changes)
        ? parsed.changes
            .filter((c): c is string => typeof c === 'string')
            .map((c) => c.trim().slice(0, 200))
            .filter(Boolean)
            .slice(0, 5)
        : [];
      return { cleaned, changes };
    }),

  translate: protectedProcedure
    .input(
      z.object({
        itemId: z.string(),
        targetLanguage: z.enum(['en', 'ar', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'zh']),
      })
    )
    .mutation(async ({ input, ctx }) => {
      enforceLlmQuota(ctx.user.id);
      logAiCall(ctx.user.id, 'translate', input.itemId);
      const item = await loadItemForUser(input.itemId, ctx.user.id);
      const text = extractContentText(item.title, item.content, item.url);
      if (text.trim().length < 5) {
        return { translated: '' };
      }
      const langNames: Record<string, string> = {
        en: 'English', ar: 'Arabic', es: 'Spanish', fr: 'French',
        de: 'German', it: 'Italian', pt: 'Portuguese', ja: 'Japanese', zh: 'Chinese',
      };
      const result = await invokeLLM({
        messages: [
          {
            role: 'system',
            content:
              `Translate the given text to ${langNames[input.targetLanguage]}. ` +
              'Preserve meaning, tone, and formatting (markdown). ' +
              'Keep code blocks, URLs, and proper nouns unchanged. ' +
              'Return only the translation, no preamble.',
          },
          { role: 'user', content: text },
        ],
        outputSchema: {
          name: 'translation',
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: { translated: { type: 'string', minLength: 1, maxLength: 8000 } },
            required: ['translated'],
          },
          strict: true,
        },
      });
      const raw = result.choices?.[0]?.message?.content ?? '';
      const body = typeof raw === 'string' ? raw : raw.map((p) => ('text' in p ? p.text : '')).join('');
      let parsed: { translated?: unknown } = {};
      try {
        parsed = JSON.parse(body);
      } catch {
        parsed = {};
      }
      const translated = typeof parsed.translated === 'string' ? parsed.translated.trim().slice(0, 8000) : '';
      return { translated };
    }),

  categorize: protectedProcedure
    .input(z.object({ itemId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      enforceLlmQuota(ctx.user.id);
      logAiCall(ctx.user.id, 'categorize', input.itemId);
      const item = await loadItemForUser(input.itemId, ctx.user.id);
      const cats = await db.select().from(categories).where(eq(categories.userId, ctx.user.id));
      if (cats.length === 0) {
        return { suggestion: null as { id: string; name: string; reason: string } | null };
      }
      const catList = cats.map((c) => `${c.id}\t${c.name}`).join('\n');
      const text = extractContentText(item.title, item.content, item.url);

      const result = await invokeLLM({
        messages: [
          {
            role: 'system',
            content:
              'You pick the single best-fitting category for a knowledge item from the user\'s existing categories. ' +
              'If nothing fits well, return an empty id. Use only ids present in the catalog.',
          },
          {
            role: 'user',
            content: `Categories (tab-separated id\\tname):\n${catList}\n\nItem:\n${text}`,
          },
        ],
        outputSchema: {
          name: 'category_suggestion',
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              id: { type: 'string', maxLength: 100 },
              reason: { type: 'string', maxLength: 200 },
            },
            required: ['id', 'reason'],
          },
          strict: true,
        },
      });

      const raw = result.choices?.[0]?.message?.content ?? '';
      const body = typeof raw === 'string' ? raw : raw.map((p) => ('text' in p ? p.text : '')).join('');
      let parsed: { id?: unknown; reason?: unknown } = {};
      try {
        parsed = JSON.parse(body);
      } catch {
        parsed = {};
      }
      const id = typeof parsed.id === 'string' ? parsed.id.trim() : '';
      const reason = typeof parsed.reason === 'string' ? parsed.reason.trim().slice(0, 200) : '';
      if (!id) return { suggestion: null };
      const match = cats.find((c) => c.id === id);
      if (!match) return { suggestion: null };
      return { suggestion: { id: match.id, name: match.name, reason } };
    }),

  quickActions: protectedProcedure
    .input(z.object({ itemId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      enforceLlmQuota(ctx.user.id);
      logAiCall(ctx.user.id, 'quickActions', input.itemId);
      const item = await loadItemForUser(input.itemId, ctx.user.id);
      const text = extractContentText(item.title, item.content, item.url);
      if (text.trim().length < 20) {
        return { actions: [] as { kind: 'task' | 'followup' | 'question' | 'note'; label: string; detail?: string }[] };
      }

      const result = await invokeLLM({
        messages: [
          {
            role: 'system',
            content:
              'You suggest concrete next actions a knowledge worker could take based on a captured item. ' +
              'Return 2-5 actions. Each has a kind: "task" (something actionable), "followup" (something to check later), ' +
              '"question" (what you still need to learn), or "note" (a linkable related idea). ' +
              'Be specific and grounded in the content. Short labels (max ~80 chars) plus optional one-line detail.',
          },
          { role: 'user', content: text },
        ],
        outputSchema: {
          name: 'quick_actions',
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              actions: {
                type: 'array',
                minItems: 0,
                maxItems: 5,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    kind: { type: 'string', enum: ['task', 'followup', 'question', 'note'] },
                    label: { type: 'string', minLength: 1, maxLength: 120 },
                    detail: { type: 'string', maxLength: 240 },
                  },
                  required: ['kind', 'label'],
                },
              },
            },
            required: ['actions'],
          },
          strict: true,
        },
      });

      const raw = result.choices?.[0]?.message?.content ?? '';
      const body = typeof raw === 'string' ? raw : raw.map((p) => ('text' in p ? p.text : '')).join('');
      let parsed: { actions?: { kind?: unknown; label?: unknown; detail?: unknown }[] } = {};
      try {
        parsed = JSON.parse(body);
      } catch {
        parsed = { actions: [] };
      }

      const allowedKinds = new Set(['task', 'followup', 'question', 'note']);
      const out: { kind: 'task' | 'followup' | 'question' | 'note'; label: string; detail?: string }[] = [];
      for (const a of parsed.actions ?? []) {
        const kind = typeof a.kind === 'string' && allowedKinds.has(a.kind) ? (a.kind as 'task' | 'followup' | 'question' | 'note') : null;
        const label = typeof a.label === 'string' ? a.label.trim().slice(0, 120) : '';
        const detail = typeof a.detail === 'string' ? a.detail.trim().slice(0, 240) : undefined;
        if (!kind || !label) continue;
        out.push({ kind, label, detail });
        if (out.length >= 5) break;
      }
      return { actions: out };
    }),

  relatedItems: protectedProcedure
    .input(z.object({ itemId: z.string(), limit: z.number().int().min(1).max(10).default(5) }))
    .mutation(async ({ input, ctx }) => {
      enforceLlmQuota(ctx.user.id);
      logAiCall(ctx.user.id, 'relatedItems', input.itemId);
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

  journalPrompt: protectedProcedure.mutation(async ({ ctx }) => {
    enforceLlmQuota(ctx.user.id);
    logAiCall(ctx.user.id, 'journalPrompt');

    const since = new Date();
    since.setDate(since.getDate() - 14);
    const recentEntries = await db
      .select()
      .from(journal)
      .where(and(eq(journal.userId, ctx.user.id), isNull(journal.deletedAt), gte(journal.createdAt, since)))
      .orderBy(desc(journal.createdAt))
      .limit(10);

    const excerpt = recentEntries
      .map((j) => `- ${j.entryDate}: ${(j.content ?? '').slice(0, 200).replace(/\s+/g, ' ')}`)
      .join('\n');

    const result = await invokeLLM({
      messages: [
        {
          role: 'system',
          content:
            'Write a single thoughtful, open-ended journal prompt for the user. ' +
            'If their recent entries (last 14 days) reveal a theme or tension, weave it in gently. ' +
            'Prompts should be ~1 sentence, invite reflection, and avoid prescriptive advice. ' +
            'If there are no recent entries, return a general reflective question.',
        },
        {
          role: 'user',
          content: recentEntries.length > 0 ? `Recent entries:\n${excerpt}` : 'No recent entries.',
        },
      ],
      outputSchema: {
        name: 'journal_prompt',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            prompt: { type: 'string', minLength: 5, maxLength: 300 },
          },
          required: ['prompt'],
        },
        strict: true,
      },
    });

    const raw = result.choices?.[0]?.message?.content ?? '';
    const body = typeof raw === 'string' ? raw : raw.map((p) => ('text' in p ? p.text : '')).join('');
    let parsed: { prompt?: unknown } = {};
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = {};
    }
    const prompt = typeof parsed.prompt === 'string' ? parsed.prompt.trim().slice(0, 300) : '';
    return { prompt };
  }),

  weeklyReview: protectedProcedure.mutation(async ({ ctx }) => {
    enforceLlmQuota(ctx.user.id);
    logAiCall(ctx.user.id, 'weeklyReview');

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    weekAgo.setHours(0, 0, 0, 0);

    const [weekItems, weekTasks, weekJournal] = await Promise.all([
      db
        .select()
        .from(items)
        .where(and(eq(items.userId, ctx.user.id), isNull(items.deletedAt), gte(items.createdAt, weekAgo)))
        .orderBy(desc(items.createdAt))
        .limit(100),
      db
        .select()
        .from(tasks)
        .where(and(eq(tasks.userId, ctx.user.id), isNull(tasks.deletedAt), gte(tasks.createdAt, weekAgo)))
        .orderBy(desc(tasks.createdAt))
        .limit(100),
      db
        .select()
        .from(journal)
        .where(and(eq(journal.userId, ctx.user.id), isNull(journal.deletedAt), gte(journal.createdAt, weekAgo)))
        .orderBy(desc(journal.createdAt))
        .limit(30),
    ]);

    const totalCount = weekItems.length + weekTasks.length + weekJournal.length;
    if (totalCount === 0) {
      return {
        overview: '',
        themes: [] as string[],
        progress: [] as string[],
        focusAreas: [] as string[],
        counts: { items: 0, tasks: 0, journal: 0, completedTasks: 0 },
      };
    }

    const completedTasks = weekTasks.filter((t) => t.isCompleted);
    const itemLines = weekItems
      .slice(0, 40)
      .map((it) => `- [${it.type}] ${it.title}${it.content ? `: ${it.content.slice(0, 100).replace(/\s+/g, ' ')}` : ''}`)
      .join('\n');
    const taskLines = weekTasks
      .slice(0, 40)
      .map((t) => `- ${t.isCompleted ? '✓' : '○'} ${t.title}${t.priority ? ` [${t.priority}]` : ''}`)
      .join('\n');
    const journalLines = weekJournal
      .slice(0, 10)
      .map((j) => `- ${j.title ?? '(untitled)'}: ${(j.content ?? '').slice(0, 180).replace(/\s+/g, ' ')}`)
      .join('\n');

    const result = await invokeLLM({
      messages: [
        {
          role: 'system',
          content:
            "You write a concise weekly review for a knowledge worker. Synthesize — don't list. " +
            'Output: a 3-4 sentence overview, 3-5 dominant themes (noun phrases), ' +
            '2-4 progress signals (what moved forward), and 2-4 focus areas for next week. ' +
            'Be specific, grounded in the data, no fluff, no preamble.',
        },
        {
          role: 'user',
          content:
            `Items captured this week (${weekItems.length}):\n${itemLines || '(none)'}\n\n` +
            `Tasks this week (${weekTasks.length}, ${completedTasks.length} completed):\n${taskLines || '(none)'}\n\n` +
            `Journal entries (${weekJournal.length}):\n${journalLines || '(none)'}`,
        },
      ],
      outputSchema: {
        name: 'weekly_review',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            overview: { type: 'string', minLength: 1, maxLength: 800 },
            themes: {
              type: 'array',
              maxItems: 5,
              items: { type: 'string', minLength: 1, maxLength: 80 },
            },
            progress: {
              type: 'array',
              maxItems: 4,
              items: { type: 'string', minLength: 1, maxLength: 200 },
            },
            focusAreas: {
              type: 'array',
              maxItems: 4,
              items: { type: 'string', minLength: 1, maxLength: 200 },
            },
          },
          required: ['overview', 'themes', 'progress', 'focusAreas'],
        },
        strict: true,
      },
    });

    const raw = result.choices?.[0]?.message?.content ?? '';
    const body = typeof raw === 'string' ? raw : raw.map((p) => ('text' in p ? p.text : '')).join('');
    let parsed: {
      overview?: unknown;
      themes?: unknown;
      progress?: unknown;
      focusAreas?: unknown;
    } = {};
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = {};
    }

    const asStringArray = (value: unknown, max: number) =>
      Array.isArray(value)
        ? value
            .filter((v): v is string => typeof v === 'string')
            .map((v) => v.trim().slice(0, 200))
            .filter(Boolean)
            .slice(0, max)
        : [];

    return {
      overview: typeof parsed.overview === 'string' ? parsed.overview.trim().slice(0, 800) : '',
      themes: asStringArray(parsed.themes, 5),
      progress: asStringArray(parsed.progress, 4),
      focusAreas: asStringArray(parsed.focusAreas, 4),
      counts: {
        items: weekItems.length,
        tasks: weekTasks.length,
        journal: weekJournal.length,
        completedTasks: completedTasks.length,
      },
    };
  }),

  dailyDigest: protectedProcedure.mutation(async ({ ctx }) => {
    enforceLlmQuota(ctx.user.id);
    logAiCall(ctx.user.id, 'dailyDigest');

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
