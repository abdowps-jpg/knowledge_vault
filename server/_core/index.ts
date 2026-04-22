import express, { type Request, type Response, type NextFunction } from 'express';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { createTRPCContext, router, publicProcedure } from '../trpc';
import { verifyToken } from '../lib/auth';
import { printValidation, validateEnv } from './validate-env';
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
import { savedSearchesRouter } from '../routers/saved-searches';
import { templatesRouter } from '../routers/templates';
import { feedbackRouter } from '../routers/feedback';
import { searchRouter } from '../routers/search';
import { reviewsRouter } from '../routers/reviews';
import { onboardingRouter } from '../routers/onboarding';
import { integrationsRouter } from '../routers/integrations';
import { flashcardsRouter } from '../routers/flashcards';
import { vaultsRouter } from '../routers/vaults';
import { adminRouter } from '../routers/admin';
import { ssoRouter } from '../routers/sso';
import { zapierRouter } from '../routers/zapier';
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

// Trash auto-purge: permanently delete items soft-deleted more than 30 days ago
const trashPurgeTimer = setInterval(
  () => {
    void (async () => {
      try {
        const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const { lt } = await import('drizzle-orm');
        const deleted = await db.delete(items).where(lt(items.deletedAt, cutoff));
        console.log('[TrashPurge] removed items older than 30d:', deleted);
      } catch (err) {
        console.error('[TrashPurge] failed:', err);
      }
    })();
  },
  24 * 60 * 60 * 1000
);
if (typeof trashPurgeTimer === 'object' && trashPurgeTimer && 'unref' in trashPurgeTimer) {
  (trashPurgeTimer as { unref: () => void }).unref();
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
  savedSearches: savedSearchesRouter,
  templates: templatesRouter,
  feedback: feedbackRouter,
  search: searchRouter,
  reviews: reviewsRouter,
  onboarding: onboardingRouter,
  integrations: integrationsRouter,
  flashcards: flashcardsRouter,
  vaults: vaultsRouter,
  admin: adminRouter,
  sso: ssoRouter,
  zapier: zapierRouter,
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
  const isExtension =
    origin.startsWith('chrome-extension://') ||
    origin.startsWith('moz-extension://') ||
    origin.startsWith('safari-web-extension://');

  const isAllowed = isExtension
    ? true
    : allowedOrigins
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

async function recordWebhookOutcome(hookId: string, status: number | null, failed: boolean): Promise<void> {
  try {
    await db
      .update(webhookSubscriptions)
      .set({
        lastDeliveredAt: new Date(),
        lastStatus: status,
        failureCount: failed ? 1 : 0, // reset on success; increment only by raw update is lossy here
      })
      .where(eq(webhookSubscriptions.id, hookId));
  } catch (err) {
    console.error('[Webhook] outcome persist failed:', err);
  }
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
    if (response.ok) {
      recordWebhookOutcome(hook.id, response.status, false).catch(() => {});
      return;
    }
    if (attempt < WEBHOOK_MAX_RETRIES) {
      const delay = WEBHOOK_RETRY_DELAYS[attempt] ?? 15000;
      setTimeout(() => deliverWebhook(hook, body, attempt + 1), delay);
    } else {
      recordWebhookOutcome(hook.id, response.status, true).catch(() => {});
    }
  } catch (error) {
    if (attempt < WEBHOOK_MAX_RETRIES) {
      const delay = WEBHOOK_RETRY_DELAYS[attempt] ?? 15000;
      setTimeout(() => deliverWebhook(hook, body, attempt + 1), delay);
    } else {
      console.error('[Webhook] delivery failed after retries:', hook.url, error);
      recordWebhookOutcome(hook.id, null, true).catch(() => {});
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

// Public schema endpoint — registered before the /api auth middleware
app.get('/api/schema', (_req, res) => {
  res.json({
    info: {
      title: 'Knowledge Vault REST API',
      version: '1.1.0',
      description: 'Send X-Api-Key header. Scopes: read (GET), write (GET/POST/PUT), admin (+DELETE).',
    },
    basePath: '/api',
    versionedBasePath: '/api/v1',
    endpoints: [
      { method: 'GET', path: '/api/items', scope: 'read' },
      { method: 'POST', path: '/api/items', scope: 'write' },
      { method: 'PUT', path: '/api/items/:id', scope: 'write' },
      { method: 'DELETE', path: '/api/items/:id', scope: 'admin' },
      { method: 'GET', path: '/api/tasks', scope: 'read' },
      { method: 'POST', path: '/api/tasks', scope: 'write' },
      { method: 'PUT', path: '/api/tasks/:id', scope: 'write' },
      { method: 'DELETE', path: '/api/tasks/:id', scope: 'admin' },
      { method: 'GET', path: '/api/journal', scope: 'read' },
      { method: 'POST', path: '/api/journal', scope: 'write' },
      { method: 'PUT', path: '/api/journal/:id', scope: 'write' },
      { method: 'DELETE', path: '/api/journal/:id', scope: 'admin' },
    ],
    trpcRouters: [
      'auth', 'items', 'tasks', 'journal', 'tags', 'categories', 'attachments',
      'export', 'stats', 'sync', 'devices', 'transcription', 'analytics',
      'taskTime', 'habits', 'goals', 'subtasks', 'itemShares', 'itemComments',
      'publicLinks', 'api', 'itemVersions', 'ai', 'pushTokens', 'notifications',
      'savedSearches', 'templates', 'feedback', 'search', 'reviews', 'onboarding',
    ],
    webhookEvents: [
      'items.created',
      'items.updated',
      'items.deleted',
      'tasks.created',
      'tasks.updated',
      'tasks.deleted',
    ],
    webhookHeaders: {
      'x-kv-webhook-id': 'Subscription id',
      'x-kv-timestamp': 'Unix seconds',
      'x-kv-signature': 'sha256=<hex HMAC of "<timestamp>.<raw body>" using the subscription secret>',
    },
    publicEndpoints: {
      'GET /p/:token': 'Server-rendered HTML view for a public link',
      'GET /healthz': 'Uptime probe',
      'GET /_metrics': 'Process metrics (memory, uptime, rate-limit cardinality)',
      'GET /robots.txt': 'Disallow everything',
    },
  });
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

// Zapier "Authentication" test endpoint — returns minimal user context so
// Zapier's app-setup flow can confirm the API key is valid. Uses the same
// X-Api-Key middleware as every /api/* route.
app.get('/api/me', async (req: ApiRequest, res) => {
  const userId = req.apiUserId;
  if (!userId) return res.status(401).json({ success: false });
  const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = userRows[0];
  if (!user) return res.status(404).json({ success: false });
  return res.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      username: user.username ?? null,
    },
    scope: req.apiKeyScope ?? 'write',
  });
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

// Server-Sent Events: realtime notification stream
app.get('/events', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const bearer = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : '';
  const queryToken = typeof req.query.token === 'string' ? req.query.token.trim() : '';
  const token = bearer || queryToken;
  if (!token) {
    return res.status(401).json({ error: 'missing_token' });
  }
  let payload: { sub?: string } | null = null;
  try {
    payload = verifyToken(token) as { sub?: string } | null;
  } catch {
    return res.status(401).json({ error: 'invalid_token' });
  }
  if (!payload?.sub) {
    return res.status(401).json({ error: 'invalid_token' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering

  void import('../lib/realtime').then(({ addRealtimeClient }) => {
    const cleanup = addRealtimeClient(payload!.sub!, res);
    req.on('close', cleanup);
    req.on('aborted', cleanup);
  }).catch((err) => {
    console.error('[SSE] failed to attach client:', err);
    res.end();
  });
});

// Health check for uptime monitors
app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Lightweight process metrics (no auth — safe because it only exposes counters,
// not user data). Mount behind an infra-only allowlist in production.
app.get('/_metrics', (_req, res) => {
  const mem = process.memoryUsage();
  res.json({
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    memory: {
      rssMB: Math.round(mem.rss / 1024 / 1024),
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
    },
    rateLimits: {
      general: rateLimitMap.size,
      auth: authRateLimitMap.size,
    },
    nodeVersion: process.version,
  });
});

app.get('/sitemap.xml', (req: Request, res: Response) => {
  const host = `${req.protocol}://${req.get('host') ?? 'localhost'}`;
  const lastmod = new Date().toISOString();
  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${host}/</loc><lastmod>${lastmod}</lastmod><priority>1.0</priority></url>
</urlset>`
  );
});

// Allow the landing to be indexed, but block API, auth-sensitive routes,
// and private share pages (they also carry noindex meta tags).
app.get('/robots.txt', (_req, res) => {
  res.type('text/plain').send(
    [
      'User-agent: *',
      'Disallow: /api/',
      'Disallow: /trpc/',
      'Disallow: /email/',
      'Disallow: /events',
      'Disallow: /p/',
      'Disallow: /_metrics',
      'Allow: /',
      '',
    ].join('\n')
  );
});

function legalPage(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#4f46e5">
  <title>${title} — Knowledge Vault</title>
  <style>
    :root{color-scheme:light dark}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;max-width:760px;margin:0 auto;padding:40px 24px;line-height:1.6;color:#111;background:#fafafa}
    @media (prefers-color-scheme:dark){body{background:#0b0b10;color:#eaeaea}a{color:#9bb6ff}hr{border-color:#222}}
    h1{font-size:1.7rem}
    h2{font-size:1.15rem;margin-top:2rem}
    nav{margin-bottom:24px;color:#666;font-size:.9rem}
    @media (prefers-color-scheme:dark){nav{color:#9a9a9a}}
    nav a{color:inherit;text-decoration:underline}
    ul{padding-left:20px}
    footer{margin-top:48px;padding-top:16px;border-top:1px solid #ddd;color:#888;font-size:.85rem}
    @media (prefers-color-scheme:dark){footer{border-top-color:#2a2a2a}}
  </style>
</head>
<body>
  <nav><a href="/">← Back</a> &middot; <a href="/privacy">Privacy</a> &middot; <a href="/terms">Terms</a></nav>
  <h1>${title}</h1>
  ${body}
  <footer>Last updated: ${new Date().toISOString().slice(0, 10)}</footer>
</body>
</html>`;
}

app.get('/privacy', (_req, res) => {
  res.type('html').send(
    legalPage(
      'Privacy Policy',
      `
<p>This Privacy Policy describes how Knowledge Vault ("we", "us") collects, uses, and protects the information you provide when you use our mobile app, browser extension, and API.</p>

<h2>1. What we collect</h2>
<ul>
  <li><strong>Account data:</strong> email address, hashed password (bcrypt), optional username, and a cryptographically random user id.</li>
  <li><strong>Your content:</strong> the notes, links, quotes, audio attachments, tasks, habits, goals, journal entries, tags, categories, comments, and flashcards you create. This content is private to your account unless you explicitly share it.</li>
  <li><strong>Usage metadata:</strong> timestamps on every record, last-login IP and user agent (for the security activity log), notification preferences, device push tokens, and audit events for AI feature usage.</li>
  <li><strong>AI request content:</strong> when you invoke an AI feature (suggest tags, summarize, search, etc.), the relevant text is sent to our LLM provider (currently Google's Gemini via the Forge API) to generate a response. We do not retain your text at the LLM provider beyond the duration of a request.</li>
  <li><strong>Optional external data:</strong> if you paste a URL, we fetch the page server-side to extract a title/description. We never execute page scripts and we never follow private-network addresses.</li>
</ul>

<h2>2. How we use your data</h2>
<ul>
  <li>To operate the product: authentication, sync across devices, AI features you opt into, push notifications you opt into, public shares you create.</li>
  <li>To detect abuse and enforce rate limits.</li>
  <li>To respond to you when you send feedback.</li>
  <li>We do <strong>not</strong> sell your data, and we do not use it for behavioral advertising.</li>
</ul>

<h2>3. Where your data is stored</h2>
<p>Your data is stored in the database you (or your self-hosted deployment) controls. When you use the hosted service, data is stored on servers operated by our hosting provider. Passwords are hashed with bcrypt (12 rounds). API keys are stored only as SHA-256 hashes.</p>

<h2>4. Who sees your data</h2>
<ul>
  <li>You, on any device logged in to your account.</li>
  <li>People you explicitly share items with (via email invitation or public link).</li>
  <li>Our LLM provider, at the moment of an AI request, for the request content only.</li>
  <li>Our operations team, when investigating security incidents.</li>
</ul>

<h2>5. Your rights</h2>
<ul>
  <li><strong>Export:</strong> download everything you've written as JSON or Markdown from Settings → Export. An <code>auth.exportPersonalData</code> API endpoint also returns a full dump.</li>
  <li><strong>Delete:</strong> Settings → Delete account permanently erases your content, sessions, audit log, and every auxiliary row we keep about you.</li>
  <li><strong>Correct:</strong> you can edit or remove any item you create.</li>
</ul>

<h2>6. Retention</h2>
<ul>
  <li>Audit log events older than 90 days are automatically purged.</li>
  <li>Soft-deleted items are permanently removed 30 days after they enter the trash.</li>
  <li>Email provider logs (if configured) follow that provider's retention policy.</li>
</ul>

<h2>7. Children</h2>
<p>Knowledge Vault is not directed at children under 13 and we do not knowingly collect data from anyone under 13.</p>

<h2>8. Contact</h2>
<p>For privacy questions or data-access requests, submit feedback from Settings → Send Feedback and pick "other", or write to the contact address listed on the repository.</p>
      `
    )
  );
});

app.get('/terms', (_req, res) => {
  res.type('html').send(
    legalPage(
      'Terms of Service',
      `
<p>By using Knowledge Vault ("the service"), you agree to these terms.</p>

<h2>1. The service</h2>
<p>Knowledge Vault is a personal knowledge management app: capture, organize, retrieve, and act on notes, tasks, habits, goals, and journal entries, with built-in AI assistance.</p>

<h2>2. Your account</h2>
<ul>
  <li>You are responsible for keeping your password and API keys confidential.</li>
  <li>You must provide a valid email for recovery and verification.</li>
  <li>You must be at least 13 years old.</li>
  <li>You agree not to impersonate others or create accounts for people without their consent.</li>
</ul>

<h2>3. Your content</h2>
<ul>
  <li>You keep ownership of what you create. We claim no rights in it.</li>
  <li>You grant us a limited license to store, transmit, and display your content for the purpose of running the service for you.</li>
  <li>If you share an item publicly, you are responsible for ensuring you have the right to share it.</li>
</ul>

<h2>4. Acceptable use</h2>
<p>You agree not to:</p>
<ul>
  <li>Use the service to store or share illegal content, malware, child exploitation material, or content that violates intellectual property rights.</li>
  <li>Attempt to bypass rate limits, permission scopes, or access other users' data.</li>
  <li>Abuse AI features to generate mass content that violates third-party terms (e.g. spam, platform manipulation).</li>
  <li>Resell the service, the API, or AI capacity without a written agreement.</li>
</ul>

<h2>5. AI features</h2>
<p>AI output is generated by machine learning models. It may be inaccurate or misleading. You should verify important facts before acting on AI output. We do not guarantee the correctness, completeness, or fitness for any particular purpose of AI results.</p>

<h2>6. Availability and changes</h2>
<p>We aim for high availability but do not guarantee uninterrupted service. We may change or discontinue features, with reasonable notice for substantial changes.</p>

<h2>7. Termination</h2>
<p>You may delete your account at any time from the app. We may suspend or terminate accounts that violate these terms, after reasonable attempts to notify where practical.</p>

<h2>8. Liability</h2>
<p>The service is provided "as is" without warranties of any kind. To the maximum extent permitted by law, we are not liable for indirect, incidental, or consequential damages arising from your use of the service.</p>

<h2>9. Governing law</h2>
<p>These terms are governed by the laws of the jurisdiction where the operating entity is incorporated. Disputes should first be raised through Settings → Send Feedback before any formal process.</p>

<h2>10. Changes to these terms</h2>
<p>We will post updates here with a new "Last updated" date. Material changes will be announced in-app when practical.</p>
      `
    )
  );
});

// Minimal standalone web client at /app. Reads the user's API key from
// localStorage (from the mobile app or browser-extension settings), then
// exposes a quick inbox viewer + one-tap item creation. This is *not* a
// full React app replacement — it's a safety net for users who need to
// read or capture from a desktop without installing anything.
app.get('/app', (_req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#4f46e5">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="icon" href="/pwa-icon-192.svg" type="image/svg+xml">
  <title>Knowledge Vault — Web</title>
  <style>
    :root{color-scheme:light dark}
    *{box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;margin:0;padding:24px;max-width:760px;margin:0 auto;line-height:1.5;color:#111;background:#fafafa}
    @media (prefers-color-scheme:dark){body{background:#0b0b10;color:#eaeaea}input,textarea,select{background:#16161b;color:#eaeaea;border-color:#27272a}}
    header{display:flex;align-items:center;gap:10px;margin-bottom:20px}
    .logo{width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,#4f46e5,#7c3aed);display:grid;place-items:center;color:#fff;font-weight:800;font-size:13px}
    h1{margin:0;font-size:1.3rem}
    h2{font-size:1rem;margin-top:1.6rem}
    input,textarea,select{width:100%;font:inherit;padding:8px 10px;border:1px solid #ddd;border-radius:6px;background:#fff;color:#111}
    textarea{min-height:80px;resize:vertical}
    button{font:inherit;padding:8px 14px;border:0;border-radius:6px;cursor:pointer;background:#4f46e5;color:#fff;font-weight:700}
    button:disabled{opacity:.5;cursor:wait}
    .row{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:8px}
    .card{padding:12px;border:1px solid #ddd;border-radius:8px;margin-bottom:8px;background:#fff}
    @media (prefers-color-scheme:dark){.card{background:#16161b;border-color:#27272a}}
    .muted{color:#888;font-size:.85rem}
    .toolbar{display:flex;gap:8px;align-items:center;margin-bottom:14px}
    #status{padding:8px 10px;border-radius:6px;font-size:.85rem;margin-bottom:12px;display:none}
    #status.ok{background:#16a34a22;color:#16a34a;display:block}
    #status.err{background:#dc262622;color:#dc2626;display:block}
  </style>
</head>
<body>
  <header>
    <div class="logo">KV</div>
    <h1>Knowledge Vault</h1>
  </header>

  <div id="status"></div>

  <div class="toolbar">
    <input id="apiKey" type="password" placeholder="Paste your kv_... API key" />
    <button id="saveKey" type="button">Save</button>
    <button id="forgetKey" type="button" style="background:#999">Forget</button>
  </div>

  <details>
    <summary>Quick capture</summary>
    <form id="captureForm" style="margin-top:10px">
      <div class="row">
        <input id="cTitle" placeholder="Title" required />
        <input id="cUrl" type="url" placeholder="URL (optional)" />
      </div>
      <textarea id="cContent" placeholder="Notes / content"></textarea>
      <div style="display:flex;gap:8px;margin-top:6px;align-items:center">
        <select id="cType">
          <option value="note">Note</option>
          <option value="link">Link</option>
          <option value="quote">Quote</option>
        </select>
        <select id="cLocation">
          <option value="inbox">Inbox</option>
          <option value="library">Library</option>
          <option value="archive">Archive</option>
        </select>
        <button id="captureBtn" type="submit">Save</button>
      </div>
    </form>
  </details>

  <h2>Inbox <button id="refreshBtn" type="button" style="background:#999;padding:4px 10px;font-size:.8rem">Refresh</button></h2>
  <div id="itemsList"><p class="muted">Paste an API key and press "Save" to load your inbox.</p></div>

  <script src="/app.js"></script>
</body>
</html>`);
});

app.get('/app.js', (_req, res) => {
  res.type('application/javascript').send(`
const BASE = window.location.origin;
const STATUS = document.getElementById('status');
const KEY_KEY = 'kv_api_key';

function setStatus(text, ok) {
  STATUS.textContent = text;
  STATUS.className = ok ? 'ok' : 'err';
}

function getKey() { return localStorage.getItem(KEY_KEY) || ''; }

function render(items) {
  const list = document.getElementById('itemsList');
  if (!items || items.length === 0) {
    list.innerHTML = '<p class="muted">No items in your inbox.</p>';
    return;
  }
  list.innerHTML = items.map(function(i) {
    var title = String(i.title || 'Untitled').replace(/[&<>]/g, function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c];});
    var snippet = String(i.content || '').slice(0, 200).replace(/[&<>]/g, function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c];});
    return '<div class="card"><strong>' + title + '</strong><div class="muted">' + i.type + ' · ' + (i.createdAt || '') + '</div>' + (snippet ? '<div style="margin-top:6px">' + snippet + '</div>' : '') + (i.url ? '<a href="' + i.url + '" target="_blank" rel="noreferrer" style="font-size:.85rem">open link</a>' : '') + '</div>';
  }).join('');
}

async function refresh() {
  const key = getKey();
  if (!key) return;
  try {
    const r = await fetch(BASE + '/api/items', { headers: { 'x-api-key': key } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    render(data.items || []);
    setStatus('Loaded ' + (data.items || []).length + ' items', true);
  } catch (e) {
    setStatus('Load failed: ' + e.message, false);
  }
}

document.getElementById('saveKey').addEventListener('click', function() {
  const val = document.getElementById('apiKey').value.trim();
  if (!val) { setStatus('Paste an API key first', false); return; }
  localStorage.setItem(KEY_KEY, val);
  setStatus('Key saved locally', true);
  refresh();
});
document.getElementById('forgetKey').addEventListener('click', function() {
  localStorage.removeItem(KEY_KEY);
  document.getElementById('apiKey').value = '';
  setStatus('Key cleared', true);
});
document.getElementById('refreshBtn').addEventListener('click', refresh);
document.getElementById('captureForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  const key = getKey();
  if (!key) { setStatus('Save an API key first', false); return; }
  const body = {
    title: document.getElementById('cTitle').value.trim(),
    url: document.getElementById('cUrl').value.trim() || null,
    content: document.getElementById('cContent').value.trim() || null,
    type: document.getElementById('cType').value,
    location: document.getElementById('cLocation').value
  };
  try {
    const r = await fetch(BASE + '/api/items', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key },
      body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    document.getElementById('captureForm').reset();
    setStatus('Saved', true);
    refresh();
  } catch (e) {
    setStatus('Save failed: ' + e.message, false);
  }
});

// Pre-fill the key input for convenience
const k = getKey();
if (k) { document.getElementById('apiKey').value = k; refresh(); }
`);
});

// PWA manifest — lets the landing page be installable as a web app
app.get('/manifest.webmanifest', (_req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json');
  res.send(
    JSON.stringify({
      name: 'Knowledge Vault',
      short_name: 'Vault',
      description: 'Capture anything. Find everything. Act on what matters.',
      start_url: '/',
      display: 'standalone',
      background_color: '#0d0d10',
      theme_color: '#4f46e5',
      icons: [
        { src: '/pwa-icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
        { src: '/pwa-icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
      ],
    })
  );
});

// Placeholder SVG icons for the PWA; production should upload proper PNGs.
const PWA_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" width="192" height="192"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#4f46e5"/><stop offset="100%" stop-color="#7c3aed"/></linearGradient></defs><rect width="192" height="192" rx="36" fill="url(#g)"/><text x="96" y="118" font-size="72" text-anchor="middle" fill="#fff" font-family="system-ui,Helvetica,Arial,sans-serif" font-weight="800">KV</text></svg>`;
app.get('/pwa-icon-192.svg', (_req, res) => {
  res.type('image/svg+xml').send(PWA_ICON_SVG);
});
app.get('/pwa-icon-512.svg', (_req, res) => {
  res.type('image/svg+xml').send(PWA_ICON_SVG.replace(/width="192" height="192"/, 'width="512" height="512"'));
});

// Small bootstrap script that registers the service worker.
app.get('/init.js', (_req, res) => {
  res
    .type('application/javascript')
    .send(
      `if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js').catch(function(){}); }\n`
    );
});

// Minimal service worker for offline landing + install prompts.
app.get('/sw.js', (_req, res) => {
  res.type('application/javascript').send(`
const CACHE = 'kv-landing-v1';
const ASSETS = ['/', '/manifest.webmanifest'];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  // Never cache API or SSE or public share pages — they must stay fresh
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/trpc/') ||
    url.pathname.startsWith('/events') ||
    url.pathname.startsWith('/p/')
  ) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((hit) => hit || fetch(event.request))
  );
});
`);
});

// Minimal public landing. Search engines can find this.
app.get('/', (_req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="Knowledge Vault — capture, organize, and act on everything you know. AI-powered, offline-first, mobile-native.">
  <meta name="theme-color" content="#4f46e5">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="icon" href="/pwa-icon-192.svg" type="image/svg+xml">
  <title>Knowledge Vault</title>
  <style>
    :root{color-scheme:light dark}
    *{box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;max-width:760px;margin:0 auto;padding:48px 24px;line-height:1.55;color:#111;background:#fafafa}
    @media (prefers-color-scheme:dark){body{background:#0b0b10;color:#eaeaea}a{color:#9bb6ff}hr{border-color:#222}}
    header{display:flex;align-items:center;gap:12px;margin-bottom:24px}
    .logo{width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,#4f46e5,#7c3aed);display:grid;place-items:center;color:#fff;font-weight:800}
    h1{margin:0;font-size:1.6rem}
    h2{font-size:1.15rem;margin-top:2.5rem}
    .tagline{color:#666;margin-top:4px}
    @media (prefers-color-scheme:dark){.tagline{color:#9a9a9a}}
    ul{padding-left:20px}
    li{margin-bottom:6px}
    .cta{display:inline-block;background:#4f46e5;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;margin-top:12px;font-weight:700}
    footer{margin-top:48px;padding-top:16px;border-top:1px solid #ddd;color:#888;font-size:.85rem}
    @media (prefers-color-scheme:dark){footer{border-top-color:#2a2a2a}}
    code{background:#0001;padding:2px 6px;border-radius:4px;font-size:.88rem}
    @media (prefers-color-scheme:dark){code{background:#fff1}}
  </style>
</head>
<body>
  <header>
    <div class="logo">KV</div>
    <div>
      <h1>Knowledge Vault</h1>
      <div class="tagline">Capture anything. Find everything. Act on what matters.</div>
    </div>
  </header>

  <p>A personal knowledge system with built-in AI. Works offline. Mobile-native.</p>

  <a class="cta" href="/app">Open web app</a>
  <a class="cta" href="https://github.com/abdowps-jpg/knowledge_vault" style="background:#666;margin-left:8px">See on GitHub</a>

  <h2>What you get</h2>
  <ul>
    <li>Capture notes, links, quotes, and audio — one inbox for everything.</li>
    <li>AI that summarizes, suggests tags, extracts tasks, and answers questions about your own notes.</li>
    <li>Tasks, habits, goals, and a daily journal — the "act" half of knowledge work.</li>
    <li>Share any item via password-protected public link.</li>
    <li>Browser extension (Chrome / Firefox) for one-click save from anywhere.</li>
    <li>REST API + webhooks + Markdown import/export — your data stays yours.</li>
  </ul>

  <h2>For developers</h2>
  <p>
    REST docs: <a href="/api/schema"><code>/api/schema</code></a> &middot;
    Health: <a href="/healthz"><code>/healthz</code></a> &middot;
    Metrics: <a href="/_metrics"><code>/_metrics</code></a>
  </p>

  <footer>
    © Knowledge Vault. This page is the API host landing — install the mobile app or browser extension to use the product.
  </footer>
  <script src="/init.js"></script>
</body>
</html>`);
});

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// JSON variant of the public link — useful for embedding from third-party tools
app.get('/p/:token.json', async (req: Request, res: Response) => {
  try {
    const { publicLinks } = await import('../schema/public_links');
    const tokenRaw = String(req.params.token ?? '').trim();
    if (!tokenRaw || tokenRaw.length < 8) {
      return res.status(400).json({ error: 'invalid_token' });
    }
    const rows = await db.select().from(publicLinks).where(eq(publicLinks.token, tokenRaw)).limit(1);
    const link = rows[0];
    if (!link || link.isRevoked) return res.status(404).json({ error: 'not_found' });
    if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
      return res.status(410).json({ error: 'expired' });
    }
    if (link.passwordHash) {
      return res.status(401).json({ error: 'password_required' });
    }
    const itemRows = await db
      .select()
      .from(items)
      .where(and(eq(items.id, link.itemId), isNull(items.deletedAt)))
      .limit(1);
    const item = itemRows[0];
    if (!item) return res.status(404).json({ error: 'item_not_found' });
    // Fire-and-forget view bump
    db.update(publicLinks)
      .set({ viewCount: (link.viewCount ?? 0) + 1, lastViewedAt: new Date() })
      .where(eq(publicLinks.id, link.id))
      .catch(() => {});
    return res.json({
      item: {
        id: item.id,
        type: item.type,
        title: item.title,
        content: item.content,
        url: item.url,
        createdAt: item.createdAt,
      },
      expiresAt: link.expiresAt,
    });
  } catch (err) {
    reportError(err instanceof Error ? err : new Error(String(err)), { source: 'public-link-json' });
    res.status(500).json({ error: 'internal' });
  }
});

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

    // Fire-and-forget view tally
    db.update(publicLinks)
      .set({
        viewCount: (link.viewCount ?? 0) + 1,
        lastViewedAt: new Date(),
      })
      .where(eq(publicLinks.id, link.id))
      .catch(() => {});

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

// Validate env vars before listening. In production, hard-fail on errors so
// we never serve traffic with a broken configuration.
const envReport = validateEnv();
printValidation(envReport);
if (!envReport.ok && process.env.NODE_ENV === 'production') {
  console.error('[env] Refusing to start: fix the errors above before running in production.');
  process.exit(1);
}

app.listen(Number(port), host, () => {
  console.log(`Server running on http://${host}:${port}`);
});
