import { mysqlTable, varchar, timestamp, index } from 'drizzle-orm/mysql-core';

export const tags = mysqlTable('tags', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  color: varchar('color', { length: 7 }),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  userIdx: index('user_idx').on(table.userId),
}));

export const itemTags = mysqlTable('item_tags', {
  id: varchar('id', { length: 36 }).primaryKey(),
  itemId: varchar('item_id', { length: 36 }).notNull(),
  tagId: varchar('tag_id', { length: 36 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  itemIdx: index('item_idx').on(table.itemId),
  tagIdx: index('tag_idx').on(table.tagId),
}));