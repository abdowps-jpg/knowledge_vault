import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const journal = sqliteTable(
  'journal',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    entryDate: text('entry_date').notNull(),
    title: text('title'),
    content: text('content').notNull(),
    mood: text('mood'),
    location: text('location'),
    weather: text('weather'),
    isLocked: integer('is_locked', { mode: 'boolean' }).default(false),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    deletedAt: integer('deleted_at', { mode: 'timestamp' }),
  },
  (table) => ({
    userIdx: index('journal_user_idx').on(table.userId),
    dateIdx: index('journal_entry_date_idx').on(table.entryDate),
  })
);
