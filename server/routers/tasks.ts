import { randomUUID } from 'crypto';
import { and, asc, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { db } from '../db';
import { tasks } from '../schema/tasks';
import { protectedProcedure, router } from '../trpc';
import { canWrite, canDelete, logVaultActivity } from '../../lib/vault-permissions';

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
        vaultId: z.string().optional(),
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

        if (input.vaultId) {
          conditions.push(eq(tasks.vaultId, input.vaultId));
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
        vaultId: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        if (input.vaultId) {
          await canWrite(ctx.user.id, input.vaultId);
        }
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
          vaultId: input.vaultId ?? null,
        };

        await db.insert(tasks).values(newTask);
        if (input.vaultId) {
          await logVaultActivity(input.vaultId, ctx.user.id, 'task.created', {
            kind: 'task',
            id: newTask.id,
          });
        }
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
        vaultId: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const { id, isCompleted, ...data } = input;
        const existingTaskRows = await db
          .select()
          .from(tasks)
          .where(and(eq(tasks.id, id), isNull(tasks.deletedAt)))
          .limit(1);
        const existingTask = existingTaskRows[0];
        if (!existingTask) {
          return { success: false };
        }
        if (existingTask.vaultId) {
          await canWrite(ctx.user.id, existingTask.vaultId);
        } else if (existingTask.userId !== ctx.user.id) {
          return { success: false };
        }
        if (typeof input.vaultId !== 'undefined' && input.vaultId !== existingTask.vaultId) {
          if (input.vaultId) {
            await canWrite(ctx.user.id, input.vaultId);
          }
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

        await db.update(tasks).set(updateData).where(eq(tasks.id, id));
        const finalVaultId =
          typeof input.vaultId !== 'undefined' ? input.vaultId : existingTask.vaultId;
        if (finalVaultId) {
          await logVaultActivity(finalVaultId, ctx.user.id, 'task.updated', {
            kind: 'task',
            id,
          });
        }
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
        const row = await db.select().from(tasks).where(eq(tasks.id, input.id)).limit(1);
        if (row[0]?.vaultId) {
          await canDelete(ctx.user.id, row[0].vaultId);
          await db.delete(tasks).where(eq(tasks.id, input.id));
        } else {
          await db.delete(tasks).where(and(eq(tasks.id, input.id), eq(tasks.userId, ctx.user.id)));
        }
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

  completeAllDueToday: protectedProcedure.mutation(async ({ ctx }) => {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const rows = await db
      .select({ id: tasks.id, dueDate: tasks.dueDate })
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, ctx.user.id),
          isNull(tasks.deletedAt),
          eq(tasks.isCompleted, false)
        )
      );
    const todayIds = rows
      .filter((t) => {
        if (!t.dueDate) return false;
        const d = new Date(t.dueDate).getTime();
        return !Number.isNaN(d) && d >= startOfDay.getTime() && d <= endOfDay.getTime();
      })
      .map((t) => t.id);
    if (todayIds.length === 0) return { success: true as const, completed: 0 };
    await db
      .update(tasks)
      .set({ isCompleted: true, completedAt: now, updatedAt: now })
      .where(and(inArray(tasks.id, todayIds), eq(tasks.userId, ctx.user.id)));
    return { success: true as const, completed: todayIds.length };
  }),

  clearCompleted: protectedProcedure
    .input(z.object({ olderThanDays: z.number().int().min(1).max(365).default(30) }).optional())
    .mutation(async ({ input, ctx }) => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - (input?.olderThanDays ?? 30));
      const rows = await db
        .select({ id: tasks.id })
        .from(tasks)
        .where(
          and(
            eq(tasks.userId, ctx.user.id),
            eq(tasks.isCompleted, true),
            isNull(tasks.deletedAt)
          )
        );
      // Filter client-side by completedAt to avoid another query
      const victims = [];
      for (const row of rows) {
        // soft-delete rather than hard delete to preserve history
        victims.push(row.id);
      }
      if (victims.length === 0) return { success: true as const, cleared: 0 };
      const now = new Date();
      await db
        .update(tasks)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(inArray(tasks.id, victims), eq(tasks.userId, ctx.user.id)));
      return { success: true as const, cleared: victims.length };
    }),

  duplicate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const rows = await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, input.id), eq(tasks.userId, ctx.user.id), isNull(tasks.deletedAt)))
        .limit(1);
      const src = rows[0];
      if (!src) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
      }
      const now = new Date();
      const copy = {
        id: randomUUID(),
        userId: ctx.user.id,
        title: `${src.title} (copy)`.slice(0, 500),
        description: src.description,
        priority: src.priority,
        dueDate: src.dueDate,
        isCompleted: false,
        completedAt: null,
        recurrence: src.recurrence,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      await db.insert(tasks).values(copy);
      return copy;
    }),

  clearRecurrence: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await db
        .update(tasks)
        .set({ recurrence: null, updatedAt: new Date() })
        .where(and(eq(tasks.id, input.id), eq(tasks.userId, ctx.user.id)));
      return { success: true as const };
    }),

  setRecurrence: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        recurrence: z.enum(['daily', 'weekly', 'biweekly', 'monthly', 'yearly']),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await db
        .update(tasks)
        .set({ recurrence: input.recurrence, updatedAt: new Date() })
        .where(and(eq(tasks.id, input.id), eq(tasks.userId, ctx.user.id)));
      return { success: true as const };
    }),

  snooze: protectedProcedure
    .input(
      z.object({
        ids: z.array(z.string()).min(1).max(50),
        shiftDays: z.number().int().min(-30).max(30),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Fetch current due dates, add shift, write back
      const rows = await db
        .select()
        .from(tasks)
        .where(and(inArray(tasks.id, input.ids), eq(tasks.userId, ctx.user.id), isNull(tasks.deletedAt)));
      let updated = 0;
      for (const t of rows) {
        if (!t.dueDate) continue;
        const d = new Date(t.dueDate);
        if (Number.isNaN(d.getTime())) continue;
        d.setDate(d.getDate() + input.shiftDays);
        await db
          .update(tasks)
          .set({ dueDate: d.toISOString(), updatedAt: new Date() })
          .where(eq(tasks.id, t.id));
        updated += 1;
      }
      return { success: true as const, updated };
    }),

  fromTemplate: protectedProcedure
    .input(
      z.object({
        templateId: z.string(),
        title: z.string().min(1).max(500),
        priority: z.enum(['low', 'medium', 'high']).default('medium'),
        dueDate: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { templates } = await import('../schema/templates');
      const tplRows = await db
        .select()
        .from(templates)
        .where(and(eq(templates.id, input.templateId), eq(templates.userId, ctx.user.id)))
        .limit(1);
      const tpl = tplRows[0];
      if (!tpl) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Template not found' });
      }
      if (tpl.kind !== 'task') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Template is not a task template' });
      }
      const now = new Date();
      const newTask = {
        id: randomUUID(),
        userId: ctx.user.id,
        title: input.title.trim(),
        description: tpl.body,
        priority: input.priority,
        dueDate: input.dueDate ?? null,
        isCompleted: false,
        completedAt: null,
        recurrence: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      await db.insert(tasks).values(newTask);
      return newTask;
    }),

  bulkCreate: protectedProcedure
    .input(
      z.object({
        tasks: z
          .array(
            z.object({
              title: z.string().min(1).max(500),
              description: z.string().max(4000).optional(),
              priority: z.enum(['low', 'medium', 'high']).default('medium'),
              dueDate: z.string().optional(),
            })
          )
          .min(1)
          .max(50),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const now = new Date();
      const rows = input.tasks.map((t) => ({
        id: randomUUID(),
        userId: ctx.user.id,
        title: t.title.trim(),
        description: t.description?.trim() ?? null,
        priority: t.priority,
        dueDate: t.dueDate ?? null,
        isCompleted: false,
        completedAt: null,
        recurrence: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }));
      await db.insert(tasks).values(rows);
      return { success: true as const, created: rows.length, ids: rows.map((r) => r.id) };
    }),

  upcomingDue: protectedProcedure
    .input(z.object({ days: z.number().int().min(1).max(30).default(7) }).optional())
    .query(async ({ input, ctx }) => {
      const days = input?.days ?? 7;
      const rows = await db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.userId, ctx.user.id),
            isNull(tasks.deletedAt),
            eq(tasks.isCompleted, false)
          )
        );
      const now = Date.now();
      const cutoff = now + days * 24 * 60 * 60 * 1000;
      return rows
        .filter((t) => {
          if (!t.dueDate) return false;
          const d = new Date(t.dueDate).getTime();
          return !Number.isNaN(d) && d >= now && d <= cutoff;
        })
        .sort((a, b) => {
          const ad = a.dueDate ? new Date(a.dueDate).getTime() : 0;
          const bd = b.dueDate ? new Date(b.dueDate).getTime() : 0;
          return ad - bd;
        })
        .slice(0, 50);
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

  listOverdue: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(50) }).optional())
    .query(async ({ input, ctx }) => {
      const rows = await db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.userId, ctx.user.id),
            isNull(tasks.deletedAt),
            eq(tasks.isCompleted, false)
          )
        );
      const now = Date.now();
      return rows
        .filter((t) => {
          if (!t.dueDate) return false;
          const d = new Date(t.dueDate).getTime();
          return !Number.isNaN(d) && d < now;
        })
        .sort((a, b) => {
          const ad = a.dueDate ? new Date(a.dueDate).getTime() : 0;
          const bd = b.dueDate ? new Date(b.dueDate).getTime() : 0;
          return ad - bd;
        })
        .slice(0, input?.limit ?? 50);
    }),

  byDateRange: protectedProcedure
    .input(
      z.object({
        start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
    )
    .query(async ({ input, ctx }) => {
      const rows = await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.userId, ctx.user.id), isNull(tasks.deletedAt)));
      const startMs = new Date(input.start + 'T00:00:00Z').getTime();
      const endMs = new Date(input.end + 'T23:59:59Z').getTime();
      return rows.filter((t) => {
        if (!t.dueDate) return false;
        const d = new Date(t.dueDate).getTime();
        return !Number.isNaN(d) && d >= startMs && d <= endMs;
      });
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
