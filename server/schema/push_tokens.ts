import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const pushTokens = sqliteTable(
  'push_tokens',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    token: text('token').notNull(),
    platform: text('platform', { enum: ['ios', 'android', 'web'] }).notNull(),
    deviceName: text('device_name'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => ({
    userIdx: index('push_tokens_user_idx').on(table.userId),
    tokenUnique: uniqueIndex('push_tokens_token_unique').on(table.token),
  })
);
