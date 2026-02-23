import { randomUUID } from "crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../db";
import { subtasks } from "../schema/subtasks";
import { tasks } from "../schema/tasks";
import { protectedProcedure, router } from "../trpc";

let ensureTablePromise: Promise<void> | null = null;

async function ensureSubtasksTable() {
  if (!ensureTablePromise) {
    ensureTablePromise = Promise.resolve(
      db.run(sql`
        CREATE TABLE IF NOT EXISTS subtasks (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          task_id TEXT NOT NULL,
          title TEXT NOT NULL,
          is_completed INTEGER DEFAULT 0,
          sort_order INTEGER DEFAULT 0,
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `)
    ).then(() => undefined);
  }
  return ensureTablePromise;
}

async function ensureTaskOwner(taskId: string, userId: string) {
  const rows = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

export const subtasksRouter = router({
  list: protectedProcedure
    .input(z.object({ taskId: z.string() }))
    .query(async ({ ctx, input }) => {
      await ensureSubtasksTable();
      if (!(await ensureTaskOwner(input.taskId, ctx.user.id))) return [];
      return db.select().from(subtasks).where(and(eq(subtasks.userId, ctx.user.id), eq(subtasks.taskId, input.taskId)));
    }),

  summary: protectedProcedure
    .input(z.object({ taskIds: z.array(z.string()).max(200) }))
    .query(async ({ ctx, input }) => {
      await ensureSubtasksTable();
      if (input.taskIds.length === 0) return {} as Record<string, { total: number; completed: number }>;

      const rows = await db
        .select()
        .from(subtasks)
        .where(and(eq(subtasks.userId, ctx.user.id), inArray(subtasks.taskId, input.taskIds)));
      const result: Record<string, { total: number; completed: number }> = {};
      for (const row of rows) {
        const current = result[row.taskId] ?? { total: 0, completed: 0 };
        current.total += 1;
        if (row.isCompleted) current.completed += 1;
        result[row.taskId] = current;
      }
      return result;
    }),

  create: protectedProcedure
    .input(z.object({ taskId: z.string(), title: z.string().min(1).max(300) }))
    .mutation(async ({ ctx, input }) => {
      await ensureSubtasksTable();
      if (!(await ensureTaskOwner(input.taskId, ctx.user.id))) return { success: false as const };

      const existing = await db
        .select({ id: subtasks.id })
        .from(subtasks)
        .where(and(eq(subtasks.userId, ctx.user.id), eq(subtasks.taskId, input.taskId)));
      const record = {
        id: randomUUID(),
        userId: ctx.user.id,
        taskId: input.taskId,
        title: input.title.trim(),
        isCompleted: false,
        sortOrder: existing.length,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await db.insert(subtasks).values(record);
      return { success: true as const, subtask: record };
    }),

  toggle: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ensureSubtasksTable();
      const rows = await db
        .select()
        .from(subtasks)
        .where(and(eq(subtasks.id, input.id), eq(subtasks.userId, ctx.user.id)))
        .limit(1);
      if (rows.length === 0) return { success: false as const };
      const nextDone = !rows[0].isCompleted;
      await db
        .update(subtasks)
        .set({ isCompleted: nextDone, updatedAt: new Date() })
        .where(eq(subtasks.id, input.id));
      return { success: true as const, isCompleted: nextDone };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ensureSubtasksTable();
      await db.delete(subtasks).where(and(eq(subtasks.id, input.id), eq(subtasks.userId, ctx.user.id)));
      return { success: true as const };
    }),
});
