import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const goals = sqliteTable(
  "goals",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    isCompleted: integer("is_completed", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  },
  (table) => ({
    userIdx: index("goals_user_idx").on(table.userId),
  })
);

export const goalMilestones = sqliteTable(
  "goal_milestones",
  {
    id: text("id").primaryKey(),
    goalId: text("goal_id").notNull(),
    title: text("title").notNull(),
    isCompleted: integer("is_completed", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  },
  (table) => ({
    goalIdx: index("goal_milestones_goal_idx").on(table.goalId),
  })
);

export const milestoneTasks = sqliteTable(
  "milestone_tasks",
  {
    id: text("id").primaryKey(),
    milestoneId: text("milestone_id").notNull(),
    taskId: text("task_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  },
  (table) => ({
    milestoneIdx: index("milestone_tasks_milestone_idx").on(table.milestoneId),
    taskIdx: index("milestone_tasks_task_idx").on(table.taskId),
  })
);
