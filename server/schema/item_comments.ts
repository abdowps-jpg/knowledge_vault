import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const itemComments = sqliteTable(
  'item_comments',
  {
    id: text('id').primaryKey(),
    itemId: text('item_id').notNull(),
    userId: text('user_id').notNull(),
    parentCommentId: text('parent_comment_id'),
    content: text('content').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => ({
    itemIdx: index('item_comments_item_idx').on(table.itemId),
    userIdx: index('item_comments_user_idx').on(table.userId),
    parentIdx: index('item_comments_parent_idx').on(table.parentCommentId),
  })
);
