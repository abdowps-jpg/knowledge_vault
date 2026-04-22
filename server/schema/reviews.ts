import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const reviews = sqliteTable(
  'reviews',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    kind: text('kind', { enum: ['daily', 'weekly', 'monthly'] }).notNull(),
    periodKey: text('period_key').notNull(), // YYYY-MM-DD or YYYY-Wnn or YYYY-MM
    wins: text('wins'),
    improvements: text('improvements'),
    nextFocus: text('next_focus'),
    aiSummary: text('ai_summary'),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => ({
    userIdx: index('reviews_user_idx').on(table.userId),
    kindIdx: index('reviews_kind_idx').on(table.kind),
    periodIdx: index('reviews_period_idx').on(table.periodKey),
  })
);
