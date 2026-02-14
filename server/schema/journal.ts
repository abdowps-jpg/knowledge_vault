import { mysqlTable, varchar, text, timestamp, boolean, date, index } from 'drizzle-orm/mysql-core';

export const journal = mysqlTable('journal', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).notNull(),
  entryDate: date('entry_date').notNull(),
  title: varchar('title', { length: 255 }),
  content: text('content').notNull(),
  mood: varchar('mood', { length: 50 }),
  location: varchar('location', { length: 255 }),
  weather: varchar('weather', { length: 100 }),
  isLocked: boolean('is_locked').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  userIdx: index('user_idx').on(table.userId),
  dateIdx: index('entry_date_idx').on(table.entryDate),
}));