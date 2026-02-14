import { mysqlTable, varchar, text, timestamp, boolean, mysqlEnum, index } from 'drizzle-orm/mysql-core';

export const items = mysqlTable('items', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).notNull(),
  type: mysqlEnum('type', ['note', 'quote', 'link', 'audio']).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  content: text('content'),
  url: varchar('url', { length: 500 }),
  location: mysqlEnum('location', ['inbox', 'library', 'archive']).default('inbox'),
  isFavorite: boolean('is_favorite').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  userIdx: index('user_idx').on(table.userId),
  typeIdx: index('type_idx').on(table.type),
  locationIdx: index('location_idx').on(table.location),
}));