import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    dueDate: text('due_date'),
    blockedByTaskId: text('blocked_by_task_id'),
    locationLat: text('location_lat'),
    locationLng: text('location_lng'),
    locationRadiusMeters: integer('location_radius_meters'),
    isUrgent: integer('is_urgent', { mode: 'boolean' }).default(false),
    isImportant: integer('is_important', { mode: 'boolean' }).default(false),
    priority: text('priority', { enum: ['low', 'medium', 'high'] }).default('medium'),
    isCompleted: integer('is_completed', { mode: 'boolean' }).default(false),
    completedAt: integer('completed_at', { mode: 'timestamp' }),
    recurrence: text('recurrence'),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    deletedAt: integer('deleted_at', { mode: 'timestamp' }),
  },
  (table) => ({
    userIdx: index('tasks_user_idx').on(table.userId),
    dueDateIdx: index('tasks_due_date_idx').on(table.dueDate),
    blockedByIdx: index('tasks_blocked_by_idx').on(table.blockedByTaskId),
    urgentIdx: index('tasks_urgent_idx').on(table.isUrgent),
    importantIdx: index('tasks_important_idx').on(table.isImportant),
    priorityIdx: index('tasks_priority_idx').on(table.priority),
  })
);
