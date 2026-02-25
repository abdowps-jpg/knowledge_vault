import { systemRouter } from "./_core/systemRouter";
import { router } from "./_core/trpc";
import { analyticsRouter } from "./routers/analytics";
import { apiRouter } from "./routers/api";
import { attachmentsRouter } from "./routers/attachments";
import { authRouter } from "./routers/auth";
import { categoriesRouter } from "./routers/categories";
import { devicesRouter } from "./routers/devices";
import { exportRouter } from "./routers/export";
import { goalsRouter } from "./routers/goals";
import { habitsRouter } from "./routers/habits";
import { itemCommentsRouter } from "./routers/item-comments";
import { itemSharesRouter } from "./routers/item-shares";
import { itemVersionsRouter } from "./routers/item-versions";
import { itemsRouter } from "./routers/items";
import { journalRouter } from "./routers/journal";
import { publicLinksRouter } from "./routers/public-links";
import { statsRouter } from "./routers/stats";
import { subtasksRouter } from "./routers/subtasks";
import { syncRouter } from "./routers/sync";
import { tagsRouter } from "./routers/tags";
import { taskTimeRouter } from "./routers/task-time";
import { tasksRouter } from "./routers/tasks";
import { transcriptionRouter } from "./routers/transcription";

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
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
});

export type AppRouter = typeof appRouter;
