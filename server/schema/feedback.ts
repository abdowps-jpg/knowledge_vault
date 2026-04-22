import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const feedback = sqliteTable(
  'feedback',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    kind: text('kind', { enum: ['bug', 'idea', 'praise', 'other'] }).notNull(),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    appVersion: text('app_version'),
    platform: text('platform'),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => ({
    userIdx: index('feedback_user_idx').on(table.userId),
    kindIdx: index('feedback_kind_idx').on(table.kind),
    createdAtIdx: index('feedback_created_at_idx').on(table.createdAt),
  })
);
