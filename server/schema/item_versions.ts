import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const itemVersions = sqliteTable(
  'item_versions',
  {
    id: text('id').primaryKey(),
    itemId: text('item_id').notNull(),
    userId: text('user_id').notNull(),
    title: text('title').notNull(),
    content: text('content'),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => ({
    itemIdx: index('item_versions_item_idx').on(table.itemId),
    userIdx: index('item_versions_user_idx').on(table.userId),
    createdIdx: index('item_versions_created_idx').on(table.createdAt),
  })
);
