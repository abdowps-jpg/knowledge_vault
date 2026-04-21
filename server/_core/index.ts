import express, { type Request, type Response, type NextFunction } from 'express';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { createTRPCContext, router, publicProcedure } from '../trpc';
import { verifyToken } from '../lib/auth';
import { db } from '../db';
import { users } from '../schema/users';
import { tasks } from '../schema/tasks';
import { createHmac, randomUUID } from 'crypto';
import { eq, isNull } from 'drizzle-orm';
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
import { aiRouter } from '../routers/ai';
import { pushTokensRouter } from '../routers/push-tokens';
import { notificationsRouter } from '../routers/notifications';
import { apiKeys, webhookSubscriptions } from '../schema/api_keys';
import { and } from 'drizzle-orm';
import { items } from '../schema/items';
import { journal } from '../schema/journal';
import { z } from 'zod';

interface ApiRequest extends Request {
  apiUserId?: string;
  apiKeyScope?: 'read' | 'write' | 'admin';
}

const SENTRY_DSN = process.env.SENTRY_DSN ?? '';

function reportError(error: unknown, meta: Record<string, unknown> = {}) {
  const timestamp = new Date().toISOString();
  const err = error instanceof Error ? error : new Error(String(error));
  const payload = {
    timestamp,
    level: 'error',
    message: err.message,
    name: err.name,
    stack: err.stack,
    ...meta,
  };
  console.error('[ErrorReport]', JSON.stringify(payload));

  if (SENTRY_DSN) {
    try {
      const dsn = new URL(SENTRY_DSN);
      const projectId = dsn.pathname.replace(/^\/+/, '');
      const publicKey = dsn.username;
      if (projectId && publicKey) {
        const envelopeUrl = `${dsn.protocol}//${dsn.host}/api/${projectId}/envelope/`;
        const eventId = randomUUID().replace(/-/g, '');
        const header = JSON.stringify({ event_id: eventId, sent_at: timestamp, dsn: SENTRY_DSN });
        const itemHeader = JSON.stringify({ type: 'event' });
        const item = JSON.stringify({
          event_id: eventId,
          timestamp,
          level: 'error',
          platform: 'node',
          message: err.message,
          exception: { values: [{ type: err.name, value: err.message, stacktrace: { frames: [] } }] },
          extra: meta,
        });
        fetch(envelopeUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-sentry-envelope',
            'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${publicKey}, sentry_client=knowledge-vault/1.0`,
          },
          body: `${header}\n${itemHeader}\n${item}\n`,
          signal: AbortSignal.timeout(5000),
        }).catch(() => {});
      }
    } catch {
      // malformed DSN — silent drop
    }
  }
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 100;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function rateLimit(req: ApiRequest, res: Response, next: NextFunction) {
  const key = req.apiUserId ?? req.ip ?? 'unknown';
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
    return res.status(429).json({ success: false, error: 'rate_limit_exceeded' });
  }
  return next();
}

const AUTH_RATE_LIMIT_WINDOW_MS = 15 * 60_000;
const AUTH_RATE_LIMIT_MAX = 10;
const authRateLimitMap = new Map<string, { count: number; resetAt: number }>();
const SENSITIVE_AUTH_OPS = new Set([
  'auth.login',
  'auth.register',
  'auth.forgotPassword',
  'auth.resetPassword',
  'auth.sendVerificationCode',
  'auth.verifyEmail',
]);

function authRateLimit(req: Request, res: Response, next: NextFunction) {
  const path = req.path.replace(/^\/+/, '');
  const ops = path.split(',').map((p) => p.trim()).filter(Boolean);
  const hitsAuth = ops.some((op) => SENSITIVE_AUTH_OPS.has(op));
  if (!hitsAuth) return next();

  const key = req.ip ?? 'unknown';
  const now = Date.now();
  const entry = authRateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    authRateLimitMap.set(key, { count: 1, resetAt: now + AUTH_RATE_LIMIT_WINDOW_MS });
    return next();
  }
  entry.count++;
  if (entry.count > AUTH_RATE_LIMIT_MAX) {
    res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
    return res.status(429).json({ success: false, error: 'auth_rate_limit_exceeded' });
  }
  return next();
}

const rateLimitCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(key);
  }
  for (const [key, entry] of authRateLimitMap) {
    if (now > entry.resetAt) authRateLimitMap.delete(key);
  }
}, 60_000);
if (typeof rateLimitCleanupTimer === 'object' && rateLimitCleanupTimer && 'unref' in rateLimitCleanupTimer) {
  (rateLimitCleanupTimer as { unref: () => void }).unref();
}

// Daily audit-log retention: keep the last 90 days per user
const auditRetentionTimer = setInterval(
  () => {
    void (async () => {
      try {
        const { pruneAudit } = await import('../lib/audit');
        const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        await pruneAudit(cutoff);
      } catch (err) {
        console.error('[AuditRetention] prune failed:', err);
      }
    })();
  },
  24 * 60 * 60 * 1000
);
if (typeof auditRetentionTimer === 'object' && auditRetentionTimer && 'unref' in auditRetentionTimer) {
  (auditRetentionTimer as { unref: () => void }).unref();
}

const app = express();
const port = process.env.PORT || 3000;
const host = process.env.HOST || '0.0.0.0';
const isProduction = process.env.NODE_ENV === 'production';
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean) ?? null;

if (isProduction && (!allowedOrigins || allowedOrigins.length === 0)) {
  console.warn('[CORS] ALLOWED_ORIGINS is not set in production — all cross-origin requests will be rejected.');
}

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
  ai: aiRouter,
  pushTokens: pushTokensRouter,
  notifications: notificationsRouter,
  // test endpoint
  hello: publicProcedure.query(() => {
    return { message: 'Hello from tRPC!' };
  }),
});

export type AppRouter = typeof appRouter;

// Required for tRPC POST/JSON batch requests
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Security headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self' https: wss:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; ')
  );
  if (isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  }
  next();
});

// CORS middleware
app.use((req, res, next) => {
  const origin = req.headers.origin ?? '';
  const isAllowed = allowedOrigins
    ? origin !== '' && allowedOrigins.includes(origin)
    : !isProduction;

  if (isAllowed) {
    res.header('Access-Control-Allow-Origin', origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Vary', 'Origin');
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-trpc-source, x-api-key');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(isAllowed ? 200 : 403);
  }
  next();
});

const WEBHOOK_MAX_RETRIES = 3;
const WEBHOOK_RETRY_DELAYS = [1000, 5000, 15000];

function signWebhookBody(body: string, secret: string | null, timestamp: string): string | null {
  if (!secret) return null;
  const toSign = `${timestamp}.${body}`;
  return createHmac('sha256', secret).update(toSign).digest('hex');
}

async function deliverWebhook(hook: { id: string; url: string; secret: string | null }, body: string, attempt = 0): Promise<void> {
  try {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = signWebhookBody(body, hook.secret, timestamp);
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-kv-webhook-id': hook.id,
      'x-kv-timestamp': timestamp,
    };
    if (signature) {
      headers['x-kv-signature'] = `sha256=${signature}`;
    }

    const response = await fetch(hook.url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok && attempt < WEBHOOK_MAX_RETRIES) {
      const delay = WEBHOOK_RETRY_DELAYS[attempt] ?? 15000;
      setTimeout(() => deliverWebhook(hook, body, attempt + 1), delay);
    }
  } catch (error) {
    if (attempt < WEBHOOK_MAX_RETRIES) {
      const delay = WEBHOOK_RETRY_DELAYS[attempt] ?? 15000;
      setTimeout(() => deliverWebhook(hook, body, attempt + 1), delay);
    } else {
      console.error('[Webhook] delivery failed after retries:', hook.url, error);
    }
  }
}

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

    const body = JSON.stringify({
      event: args.event,
      timestamp: new Date().toISOString(),
      data: args.payload,
    });

    for (const hook of hooks) {
      deliverWebhook(hook, body);
    }
  } catch (error) {
    console.error('[Webhook] trigger failed:', error);
  }
}

// Forward-compat: /api/v1/* is an alias for /api/*. Rewrite before auth
// runs so clients can pin a version without requiring any route duplication.
app.use((req: Request, _res: Response, next: NextFunction) => {
  if (req.url.startsWith('/api/v1/')) {
    req.url = '/api' + req.url.slice('/api/v1'.length);
  } else if (req.url === '/api/v1') {
    req.url = '/api';
  }
  next();
});

app.use('/api', async (req: ApiRequest, res, next) => {
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
    req.apiUserId = key.userId;
    req.apiKeyScope = (key.scope as 'read' | 'write' | 'admin') ?? 'write';
    next();
  } catch (error) {
    console.error('[REST API] API key validation failed:', error);
    return res.status(500).json({ success: false, error: 'internal_error' });
  }
});

app.use('/api', (req: ApiRequest, res, next) => {
  const method = req.method.toUpperCase();
  const scope = req.apiKeyScope ?? 'write';
  const readOnly = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
  const isDelete = method === 'DELETE';

  if (readOnly) return next();
  if (scope === 'read') {
    return res.status(403).json({ success: false, error: 'insufficient_scope', required: 'write' });
  }
  if (isDelete && scope !== 'admin') {
    return res.status(403).json({ success: false, error: 'insufficient_scope', required: 'admin' });
  }
  next();
});

app.use('/api', rateLimit);

const createItemSchema = z.object({
  title: z.string().min(1).max(500),
  type: z.enum(['note', 'quote', 'link', 'audio']).default('note'),
  content: z.string().nullish(),
  url: z.string().url().nullish(),
  location: z.enum(['inbox', 'library', 'archive']).default('inbox'),
});

const updateItemSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  content: z.string().optional(),
  url: z.string().url().optional(),
});

const createTaskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().nullish(),
  dueDate: z.string().nullish(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
});

const updateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().optional(),
  dueDate: z.string().optional(),
  isCompleted: z.boolean().optional(),
});

const createJournalSchema = z.object({
  content: z.string().min(1),
  entryDate: z.string().min(1),
  title: z.string().nullish(),
  mood: z.string().nullish(),
  location: z.string().nullish(),
  weather: z.string().nullish(),
});

const updateJournalSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
  mood: z.string().optional(),
  location: z.string().optional(),
  weather: z.string().optional(),
});

app.get('/api/items', async (req: ApiRequest, res) => {
  const userId = req.apiUserId!;
  const rows = await db.select().from(items).where(and(eq(items.userId, userId), isNull(items.deletedAt)));
  return res.json({ success: true, items: rows });
});

app.post('/api/items', async (req: ApiRequest, res) => {
  try {
    const userId = req.apiUserId!;
    const parsed = createItemSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: 'validation_failed', details: parsed.error.flatten() });

    const { title, type, content, url, location } = parsed.data;
    const newItem = {
      id: randomUUID(),
      userId,
      type,
      title,
      content: content ?? null,
      url: url ?? null,
      location,
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

app.put('/api/items/:id', async (req: ApiRequest, res) => {
  try {
    const userId = req.apiUserId!;
    const id = req.params.id;
    const parsed = updateItemSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: 'validation_failed', details: parsed.error.flatten() });

    await db
      .update(items)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(items.id, id), eq(items.userId, userId)));
    await triggerWebhooks({ userId, event: 'items.updated', payload: { id } });
    return res.json({ success: true });
  } catch (error) {
    console.error('[REST API] update item failed:', error);
    return res.status(500).json({ success: false, error: 'internal_error' });
  }
});

app.delete('/api/items/:id', async (req: ApiRequest, res) => {
  try {
    const userId = req.apiUserId!;
    const id = req.params.id;
    await db.delete(items).where(and(eq(items.id, id), eq(items.userId, userId)));
    await triggerWebhooks({ userId, event: 'items.deleted', payload: { id } });
    return res.json({ success: true });
  } catch (error) {
    console.error('[REST API] delete item failed:', error);
    return res.status(500).json({ success: false, error: 'internal_error' });
  }
});

app.get('/api/tasks', async (req: ApiRequest, res) => {
  const userId = req.apiUserId!;
  const rows = await db.select().from(tasks).where(and(eq(tasks.userId, userId), isNull(tasks.deletedAt)));
  return res.json({ success: true, tasks: rows });
});

app.post('/api/tasks', async (req: ApiRequest, res) => {
  try {
    const userId = req.apiUserId!;
    const parsed = createTaskSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: 'validation_failed', details: parsed.error.flatten() });

    const { title, description, dueDate, priority } = parsed.data;
    const newTask = {
      id: randomUUID(),
      userId,
      title,
      description: description ?? null,
      dueDate: dueDate ?? null,
      blockedByTaskId: null,
      locationLat: null,
      locationLng: null,
      locationRadiusMeters: null,
      isUrgent: false,
      isImportant: false,
      priority,
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

app.put('/api/tasks/:id', async (req: ApiRequest, res) => {
  try {
    const userId = req.apiUserId!;
    const id = req.params.id;
    const parsed = updateTaskSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: 'validation_failed', details: parsed.error.flatten() });

    await db
      .update(tasks)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
    await triggerWebhooks({ userId, event: 'tasks.updated', payload: { id } });
    return res.json({ success: true });
  } catch (error) {
    console.error('[REST API] update task failed:', error);
    return res.status(500).json({ success: false, error: 'internal_error' });
  }
});

app.delete('/api/tasks/:id', async (req: ApiRequest, res) => {
  try {
    const userId = req.apiUserId!;
    const id = req.params.id;
    await db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
    await triggerWebhooks({ userId, event: 'tasks.deleted', payload: { id } });
    return res.json({ success: true });
  } catch (error) {
    console.error('[REST API] delete task failed:', error);
    return res.status(500).json({ success: false, error: 'internal_error' });
  }
});

app.get('/api/journal', async (req: ApiRequest, res) => {
  const userId = req.apiUserId!;
  const rows = await db.select().from(journal).where(and(eq(journal.userId, userId), isNull(journal.deletedAt)));
  return res.json({ success: true, journal: rows });
});

app.post('/api/journal', async (req: ApiRequest, res) => {
  try {
    const userId = req.apiUserId!;
    const parsed = createJournalSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: 'validation_failed', details: parsed.error.flatten() });

    const { content, entryDate, title, mood, location, weather } = parsed.data;
    const newEntry = {
      id: randomUUID(),
      userId,
      entryDate,
      title: title ?? null,
      content,
      mood: mood ?? null,
      location: location ?? null,
      weather: weather ?? null,
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

app.put('/api/journal/:id', async (req: ApiRequest, res) => {
  try {
    const userId = req.apiUserId!;
    const id = req.params.id;
    const parsed = updateJournalSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: 'validation_failed', details: parsed.error.flatten() });

    await db
      .update(journal)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(journal.id, id), eq(journal.userId, userId)));
    return res.json({ success: true });
  } catch (error) {
    console.error('[REST API] update journal failed:', error);
    return res.status(500).json({ success: false, error: 'internal_error' });
  }
});

app.delete('/api/journal/:id', async (req: ApiRequest, res) => {
  try {
    const userId = req.apiUserId!;
    const id = req.params.id;
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

// tRPC middleware — auth rate limit before tRPC handler
app.use('/trpc', authRateLimit);
app.use(
  '/trpc',
  createExpressMiddleware({
    router: appRouter,
    createContext: ({ req, res }) => {
      const authHeader = req.headers.authorization;
      let user = null;

      if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7).trim();
        try {
          const payload = verifyToken(token);
          if (payload) {
            user = {
              id: payload.sub,
              email: payload.email,
              username: payload.username ?? null,
            };
          }
        } catch (error) {
          console.error('[Auth/Middleware] JWT verification error:', error);
        }
      }

      return createTRPCContext({ req, res, user });
    },
    onError: ({ error, path, type, ctx }) => {
      if (error.code === 'INTERNAL_SERVER_ERROR' || !error.code) {
        reportError(error, {
          source: 'trpc',
          path: path ?? 'unknown',
          type,
          userId: ctx?.user?.id ?? null,
        });
      }
    },
  })
);

// Health check for uptime monitors
app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

app.get('/p/:token', async (req: Request, res: Response) => {
  try {
    const { publicLinks } = await import('../schema/public_links');
    const tokenRaw = String(req.params.token ?? '').trim();
    if (!tokenRaw || tokenRaw.length < 8) {
      return res.status(400).type('html').send('<h1>Invalid link</h1>');
    }
    const linkRows = await db.select().from(publicLinks).where(eq(publicLinks.token, tokenRaw)).limit(1);
    const link = linkRows[0];
    if (!link || link.isRevoked) {
      return res.status(404).type('html').send('<h1>Link not found</h1>');
    }
    if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
      return res.status(410).type('html').send('<h1>Link expired</h1>');
    }
    if (link.passwordHash) {
      // Password-protected links still require the app UI; don't expose content here
      return res
        .status(401)
        .type('html')
        .send(
          `<!doctype html><html><head><meta charset="utf-8"><title>Password required</title></head><body style="font-family:system-ui;padding:32px;max-width:480px;margin:auto;"><h1>Password required</h1><p>Open this link in the Knowledge Vault app to enter the password.</p></body></html>`
        );
    }

    const itemRows = await db
      .select()
      .from(items)
      .where(and(eq(items.id, link.itemId), isNull(items.deletedAt)))
      .limit(1);
    const item = itemRows[0];
    if (!item) {
      return res.status(404).type('html').send('<h1>Item not found</h1>');
    }

    const title = escapeHtml(item.title || 'Untitled');
    const contentHtml = escapeHtml(item.content ?? '').replace(/\n/g, '<br>');
    const urlLink = item.url
      ? `<p><a href="${escapeHtml(item.url)}" rel="nofollow noreferrer">${escapeHtml(item.url)}</a></p>`
      : '';
    const created = item.createdAt ? new Date(item.createdAt).toISOString().slice(0, 10) : '';

    res.type('html').send(
      `<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${title} — Knowledge Vault</title>
<style>
  :root{color-scheme:light dark}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:720px;margin:0 auto;padding:32px 20px;line-height:1.6;color:#111}
  @media (prefers-color-scheme:dark){body{background:#0b0b10;color:#eaeaea}a{color:#8ab4ff}}
  h1{font-size:1.8rem;margin:0 0 .5rem}
  .meta{color:#888;font-size:.85rem;margin-bottom:1.5rem}
  .content{white-space:pre-wrap;word-wrap:break-word}
  footer{margin-top:3rem;padding-top:1rem;border-top:1px solid #ccc3;color:#888;font-size:.8rem}
</style>
</head><body>
<h1>${title}</h1>
<div class="meta">Shared via Knowledge Vault${created ? ` · ${created}` : ''}</div>
${urlLink}
<div class="content">${contentHtml}</div>
<footer>Served by Knowledge Vault. This page is not indexed.</footer>
</body></html>`
    );
  } catch (err) {
    reportError(err instanceof Error ? err : new Error(String(err)), { source: 'public-link-html' });
    res.status(500).type('html').send('<h1>Server error</h1>');
  }
});

// Global error handler — catches uncaught errors from REST routes
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  reportError(err, { source: 'express', path: req.path, method: req.method });
  if (res.headersSent) return;
  res.status(500).json({ success: false, error: 'internal_error' });
});

process.on('unhandledRejection', (reason) => {
  reportError(reason instanceof Error ? reason : new Error(String(reason)), {
    source: 'unhandledRejection',
  });
});

process.on('uncaughtException', (err) => {
  reportError(err, { source: 'uncaughtException' });
});

app.listen(Number(port), host, () => {
  console.log(`Server running on http://${host}:${port}`);
});
