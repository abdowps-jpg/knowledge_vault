import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const habits = sqliteTable(
  "habits",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    streak: integer("streak").notNull().default(0),
    doneToday: integer("done_today", { mode: "boolean" }).notNull().default(false),
    lastCompletedDate: text("last_completed_date"),
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  },
  (table) => ({
    userIdx: index("habits_user_idx").on(table.userId),
    updatedIdx: index("habits_updated_idx").on(table.updatedAt),
  })
);
