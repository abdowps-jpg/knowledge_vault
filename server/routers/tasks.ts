import { randomUUID } from 'crypto';
import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { tasks } from '../schema/tasks';
import { publicProcedure, router } from '../trpc';

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
  list: publicProcedure
    .input(
      z.object({
        isCompleted: z.boolean().optional(),
        sortOrder: z.enum(['asc', 'desc']).default('asc'),
        limit: z.number().min(1).max(100).default(25),
        cursor: z.number().int().min(0).optional(),
      })
    )
    .query(async ({ input }) => {
      try {
        const cursor = input.cursor ?? 0;
        const conditions = [];

        if (typeof input.isCompleted === 'boolean') {
          conditions.push(eq(tasks.isCompleted, input.isCompleted));
        }

        const result = await db
          .select()
          .from(tasks)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(input.sortOrder === 'asc' ? asc(tasks.dueDate) : desc(tasks.dueDate))
          .limit(input.limit + 1)
          .offset(cursor);

        const safeResult = result || [];
        const hasMore = safeResult.length > input.limit;
        const pageItems = hasMore ? safeResult.slice(0, input.limit) : safeResult;

        return {
          items: pageItems,
          nextCursor: hasMore ? cursor + input.limit : undefined,
        };
      } catch (error) {
        console.error('Error fetching tasks:', error);
        return { items: [], nextCursor: undefined };
      }
    }),

  // Create task
  create: publicProcedure
    .input(
      z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        dueDate: z.string().optional(),
        priority: z.enum(['low', 'medium', 'high']).default('medium'),
        recurrence: recurrenceSchema.optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const newTask = {
          id: randomUUID(),
          userId: 'test-user',
          title: input.title,
          description: input.description || null,
          dueDate: input.dueDate || null,
          priority: input.priority,
          isCompleted: false,
          completedAt: null,
          recurrence: input.recurrence || null,
        };

        await db.insert(tasks).values(newTask);
        return newTask;
      } catch (error) {
        console.error('Error creating task:', error);
        return null;
      }
    }),

  // Update task
  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        dueDate: z.string().optional(),
        priority: z.enum(['low', 'medium', 'high']).optional(),
        isCompleted: z.boolean().optional(),
        recurrence: recurrenceSchema.nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const { id, isCompleted, ...data } = input;
        const updateData: Record<string, unknown> = {
          ...data,
          updatedAt: new Date(),
        };

        if (typeof isCompleted === 'boolean') {
          updateData.isCompleted = isCompleted;
          updateData.completedAt = isCompleted ? new Date() : null;
        }

        await db.update(tasks).set(updateData).where(eq(tasks.id, id));
        return { success: true };
      } catch (error) {
        console.error('Error updating task:', error);
        return { success: false };
      }
    }),

  // Delete task
  delete: publicProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        await db.delete(tasks).where(eq(tasks.id, input.id));
        return { success: true };
      } catch (error) {
        console.error('Error deleting task:', error);
        return { success: false };
      }
    }),

  // Toggle completion status
  toggle: publicProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const existing = await db.select().from(tasks).where(eq(tasks.id, input.id)).limit(1);

        if (!existing || existing.length === 0) {
          return { success: false, isCompleted: false };
        }

        const nextIsCompleted = !existing[0].isCompleted;

        await db
          .update(tasks)
          .set({
            isCompleted: nextIsCompleted,
            completedAt: nextIsCompleted ? new Date() : null,
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, input.id));

        return { success: true, isCompleted: nextIsCompleted };
      } catch (error) {
        console.error('Error toggling task completion:', error);
        return { success: false, isCompleted: false };
      }
    }),

  // Complete a recurring task and create next occurrence
  completeRecurring: publicProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const existing = await db.select().from(tasks).where(eq(tasks.id, input.id)).limit(1);

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
            .where(eq(tasks.id, input.id));

          const createdTask = {
            id: randomUUID(),
            userId: current.userId,
            title: current.title,
            description: current.description,
            dueDate: formatDateOnly(nextDueDate),
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
});
