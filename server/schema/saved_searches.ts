import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const savedSearches = sqliteTable(
  'saved_searches',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    query: text('query').notNull(),
    filterJson: text('filter_json'),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => ({
    userIdx: index('saved_searches_user_idx').on(table.userId),
  })
);
