import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const habitLogs = sqliteTable(
  'habit_logs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    habitId: text('habit_id').notNull(),
    date: text('date').notNull(), // YYYY-MM-DD
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => ({
    userIdx: index('habit_logs_user_idx').on(table.userId),
    habitDateUnique: uniqueIndex('habit_logs_habit_date_unique').on(table.habitId, table.date),
  })
);
