import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const categories = sqliteTable(
  'categories',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    icon: text('icon'),
    createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
  },
  (table) => ({
    userIdx: index('category_user_idx').on(table.userId),
    createdAtIdx: index('category_created_at_idx').on(table.createdAt),
  })
);

export const itemCategories = sqliteTable(
  'item_categories',
  {
    id: text('id').primaryKey(),
    itemId: text('item_id').notNull(),
    categoryId: text('category_id').notNull(),
    createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
  },
  (table) => ({
    itemIdx: index('item_category_item_idx').on(table.itemId),
    categoryIdx: index('item_category_category_idx').on(table.categoryId),
  })
);
