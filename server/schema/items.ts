import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const items = sqliteTable('items', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  type: text('type', { enum: ['note', 'quote', 'link', 'audio'] }).notNull(),
  title: text('title').notNull(),
  content: text('content'),
  url: text('url'),
  location: text('location', { enum: ['inbox', 'library', 'archive'] }).default('inbox'),
  isFavorite: integer('is_favorite', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  deletedAt: integer('deleted_at', { mode: 'timestamp' }),
}, (table) => ({
  userIdx: index('user_idx').on(table.userId),
  typeIdx: index('type_idx').on(table.type),
  locationIdx: index('location_idx').on(table.location),
}));
