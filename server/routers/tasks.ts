import { randomUUID } from 'crypto';
import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { tasks } from '../schema/tasks';
import { publicProcedure, router } from '../trpc';

export const tasksRouter = router({
  // Get tasks with optional completion filter, sorted by due date
  list: publicProcedure
    .input(
      z.object({
        isCompleted: z.boolean().optional(),
        sortOrder: z.enum(['asc', 'desc']).default('asc'),
        limit: z.number().default(50),
      })
    )
    .query(async ({ input }) => {
      try {
        const conditions = [];

        if (typeof input.isCompleted === 'boolean') {
          conditions.push(eq(tasks.isCompleted, input.isCompleted));
        }

        const result = await db
          .select()
          .from(tasks)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(input.sortOrder === 'asc' ? asc(tasks.dueDate) : desc(tasks.dueDate))
          .limit(input.limit);

        return result || [];
      } catch (error) {
        console.error('Error fetching tasks:', error);
        return [];
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
          recurrence: null,
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
});
