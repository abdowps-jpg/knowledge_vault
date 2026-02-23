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
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-trpc-source');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
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
