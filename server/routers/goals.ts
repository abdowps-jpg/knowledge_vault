import { randomUUID } from "crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../db";
import { goalMilestones, goals, milestoneTasks } from "../schema/goals";
import { tasks } from "../schema/tasks";
import { protectedProcedure, router } from "../trpc";

let ensureTablePromise: Promise<void> | null = null;

async function ensureGoalsTables() {
  if (!ensureTablePromise) {
    ensureTablePromise = Promise.resolve(
      db.run(sql`
        CREATE TABLE IF NOT EXISTS goals (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          is_completed INTEGER DEFAULT 0,
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `)
    )
      .then(() =>
        db.run(sql`
          CREATE TABLE IF NOT EXISTS goal_milestones (
            id TEXT PRIMARY KEY,
            goal_id TEXT NOT NULL,
            title TEXT NOT NULL,
            is_completed INTEGER DEFAULT 0,
            sort_order INTEGER DEFAULT 0,
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            updated_at INTEGER DEFAULT (strftime('%s', 'now'))
          )
        `)
      )
      .then(() =>
        db.run(sql`
          CREATE TABLE IF NOT EXISTS milestone_tasks (
            id TEXT PRIMARY KEY,
            milestone_id TEXT NOT NULL,
            task_id TEXT NOT NULL,
            created_at INTEGER DEFAULT (strftime('%s', 'now'))
          )
        `)
      )
      .then(() => undefined);
  }
  return ensureTablePromise;
}

export const goalsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    await ensureGoalsTables();
    const goalRows = await db.select().from(goals).where(eq(goals.userId, ctx.user.id));
    if (goalRows.length === 0) return [];

    const goalIds = goalRows.map((g) => g.id);
    const milestoneRows = await db
      .select()
      .from(goalMilestones)
      .where(inArray(goalMilestones.goalId, goalIds));

    const milestoneIds = milestoneRows.map((m) => m.id);
    const linkRows =
      milestoneIds.length > 0
        ? await db.select().from(milestoneTasks).where(inArray(milestoneTasks.milestoneId, milestoneIds))
        : [];

    const taskIds = linkRows.map((l) => l.taskId);
    const taskRows =
      taskIds.length > 0
        ? await db
            .select({ id: tasks.id, isCompleted: tasks.isCompleted })
            .from(tasks)
            .where(and(eq(tasks.userId, ctx.user.id), inArray(tasks.id, taskIds)))
        : [];
    const taskDone = new Map(taskRows.map((t) => [t.id, Boolean(t.isCompleted)]));

    const linksByMilestone = new Map<string, string[]>();
    for (const link of linkRows) {
      const list = linksByMilestone.get(link.milestoneId) ?? [];
      list.push(link.taskId);
      linksByMilestone.set(link.milestoneId, list);
    }

    const milestonesByGoal = new Map<string, Array<any>>();
    for (const milestone of milestoneRows) {
      const linkedTasks = linksByMilestone.get(milestone.id) ?? [];
      const linkedCompleted =
        linkedTasks.length > 0 ? linkedTasks.every((taskId) => taskDone.get(taskId) === true) : false;
      const effectiveCompleted = Boolean(milestone.isCompleted) || linkedCompleted;
      const list = milestonesByGoal.get(milestone.goalId) ?? [];
      list.push({
        ...milestone,
        linkedTaskIds: linkedTasks,
        effectiveCompleted,
      });
      milestonesByGoal.set(milestone.goalId, list);
    }

    return goalRows.map((goal) => {
      const goalMilestoneList = (milestonesByGoal.get(goal.id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
      const total = goalMilestoneList.length;
      const done = goalMilestoneList.filter((m) => m.effectiveCompleted).length;
      return {
        ...goal,
        milestones: goalMilestoneList,
        progress: total === 0 ? 0 : Math.round((done / total) * 100),
      };
    });
  }),

  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
        milestones: z.array(z.string().min(1).max(200)).max(30).default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ensureGoalsTables();
      const now = new Date();
      const goal = {
        id: randomUUID(),
        userId: ctx.user.id,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        isCompleted: false,
        createdAt: now,
        updatedAt: now,
      };
      await db.insert(goals).values(goal);

      for (let index = 0; index < input.milestones.length; index += 1) {
        await db.insert(goalMilestones).values({
          id: randomUUID(),
          goalId: goal.id,
          title: input.milestones[index].trim(),
          isCompleted: false,
          sortOrder: index,
          createdAt: now,
          updatedAt: now,
        });
      }

      return { success: true as const, goalId: goal.id };
    }),

  toggleMilestone: protectedProcedure
    .input(z.object({ milestoneId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ensureGoalsTables();
      const rows = await db
        .select({
          milestoneId: goalMilestones.id,
          isCompleted: goalMilestones.isCompleted,
          goalUserId: goals.userId,
        })
        .from(goalMilestones)
        .innerJoin(goals, eq(goals.id, goalMilestones.goalId))
        .where(eq(goalMilestones.id, input.milestoneId))
        .limit(1);
      if (rows.length === 0 || rows[0].goalUserId !== ctx.user.id) {
        return { success: false as const };
      }

      await db
        .update(goalMilestones)
        .set({
          isCompleted: !rows[0].isCompleted,
          updatedAt: new Date(),
        })
        .where(eq(goalMilestones.id, input.milestoneId));
      return { success: true as const };
    }),

  linkTask: protectedProcedure
    .input(z.object({ milestoneId: z.string(), taskId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ensureGoalsTables();
      const milestoneRows = await db
        .select({
          milestoneId: goalMilestones.id,
          goalUserId: goals.userId,
        })
        .from(goalMilestones)
        .innerJoin(goals, eq(goals.id, goalMilestones.goalId))
        .where(eq(goalMilestones.id, input.milestoneId))
        .limit(1);
      const taskRows = await db
        .select({ id: tasks.id, userId: tasks.userId })
        .from(tasks)
        .where(eq(tasks.id, input.taskId))
        .limit(1);

      if (milestoneRows.length === 0 || milestoneRows[0].goalUserId !== ctx.user.id) {
        return { success: false as const };
      }
      if (taskRows.length === 0 || taskRows[0].userId !== ctx.user.id) {
        return { success: false as const };
      }

      const existing = await db
        .select({ id: milestoneTasks.id })
        .from(milestoneTasks)
        .where(and(eq(milestoneTasks.milestoneId, input.milestoneId), eq(milestoneTasks.taskId, input.taskId)))
        .limit(1);
      if (existing.length > 0) {
        return { success: true as const };
      }

      await db.insert(milestoneTasks).values({
        id: randomUUID(),
        milestoneId: input.milestoneId,
        taskId: input.taskId,
        createdAt: new Date(),
      });
      return { success: true as const };
    }),
});
