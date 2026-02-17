import express from 'express';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { createTRPCContext, router, publicProcedure } from '../trpc';
import { verifyToken } from '../lib/auth';
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

const app = express();
const port = process.env.PORT || 3000;

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
  // test endpoint
  hello: publicProcedure.query(() => {
    return { message: 'Hello from tRPC!' };
  }),
});

export type AppRouter = typeof appRouter;

// Required for tRPC POST/JSON batch requests
app.use(express.json());

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

// tRPC middleware
app.use(
  '/trpc',
  createExpressMiddleware({
    router: appRouter,
    createContext: ({ req, res }) => {
      const authHeader = req.headers.authorization;
      let user = null;

      if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7).trim();
        const payload = verifyToken(token);
        if (payload) {
          user = {
            id: payload.sub,
            email: payload.email,
            username: payload.username ?? null,
          };
        }
      }

      return createTRPCContext({ req, res, user });
    },
  })
);

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
