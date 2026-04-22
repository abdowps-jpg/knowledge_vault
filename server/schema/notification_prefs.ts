import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const notificationPrefs = sqliteTable(
  'notification_prefs',
  {
    userId: text('user_id').primaryKey(),
    mentionEnabled: integer('mention_enabled', { mode: 'boolean' }).notNull().default(true),
    itemCommentEnabled: integer('item_comment_enabled', { mode: 'boolean' }).notNull().default(true),
    itemSharedEnabled: integer('item_shared_enabled', { mode: 'boolean' }).notNull().default(true),
    taskDueEnabled: integer('task_due_enabled', { mode: 'boolean' }).notNull().default(true),
    quietStartMinutes: integer('quiet_start_minutes'),
    quietEndMinutes: integer('quiet_end_minutes'),
    snoozeUntil: integer('snooze_until', { mode: 'timestamp' }),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => ({
    userIdx: index('notification_prefs_user_idx').on(table.userId),
  })
);
