import { randomUUID } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "../db";
import { goalMilestones, goals, milestoneTasks } from "../schema/goals";
import { tasks } from "../schema/tasks";
import { protectedProcedure, router } from "../trpc";

export const goalsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
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

      try {
        await db.insert(milestoneTasks).values({
          id: randomUUID(),
          milestoneId: input.milestoneId,
          taskId: input.taskId,
          createdAt: new Date(),
        });
      } catch {
        // Concurrent request already inserted the same link — treat as success.
      }
      return { success: true as const };
    }),

  delete: protectedProcedure
    .input(z.object({ goalId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const rows = await db
        .select({ id: goals.id })
        .from(goals)
        .where(and(eq(goals.id, input.goalId), eq(goals.userId, ctx.user.id)))
        .limit(1);
      if (rows.length === 0) return { success: false as const };

      const milestoneRows = await db
        .select({ id: goalMilestones.id })
        .from(goalMilestones)
        .where(eq(goalMilestones.goalId, input.goalId));
      const milestoneIds = milestoneRows.map((m) => m.id);

      if (milestoneIds.length > 0) {
        await db.delete(milestoneTasks).where(inArray(milestoneTasks.milestoneId, milestoneIds));
        await db.delete(goalMilestones).where(eq(goalMilestones.goalId, input.goalId));
      }

      await db.delete(goals).where(eq(goals.id, input.goalId));
      return { success: true as const };
    }),

  addMilestone: protectedProcedure
    .input(z.object({ goalId: z.string(), title: z.string().min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const owned = await db
        .select()
        .from(goals)
        .where(and(eq(goals.id, input.goalId), eq(goals.userId, ctx.user.id)))
        .limit(1);
      if (owned.length === 0) {
        return { success: false as const };
      }
      const existing = await db.select().from(goalMilestones).where(eq(goalMilestones.goalId, input.goalId));
      const now = new Date();
      const id = randomUUID();
      await db.insert(goalMilestones).values({
        id,
        goalId: input.goalId,
        title: input.title.trim(),
        isCompleted: false,
        sortOrder: existing.length,
        createdAt: now,
        updatedAt: now,
      });
      return { success: true as const, id };
    }),

  deleteMilestone: protectedProcedure
    .input(z.object({ milestoneId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership via goal
      const msRows = await db
        .select({ id: goalMilestones.id, goalId: goalMilestones.goalId })
        .from(goalMilestones)
        .where(eq(goalMilestones.id, input.milestoneId))
        .limit(1);
      const ms = msRows[0];
      if (!ms) return { success: true as const };
      const goalRows = await db
        .select()
        .from(goals)
        .where(and(eq(goals.id, ms.goalId), eq(goals.userId, ctx.user.id)))
        .limit(1);
      if (goalRows.length === 0) return { success: false as const };
      await db.delete(milestoneTasks).where(eq(milestoneTasks.milestoneId, input.milestoneId));
      await db.delete(goalMilestones).where(eq(goalMilestones.id, input.milestoneId));
      return { success: true as const };
    }),

  toggleComplete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const rows = await db
        .select()
        .from(goals)
        .where(and(eq(goals.id, input.id), eq(goals.userId, ctx.user.id)))
        .limit(1);
      const current = rows[0];
      if (!current) return { success: false as const };
      await db
        .update(goals)
        .set({ isCompleted: !current.isCompleted, updatedAt: new Date() })
        .where(eq(goals.id, input.id));
      return { success: true as const, isCompleted: !current.isCompleted };
    }),

  progress: protectedProcedure.query(async ({ ctx }) => {
    const goalRows = await db.select().from(goals).where(eq(goals.userId, ctx.user.id));
    if (goalRows.length === 0) {
      return {
        totalGoals: 0,
        byGoal: [] as { id: string; title: string; percent: number; milestones: number; tasksDone: number; tasksTotal: number }[],
      };
    }
    const goalIds = goalRows.map((g) => g.id);
    const milestoneRows = await db.select().from(goalMilestones).where(inArray(goalMilestones.goalId, goalIds));
    const milestoneIds = milestoneRows.map((m) => m.id);
    const taskLinks = milestoneIds.length > 0
      ? await db.select().from(milestoneTasks).where(inArray(milestoneTasks.milestoneId, milestoneIds))
      : [];
    const taskIds = Array.from(new Set(taskLinks.map((l) => l.taskId)));
    const taskRows = taskIds.length > 0
      ? await db.select().from(tasks).where(inArray(tasks.id, taskIds))
      : [];
    const taskById = new Map(taskRows.map((t) => [t.id, t]));

    const milestonesByGoal = new Map<string, typeof milestoneRows>();
    for (const m of milestoneRows) {
      const arr = milestonesByGoal.get(m.goalId) ?? [];
      arr.push(m);
      milestonesByGoal.set(m.goalId, arr);
    }
    const tasksByMilestone = new Map<string, string[]>();
    for (const link of taskLinks) {
      const arr = tasksByMilestone.get(link.milestoneId) ?? [];
      arr.push(link.taskId);
      tasksByMilestone.set(link.milestoneId, arr);
    }

    const byGoal = goalRows.map((g) => {
      const ms = milestonesByGoal.get(g.id) ?? [];
      let tasksDone = 0;
      let tasksTotal = 0;
      for (const m of ms) {
        const ids = tasksByMilestone.get(m.id) ?? [];
        for (const id of ids) {
          const t = taskById.get(id);
          if (!t || t.deletedAt) continue;
          tasksTotal += 1;
          if (t.isCompleted) tasksDone += 1;
        }
      }
      const percent = tasksTotal === 0 ? 0 : Math.round((tasksDone / tasksTotal) * 100);
      return {
        id: g.id,
        title: g.title,
        percent,
        milestones: ms.length,
        tasksDone,
        tasksTotal,
      };
    });

    return {
      totalGoals: goalRows.length,
      byGoal,
    };
  }),
});
