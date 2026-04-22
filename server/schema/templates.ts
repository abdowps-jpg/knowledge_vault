import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const templates = sqliteTable(
  'templates',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    kind: text('kind', { enum: ['item', 'task', 'journal'] }).notNull(),
    body: text('body').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => ({
    userIdx: index('templates_user_idx').on(table.userId),
    kindIdx: index('templates_kind_idx').on(table.kind),
  })
);
