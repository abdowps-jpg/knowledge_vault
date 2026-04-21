import { randomUUID } from 'crypto';
import { and, asc, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { db } from '../db';
import { tasks } from '../schema/tasks';
import { protectedProcedure, router } from '../trpc';

const recurrenceSchema = z.enum(['daily', 'weekly', 'monthly']);

function addDays(baseDate: Date, days: number): Date {
  const next = new Date(baseDate);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const tasksRouter = router({
  // Get tasks with optional completion filter, sorted by due date
  list: protectedProcedure
    .input(
      z.object({
        isCompleted: z.boolean().optional(),
        sortOrder: z.enum(['asc', 'desc']).default('asc'),
        limit: z.number().min(1).max(100).default(25),
        cursor: z.number().int().min(0).optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      try {
        const cursor = input.cursor ?? 0;
        const conditions = [eq(tasks.userId, ctx.user.id), isNull(tasks.deletedAt)];

        if (typeof input.isCompleted === 'boolean') {
          conditions.push(eq(tasks.isCompleted, input.isCompleted));
        }

        const result = await db
          .select()
          .from(tasks)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(
            input.sortOrder === 'asc' ? asc(tasks.dueDate) : desc(tasks.dueDate),
            desc(tasks.createdAt)
          )
          .limit(input.limit + 1)
          .offset(cursor);

        const safeResult = result || [];
        const hasMore = safeResult.length > input.limit;
        const pageItems = hasMore ? safeResult.slice(0, input.limit) : safeResult;

        const payload = {
          items: pageItems,
          nextCursor: hasMore ? cursor + input.limit : undefined,
        };
        return payload;
      } catch (error) {
        console.error('Error fetching tasks:', error);
        return { items: [], nextCursor: undefined };
      }
    }),

  // Create task
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        dueDate: z.string().optional(),
        blockedByTaskId: z.string().optional(),
        locationLat: z.string().optional(),
        locationLng: z.string().optional(),
        locationRadiusMeters: z.number().int().min(50).max(5000).optional(),
        isUrgent: z.boolean().optional(),
        isImportant: z.boolean().optional(),
        priority: z.enum(['low', 'medium', 'high']).default('medium'),
        recurrence: recurrenceSchema.optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        if (input.blockedByTaskId) {
          const blockerRows = await db
            .select({ id: tasks.id })
            .from(tasks)
            .where(and(eq(tasks.id, input.blockedByTaskId), eq(tasks.userId, ctx.user.id), isNull(tasks.deletedAt)))
            .limit(1);
          if (blockerRows.length === 0) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Blocking task not found' });
          }
        }

        const newTask = {
          id: randomUUID(),
          userId: ctx.user.id,
          title: input.title,
          description: input.description || null,
          dueDate: input.dueDate || null,
          blockedByTaskId: input.blockedByTaskId || null,
          locationLat: input.locationLat || null,
          locationLng: input.locationLng || null,
          locationRadiusMeters: input.locationRadiusMeters ?? null,
          isUrgent: input.isUrgent ?? false,
          isImportant: input.isImportant ?? false,
          priority: input.priority,
          isCompleted: false,
          completedAt: null,
          recurrence: input.recurrence || null,
        };

        await db.insert(tasks).values(newTask);
        return newTask;
      } catch (error) {
        console.error('Error creating task:', error);
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create task' });
      }
    }),

  // Update task
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        dueDate: z.string().optional(),
        blockedByTaskId: z.string().nullable().optional(),
        locationLat: z.string().nullable().optional(),
        locationLng: z.string().nullable().optional(),
        locationRadiusMeters: z.number().int().min(50).max(5000).nullable().optional(),
        isUrgent: z.boolean().optional(),
        isImportant: z.boolean().optional(),
        priority: z.enum(['low', 'medium', 'high']).optional(),
        isCompleted: z.boolean().optional(),
        recurrence: recurrenceSchema.nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const { id, isCompleted, ...data } = input;
        const existingTaskRows = await db
          .select()
          .from(tasks)
          .where(and(eq(tasks.id, id), eq(tasks.userId, ctx.user.id), isNull(tasks.deletedAt)))
          .limit(1);
        const existingTask = existingTaskRows[0];
        if (!existingTask) {
          return { success: false };
        }

        const updateData: Record<string, unknown> = {
          ...data,
          updatedAt: new Date(),
        };

        if (typeof isCompleted === 'boolean') {
          const blockerId =
            typeof input.blockedByTaskId === 'string'
              ? input.blockedByTaskId
              : existingTask.blockedByTaskId || null;
          if (isCompleted && blockerId) {
            const blocker = await db
              .select()
              .from(tasks)
              .where(and(eq(tasks.id, blockerId), eq(tasks.userId, ctx.user.id)))
              .limit(1);
            if (blocker.length > 0 && !blocker[0].isCompleted) {
              throw new TRPCError({ code: 'BAD_REQUEST', message: 'Task is blocked by an incomplete dependency' });
            }
          }
          updateData.isCompleted = isCompleted;
          updateData.completedAt = isCompleted ? new Date() : null;
        }

        await db.update(tasks).set(updateData).where(and(eq(tasks.id, id), eq(tasks.userId, ctx.user.id)));
        return { success: true };
      } catch (error) {
        console.error('Error updating task:', error);
        return { success: false };
      }
    }),

  // Delete task
  delete: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        await db.delete(tasks).where(and(eq(tasks.id, input.id), eq(tasks.userId, ctx.user.id)));
        return { success: true };
      } catch (error) {
        console.error('Error deleting task:', error);
        return { success: false };
      }
    }),

  // Toggle completion status
  toggle: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const existing = await db
          .select()
          .from(tasks)
          .where(and(eq(tasks.id, input.id), eq(tasks.userId, ctx.user.id), isNull(tasks.deletedAt)))
          .limit(1);

        if (!existing || existing.length === 0) {
          return { success: false, isCompleted: false };
        }

        const nextIsCompleted = !existing[0].isCompleted;
        if (nextIsCompleted && existing[0].blockedByTaskId) {
          const blocker = await db
            .select()
            .from(tasks)
            .where(and(eq(tasks.id, existing[0].blockedByTaskId), eq(tasks.userId, ctx.user.id)))
            .limit(1);
          if (blocker.length > 0 && !blocker[0].isCompleted) {
            return { success: false, isCompleted: false, blocked: true };
          }
        }

        await db
          .update(tasks)
          .set({
            isCompleted: nextIsCompleted,
            completedAt: nextIsCompleted ? new Date() : null,
            updatedAt: new Date(),
          })
          .where(and(eq(tasks.id, input.id), eq(tasks.userId, ctx.user.id)));

        return { success: true, isCompleted: nextIsCompleted };
      } catch (error) {
        console.error('Error toggling task completion:', error);
        return { success: false, isCompleted: false };
      }
    }),

  // Complete a recurring task and create next occurrence
  completeRecurring: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const existing = await db
          .select()
          .from(tasks)
          .where(and(eq(tasks.id, input.id), eq(tasks.userId, ctx.user.id), isNull(tasks.deletedAt)))
          .limit(1);

        if (!existing || existing.length === 0) {
          return { success: false, isCompleted: false, newTask: null };
        }

        const current = existing[0];

        if (!current.recurrence || !['daily', 'weekly', 'monthly'].includes(current.recurrence)) {
          return { success: false, isCompleted: false, newTask: null };
        }

        const baseDate = current.dueDate ? new Date(current.dueDate as unknown as string) : new Date();
        const fallbackBase = Number.isNaN(baseDate.getTime()) ? new Date() : baseDate;

        const nextDueDate =
          current.recurrence === 'daily'
            ? addDays(fallbackBase, 1)
            : current.recurrence === 'weekly'
            ? addDays(fallbackBase, 7)
            : addDays(fallbackBase, 30);

        const nextTask = await db.transaction(async (tx) => {
          await tx
            .update(tasks)
            .set({
              isCompleted: true,
              completedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(and(eq(tasks.id, input.id), eq(tasks.userId, ctx.user.id)));

          const createdTask = {
            id: randomUUID(),
            userId: current.userId,
            title: current.title,
            description: current.description,
            dueDate: formatDateOnly(nextDueDate),
            blockedByTaskId: current.blockedByTaskId,
            locationLat: current.locationLat,
            locationLng: current.locationLng,
            locationRadiusMeters: current.locationRadiusMeters,
            isUrgent: current.isUrgent,
            isImportant: current.isImportant,
            priority: current.priority,
            isCompleted: false,
            completedAt: null,
            recurrence: current.recurrence,
          };

          await tx.insert(tasks).values(createdTask);
          return createdTask;
        });

        return { success: true, isCompleted: true, newTask: nextTask };
      } catch (error) {
        console.error('Error completing recurring task:', error);
        return { success: false, isCompleted: false, newTask: null };
      }
    }),

  syncTasks: protectedProcedure
    .input(
      z.object({
        since: z.number().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const sinceDate = input.since ? new Date(input.since) : new Date(0);
      const result = await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.userId, ctx.user.id), gte(tasks.updatedAt, sinceDate)))
        .orderBy(desc(tasks.updatedAt));
      return result ?? [];
    }),

  stats: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, ctx.user.id), isNull(tasks.deletedAt)));
    const total = rows.length;
    const completed = rows.filter((t) => t.isCompleted).length;
    const pending = total - completed;
    const byPriority = { low: 0, medium: 0, high: 0 };
    for (const t of rows) {
      const p = (t.priority ?? 'medium') as 'low' | 'medium' | 'high';
      if (p in byPriority) byPriority[p] += 1;
    }
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const completedThisWeek = rows.filter((t) => {
      if (!t.isCompleted || !t.completedAt) return false;
      const ts = new Date(t.completedAt).getTime();
      return !Number.isNaN(ts) && ts >= weekAgo;
    }).length;
    return {
      total,
      completed,
      pending,
      byPriority,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      completedThisWeek,
    };
  }),

  searchFast: protectedProcedure
    .input(
      z.object({
        q: z.string().min(1).max(120),
        limit: z.number().int().min(1).max(50).default(20),
        includeCompleted: z.boolean().default(false),
      })
    )
    .query(async ({ input, ctx }) => {
      const needle = `%${input.q.trim().replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
      const where = [
        eq(tasks.userId, ctx.user.id),
        isNull(tasks.deletedAt),
        sql`(lower(${tasks.title}) LIKE lower(${needle}) OR lower(coalesce(${tasks.description}, '')) LIKE lower(${needle}))`,
      ];
      if (!input.includeCompleted) where.push(eq(tasks.isCompleted, false));
      const rows = await db
        .select()
        .from(tasks)
        .where(and(...where))
        .orderBy(desc(tasks.updatedAt))
        .limit(input.limit);
      return rows;
    }),

  atRisk: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, ctx.user.id), isNull(tasks.deletedAt), eq(tasks.isCompleted, false)));
    const now = Date.now();
    const overdue: typeof rows = [];
    const dueSoon: typeof rows = [];
    const staleHigh: typeof rows = [];
    for (const t of rows) {
      const due = t.dueDate ? new Date(t.dueDate).getTime() : null;
      if (due !== null && !Number.isNaN(due)) {
        if (due < now) overdue.push(t);
        else if (due - now < 2 * 24 * 60 * 60 * 1000) dueSoon.push(t);
      }
      const created = t.createdAt ? new Date(t.createdAt).getTime() : null;
      if (created && t.priority === 'high' && now - created > 7 * 24 * 60 * 60 * 1000) {
        staleHigh.push(t);
      }
    }
    return {
      overdue: overdue.slice(0, 20),
      dueSoon: dueSoon.slice(0, 20),
      staleHighPriority: staleHigh.slice(0, 10),
    };
  }),

  bulkComplete: protectedProcedure
    .input(
      z.object({
        ids: z.array(z.string()).min(1).max(100),
        isCompleted: z.boolean().default(true),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const now = new Date();
      const result = await db
        .update(tasks)
        .set({
          isCompleted: input.isCompleted,
          completedAt: input.isCompleted ? now : null,
          updatedAt: now,
        })
        .where(
          and(
            inArray(tasks.id, input.ids),
            eq(tasks.userId, ctx.user.id),
            isNull(tasks.deletedAt)
          )
        );
      return { success: true as const, updated: input.ids.length, result: Array.isArray(result) ? result.length : undefined };
    }),
});
