import express from 'express';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { createTRPCContext, router, publicProcedure } from '../trpc';
import { verifyToken } from '../lib/auth';
import { db } from '../db';
import { users } from '../schema/users';
import { tasks } from '../schema/tasks';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { resolveUserIdFromTaskInboxAddress } from '../lib/email-task-address';
import { itemsRouter } from '../routers/items';
import { tasksRouter } from '../routers/tasks';
import { journalRouter } from '../routers/journal';
import { categoriesRouter } from '../routers/categories';
import { attachmentsRouter } from '../routers/attachments';
import { exportRouter } from '../routers/export';
import { statsRouter } from '../routers/stats';
import { tagsRouter } from '../routers/tags';
import { authRouter } from '../routers/auth';
import { syncRouter } from '../routers/sync';
import { devicesRouter } from '../routers/devices';
import { transcriptionRouter } from '../routers/transcription';
import { analyticsRouter } from '../routers/analytics';
import { taskTimeRouter } from '../routers/task-time';
import { habitsRouter } from '../routers/habits';
import { goalsRouter } from '../routers/goals';
import { subtasksRouter } from '../routers/subtasks';
import { itemSharesRouter } from '../routers/item-shares';
import { itemCommentsRouter } from '../routers/item-comments';
import { publicLinksRouter } from '../routers/public-links';
import { apiRouter, buildApiKeyHash } from '../routers/api';
import { itemVersionsRouter } from '../routers/item-versions';
import { apiKeys, webhookSubscriptions } from '../schema/api_keys';
import { and } from 'drizzle-orm';
import { items } from '../schema/items';
import { journal } from '../schema/journal';

const app = express();
const port = process.env.PORT || 3000;
const host = process.env.HOST || '0.0.0.0';

// إنشاء main router
const appRouter = router({
  auth: authRouter,
  items: itemsRouter,
  tasks: tasksRouter,
  journal: journalRouter,
  tags: tagsRouter,
  categories: categoriesRouter,
  attachments: attachmentsRouter,
  export: exportRouter,
  stats: statsRouter,
  sync: syncRouter,
  devices: devicesRouter,
  transcription: transcriptionRouter,
  analytics: analyticsRouter,
  taskTime: taskTimeRouter,
  habits: habitsRouter,
  goals: goalsRouter,
  subtasks: subtasksRouter,
  itemShares: itemSharesRouter,
  itemComments: itemCommentsRouter,
  publicLinks: publicLinksRouter,
  api: apiRouter,
  itemVersions: itemVersionsRouter,
  // test endpoint
  hello: publicProcedure.query(() => {
    return { message: 'Hello from tRPC!' };
  }),
});

export type AppRouter = typeof appRouter;

// Required for tRPC POST/JSON batch requests
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-trpc-source, x-api-key');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

async function triggerWebhooks(args: { userId: string; event: string; payload: Record<string, unknown> }) {
  try {
    const hooks = await db
      .select()
      .from(webhookSubscriptions)
      .where(
        and(
          eq(webhookSubscriptions.userId, args.userId),
          eq(webhookSubscriptions.event, args.event),
          eq(webhookSubscriptions.isActive, true)
        )
      );
    if (hooks.length === 0) return;

    await Promise.all(
      hooks.map(async (hook) => {
        try {
          const body = JSON.stringify({
            event: args.event,
            timestamp: new Date().toISOString(),
            data: args.payload,
          });
          await fetch(hook.url, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-kv-webhook-id': hook.id,
              'x-kv-webhook-secret': hook.secret ?? '',
            },
            body,
          });
        } catch (error) {
          console.error('[Webhook] delivery failed:', hook.url, error);
        }
      })
    );
  } catch (error) {
    console.error('[Webhook] trigger failed:', error);
  }
}

app.use('/api', async (req, res, next) => {
  try {
    const rawKey = String(req.headers['x-api-key'] ?? '').trim();
    if (!rawKey) return res.status(401).json({ success: false, error: 'missing_api_key' });
    const keyHash = buildApiKeyHash(rawKey);
    const keyRows = await db
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.keyHash, keyHash), eq(apiKeys.isActive, true)))
      .limit(1);
    const key = keyRows[0];
    if (!key) return res.status(401).json({ success: false, error: 'invalid_api_key' });
    await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id));
    (req as any).apiUserId = key.userId;
    next();
  } catch (error) {
    console.error('[REST API] API key validation failed:', error);
    return res.status(500).json({ success: false, error: 'internal_error' });
  }
});

app.get('/api/items', async (req, res) => {
  const userId = String((req as any).apiUserId ?? '');
  const rows = await db.select().from(items).where(eq(items.userId, userId));
  return res.json({ success: true, items: rows });
});

app.post('/api/items', async (req, res) => {
  try {
    const userId = String((req as any).apiUserId ?? '');
    const title = String(req.body?.title ?? '').trim();
    const type = String(req.body?.type ?? 'note');
    if (!title) return res.status(400).json({ success: false, error: 'title_required' });

    const newItem = {
      id: randomUUID(),
      userId,
      type: ['note', 'quote', 'link', 'audio'].includes(type) ? (type as any) : 'note',
      title,
      content: req.body?.content ? String(req.body.content) : null,
      url: req.body?.url ? String(req.body.url) : null,
      location: ['inbox', 'library', 'archive'].includes(String(req.body?.location ?? 'inbox'))
        ? (String(req.body?.location ?? 'inbox') as any)
        : 'inbox',
      isFavorite: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    await db.insert(items).values(newItem);
    await triggerWebhooks({ userId, event: 'items.created', payload: { id: newItem.id, title: newItem.title } });
    return res.json({ success: true, item: newItem });
  } catch (error) {
    console.error('[REST API] create item failed:', error);
    return res.status(500).json({ success: false, error: 'internal_error' });
  }
});

app.put('/api/items/:id', async (req, res) => {
  try {
    const userId = String((req as any).apiUserId ?? '');
    const id = String(req.params.id ?? '');
    await db
      .update(items)
      .set({
        title: typeof req.body?.title === 'string' ? req.body.title : undefined,
        content: typeof req.body?.content === 'string' ? req.body.content : undefined,
        url: typeof req.body?.url === 'string' ? req.body.url : undefined,
        updatedAt: new Date(),
      })
      .where(and(eq(items.id, id), eq(items.userId, userId)));
    await triggerWebhooks({ userId, event: 'items.updated', payload: { id } });
    return res.json({ success: true });
  } catch (error) {
    console.error('[REST API] update item failed:', error);
    return res.status(500).json({ success: false, error: 'internal_error' });
  }
});

app.delete('/api/items/:id', async (req, res) => {
  try {
    const userId = String((req as any).apiUserId ?? '');
    const id = String(req.params.id ?? '');
    await db.delete(items).where(and(eq(items.id, id), eq(items.userId, userId)));
    await triggerWebhooks({ userId, event: 'items.deleted', payload: { id } });
    return res.json({ success: true });
  } catch (error) {
    console.error('[REST API] delete item failed:', error);
    return res.status(500).json({ success: false, error: 'internal_error' });
  }
});

app.get('/api/tasks', async (req, res) => {
  const userId = String((req as any).apiUserId ?? '');
  const rows = await db.select().from(tasks).where(eq(tasks.userId, userId));
  return res.json({ success: true, tasks: rows });
});

app.post('/api/tasks', async (req, res) => {
  try {
    const userId = String((req as any).apiUserId ?? '');
    const title = String(req.body?.title ?? '').trim();
    if (!title) return res.status(400).json({ success: false, error: 'title_required' });
    const newTask = {
      id: randomUUID(),
      userId,
      title,
      description: req.body?.description ? String(req.body.description) : null,
      dueDate: req.body?.dueDate ? String(req.body.dueDate) : null,
      blockedByTaskId: null,
      locationLat: null,
      locationLng: null,
      locationRadiusMeters: null,
      isUrgent: false,
      isImportant: false,
      priority: ['low', 'medium', 'high'].includes(String(req.body?.priority ?? 'medium'))
        ? (String(req.body?.priority ?? 'medium') as any)
        : 'medium',
      isCompleted: false,
      completedAt: null,
      recurrence: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    await db.insert(tasks).values(newTask);
    await triggerWebhooks({ userId, event: 'tasks.created', payload: { id: newTask.id, title: newTask.title } });
    return res.json({ success: true, task: newTask });
  } catch (error) {
    console.error('[REST API] create task failed:', error);
    return res.status(500).json({ success: false, error: 'internal_error' });
  }
});

app.put('/api/tasks/:id', async (req, res) => {
  try {
    const userId = String((req as any).apiUserId ?? '');
    const id = String(req.params.id ?? '');
    await db
      .update(tasks)
      .set({
        title: typeof req.body?.title === 'string' ? req.body.title : undefined,
        description: typeof req.body?.description === 'string' ? req.body.description : undefined,
        dueDate: typeof req.body?.dueDate === 'string' ? req.body.dueDate : undefined,
        isCompleted: typeof req.body?.isCompleted === 'boolean' ? req.body.isCompleted : undefined,
        updatedAt: new Date(),
      })
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
    await triggerWebhooks({ userId, event: 'tasks.updated', payload: { id } });
    return res.json({ success: true });
  } catch (error) {
    console.error('[REST API] update task failed:', error);
    return res.status(500).json({ success: false, error: 'internal_error' });
  }
});

app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const userId = String((req as any).apiUserId ?? '');
    const id = String(req.params.id ?? '');
    await db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
    await triggerWebhooks({ userId, event: 'tasks.deleted', payload: { id } });
    return res.json({ success: true });
  } catch (error) {
    console.error('[REST API] delete task failed:', error);
    return res.status(500).json({ success: false, error: 'internal_error' });
  }
});

app.get('/api/journal', async (req, res) => {
  const userId = String((req as any).apiUserId ?? '');
  const rows = await db.select().from(journal).where(eq(journal.userId, userId));
  return res.json({ success: true, journal: rows });
});

app.post('/api/journal', async (req, res) => {
  try {
    const userId = String((req as any).apiUserId ?? '');
    const content = String(req.body?.content ?? '').trim();
    const entryDate = String(req.body?.entryDate ?? '').trim();
    if (!content || !entryDate) return res.status(400).json({ success: false, error: 'content_and_entryDate_required' });
    const newEntry = {
      id: randomUUID(),
      userId,
      entryDate,
      title: req.body?.title ? String(req.body.title) : null,
      content,
      mood: req.body?.mood ? String(req.body.mood) : null,
      location: req.body?.location ? String(req.body.location) : null,
      weather: req.body?.weather ? String(req.body.weather) : null,
      isLocked: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    await db.insert(journal).values(newEntry);
    return res.json({ success: true, entry: newEntry });
  } catch (error) {
    console.error('[REST API] create journal failed:', error);
    return res.status(500).json({ success: false, error: 'internal_error' });
  }
});

app.put('/api/journal/:id', async (req, res) => {
  try {
    const userId = String((req as any).apiUserId ?? '');
    const id = String(req.params.id ?? '');
    await db
      .update(journal)
      .set({
        title: typeof req.body?.title === 'string' ? req.body.title : undefined,
        content: typeof req.body?.content === 'string' ? req.body.content : undefined,
        mood: typeof req.body?.mood === 'string' ? req.body.mood : undefined,
        location: typeof req.body?.location === 'string' ? req.body.location : undefined,
        weather: typeof req.body?.weather === 'string' ? req.body.weather : undefined,
        updatedAt: new Date(),
      })
      .where(and(eq(journal.id, id), eq(journal.userId, userId)));
    return res.json({ success: true });
  } catch (error) {
    console.error('[REST API] update journal failed:', error);
    return res.status(500).json({ success: false, error: 'internal_error' });
  }
});

app.delete('/api/journal/:id', async (req, res) => {
  try {
    const userId = String((req as any).apiUserId ?? '');
    const id = String(req.params.id ?? '');
    await db.delete(journal).where(and(eq(journal.id, id), eq(journal.userId, userId)));
    return res.json({ success: true });
  } catch (error) {
    console.error('[REST API] delete journal failed:', error);
    return res.status(500).json({ success: false, error: 'internal_error' });
  }
});

function extractSingleValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return '';
}

function extractEmailAddress(raw: string): string {
  const trimmed = raw.trim();
  const angleMatch = trimmed.match(/<([^>]+)>/);
  if (angleMatch?.[1]) {
    return angleMatch[1].trim().toLowerCase();
  }
  const plain = trimmed.split(',')[0]?.trim() ?? '';
  return plain.toLowerCase();
}

app.post('/email/inbound', async (req, res) => {
  try {
    const configuredSecret = (process.env.EMAIL_WEBHOOK_SECRET ?? '').trim();
    const requestSecret = String(req.headers['x-email-webhook-secret'] ?? req.query.secret ?? '').trim();

    if (configuredSecret) {
      if (requestSecret !== configuredSecret) {
        return res.status(401).json({ success: false, error: 'unauthorized' });
      }
    } else if (process.env.NODE_ENV === 'production') {
      return res.status(503).json({ success: false, error: 'webhook_secret_not_configured' });
    }

    const toRaw =
      extractSingleValue((req.body as any)?.to) ||
      extractSingleValue((req.body as any)?.recipient) ||
      String(req.headers['x-original-to'] ?? '');
    const fromRaw = extractSingleValue((req.body as any)?.from);
    const subjectRaw = extractSingleValue((req.body as any)?.subject);
    const textRaw = extractSingleValue((req.body as any)?.text);
    const htmlRaw = extractSingleValue((req.body as any)?.html);

    const toAddress = extractEmailAddress(toRaw);
    const userId = resolveUserIdFromTaskInboxAddress(toAddress);
    if (!userId) {
      return res.status(400).json({ success: false, error: 'invalid_recipient' });
    }

    const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const user = userRows[0];
    if (!user || !user.isActive) {
      return res.status(404).json({ success: false, error: 'user_not_found' });
    }

    const cleanSubject = subjectRaw.trim();
    const textBody = textRaw.trim();
    const htmlBody = htmlRaw.trim();
    const normalizedBody = textBody || htmlBody.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

    const title = cleanSubject || normalizedBody.split('\n')[0]?.trim() || 'Email task';
    const descriptionLines = [
      fromRaw ? `From: ${fromRaw.trim()}` : '',
      normalizedBody ? `Body: ${normalizedBody.slice(0, 2000)}` : '',
    ].filter(Boolean);

    const newTask = {
      id: randomUUID(),
      userId: user.id,
      title: title.slice(0, 300),
      description: descriptionLines.join('\n'),
      dueDate: null,
      priority: 'medium' as const,
      isCompleted: false,
      completedAt: null,
      recurrence: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    await db.insert(tasks).values(newTask);

    console.log('[Email->Task] Created task from inbound email:', {
      taskId: newTask.id,
      userId: user.id,
      to: toAddress,
      title: newTask.title,
    });

    return res.status(200).json({ success: true, taskId: newTask.id });
  } catch (error) {
    console.error('[Email->Task] Failed processing inbound email:', error);
    return res.status(500).json({ success: false, error: 'internal_error' });
  }
});

// tRPC middleware
app.use(
  '/trpc',
  createExpressMiddleware({
    router: appRouter,
    createContext: ({ req, res }) => {
      const authHeader = req.headers.authorization;
      let user = null;

      if (!authHeader || typeof authHeader !== 'string') {
        console.log('[Auth/Middleware] No Authorization header provided');
      } else if (!authHeader.startsWith('Bearer ')) {
        console.log('[Auth/Middleware] Authorization header is not Bearer');
      } else {
        const token = authHeader.slice(7).trim();
        try {
          const payload = verifyToken(token);
          if (payload) {
            user = {
              id: payload.sub,
              email: payload.email,
              username: payload.username ?? null,
            };
            console.log('[Auth/Middleware] Authenticated user:', { userId: user.id, email: user.email });
          } else {
            console.warn('[Auth/Middleware] Invalid JWT token payload');
          }
        } catch (error) {
          console.error('[Auth/Middleware] JWT verification error:', error);
        }
      }

      return createTRPCContext({ req, res, user });
    },
  })
);

app.listen(Number(port), host, () => {
  console.log(`Server running on http://${host}:${port}`);
});
