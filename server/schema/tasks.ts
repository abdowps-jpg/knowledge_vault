import { mysqlTable, varchar, text, timestamp, boolean, mysqlEnum, date, index } from 'drizzle-orm/mysql-core';

export const tasks = mysqlTable('tasks', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  dueDate: date('due_date'),
  priority: mysqlEnum('priority', ['low', 'medium', 'high']).default('medium'),
  isCompleted: boolean('is_completed').default(false),
  completedAt: timestamp('completed_at'),
  recurrence: varchar('recurrence', { length: 50 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  userIdx: index('user_idx').on(table.userId),
  dueDateIdx: index('due_date_idx').on(table.dueDate),
  priorityIdx: index('priority_idx').on(table.priority),
}));