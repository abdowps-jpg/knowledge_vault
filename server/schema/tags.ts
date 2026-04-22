import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const tags = sqliteTable(
  'tags',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    color: text('color'),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => ({
    userIdx: index('tags_user_idx').on(table.userId),
  })
);

export const itemTags = sqliteTable(
  'item_tags',
  {
    id: text('id').primaryKey(),
    itemId: text('item_id').notNull(),
    tagId: text('tag_id').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => ({
    itemIdx: index('item_tags_item_idx').on(table.itemId),
    tagIdx: index('item_tags_tag_idx').on(table.tagId),
  })
);
