import { mysqlTable, varchar, text, timestamp, int, mysqlEnum, index } from 'drizzle-orm/mysql-core';

export const attachments = mysqlTable('attachments', {
  id: varchar('id', { length: 36 }).primaryKey(),
  itemId: varchar('item_id', { length: 36 }),
  journalId: varchar('journal_id', { length: 36 }),
  type: mysqlEnum('type', ['audio', 'image']).notNull(),
  filename: varchar('filename', { length: 255 }).notNull(),
  fileUrl: varchar('file_url', { length: 500 }).notNull(),
  fileSize: int('file_size'),
  duration: int('duration'),
  transcription: text('transcription'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  itemIdx: index('item_idx').on(table.itemId),
  journalIdx: index('journal_idx').on(table.journalId),
}));