import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const userNotifications = sqliteTable(
  'user_notifications',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    meta: text('meta'),
    isRead: integer('is_read', { mode: 'boolean' }).default(false),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => ({
    userIdx: index('user_notifications_user_idx').on(table.userId),
    readIdx: index('user_notifications_read_idx').on(table.isRead),
    createdAtIdx: index('user_notifications_created_idx').on(table.createdAt),
  })
);
