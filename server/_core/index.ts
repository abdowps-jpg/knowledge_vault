import express from 'express';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { router } from '../trpc';
import { itemsRouter } from '../routers/items';

const app = express();
const port = process.env.PORT || 3000;

// إنشاء main router
const appRouter = router({
  items: itemsRouter,
});

export type AppRouter = typeof appRouter;

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
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
  })
);

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});