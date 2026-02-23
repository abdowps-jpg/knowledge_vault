import { randomUUID } from "crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { db } from "../db";
import { tasks } from "../schema/tasks";
import { taskTimeEntries } from "../schema/task_time_entries";
import { protectedProcedure, router } from "../trpc";

let ensureTablePromise: Promise<void> | null = null;

async function ensureTaskTimeTable() {
  if (!ensureTablePromise) {
    ensureTablePromise = Promise.resolve(
      db.run(sql`
        CREATE TABLE IF NOT EXISTS task_time_entries (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          task_id TEXT NOT NULL,
          started_at INTEGER NOT NULL,
          ended_at INTEGER,
          duration_seconds INTEGER,
          created_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `)
    ).then(() => undefined);
  }
  return ensureTablePromise;
}

async function assertTaskOwnership(taskId: string, userId: string) {
  const rows = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
    .limit(1);
  if (rows.length === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
  }
}

export const taskTimeRouter = router({
  start: protectedProcedure
    .input(z.object({ taskId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ensureTaskTimeTable();
      await assertTaskOwnership(input.taskId, ctx.user.id);

      const now = new Date();
      const activeRows = await db
        .select()
        .from(taskTimeEntries)
        .where(and(eq(taskTimeEntries.userId, ctx.user.id), isNull(taskTimeEntries.endedAt)));

      for (const active of activeRows) {
        const duration = Math.max(0, Math.floor((now.getTime() - active.startedAt.getTime()) / 1000));
        await db
          .update(taskTimeEntries)
          .set({
            endedAt: now,
            durationSeconds: duration,
          })
          .where(eq(taskTimeEntries.id, active.id));
      }

      const record = {
        id: randomUUID(),
        userId: ctx.user.id,
        taskId: input.taskId,
        startedAt: now,
        endedAt: null,
        durationSeconds: null,
        createdAt: now,
      };
      await db.insert(taskTimeEntries).values(record);
      return { success: true as const, entryId: record.id };
    }),

  stop: protectedProcedure
    .input(z.object({ taskId: z.string().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      await ensureTaskTimeTable();
      const filters = [eq(taskTimeEntries.userId, ctx.user.id), isNull(taskTimeEntries.endedAt)];
      if (input?.taskId) {
        await assertTaskOwnership(input.taskId, ctx.user.id);
        filters.push(eq(taskTimeEntries.taskId, input.taskId));
      }

      const active = await db
        .select()
        .from(taskTimeEntries)
        .where(and(...filters))
        .limit(1);
      if (active.length === 0) {
        return { success: false as const, reason: "no_active_timer" as const };
      }

      const now = new Date();
      const duration = Math.max(0, Math.floor((now.getTime() - active[0].startedAt.getTime()) / 1000));
      await db
        .update(taskTimeEntries)
        .set({
          endedAt: now,
          durationSeconds: duration,
        })
        .where(eq(taskTimeEntries.id, active[0].id));

      return { success: true as const, taskId: active[0].taskId, durationSeconds: duration };
    }),

  listByTasks: protectedProcedure
    .input(z.object({ taskIds: z.array(z.string()).max(200) }))
    .query(async ({ ctx, input }) => {
      await ensureTaskTimeTable();
      if (input.taskIds.length === 0) {
        return { totals: {} as Record<string, number>, activeTaskId: null as string | null };
      }

      const ownedTasks = await db
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.userId, ctx.user.id), inArray(tasks.id, input.taskIds)));
      const ownedIds = ownedTasks.map((t) => t.id);
      if (ownedIds.length === 0) {
        return { totals: {} as Record<string, number>, activeTaskId: null as string | null };
      }

      const rows = await db
        .select()
        .from(taskTimeEntries)
        .where(and(eq(taskTimeEntries.userId, ctx.user.id), inArray(taskTimeEntries.taskId, ownedIds)));

      const now = Date.now();
      const totals: Record<string, number> = {};
      let activeTaskId: string | null = null;

      for (const row of rows) {
        const completedSeconds = row.durationSeconds ?? 0;
        totals[row.taskId] = (totals[row.taskId] ?? 0) + completedSeconds;
        if (!row.endedAt) {
          activeTaskId = row.taskId;
          const runningSeconds = Math.max(0, Math.floor((now - row.startedAt.getTime()) / 1000));
          totals[row.taskId] = (totals[row.taskId] ?? 0) + runningSeconds;
        }
      }

      return { totals, activeTaskId };
    }),
});
