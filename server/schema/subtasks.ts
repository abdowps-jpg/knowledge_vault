import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const subtasks = sqliteTable(
  "subtasks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    taskId: text("task_id").notNull(),
    title: text("title").notNull(),
    isCompleted: integer("is_completed", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  },
  (table) => ({
    userIdx: index("subtasks_user_idx").on(table.userId),
    taskIdx: index("subtasks_task_idx").on(table.taskId),
  })
);
