import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const taskTimeEntries = sqliteTable(
  "task_time_entries",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    taskId: text("task_id").notNull(),
    startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
    endedAt: integer("ended_at", { mode: "timestamp" }),
    durationSeconds: integer("duration_seconds"),
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  },
  (table) => ({
    userIdx: index("task_time_entries_user_idx").on(table.userId),
    taskIdx: index("task_time_entries_task_idx").on(table.taskId),
    startedIdx: index("task_time_entries_started_idx").on(table.startedAt),
  })
);
