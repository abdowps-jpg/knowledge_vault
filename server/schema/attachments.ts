import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const attachments = sqliteTable(
  'attachments',
  {
    id: text('id').primaryKey(),
    itemId: text('item_id'),
    journalId: text('journal_id'),
    type: text('type', { enum: ['audio', 'image'] }).notNull(),
    filename: text('filename').notNull(),
    fileUrl: text('file_url').notNull(),
    fileSize: integer('file_size'),
    duration: integer('duration'),
    transcription: text('transcription'),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => ({
    itemIdx: index('attachment_item_idx').on(table.itemId),
    journalIdx: index('attachment_journal_idx').on(table.journalId),
    createdAtIdx: index('attachment_created_at_idx').on(table.createdAt),
  })
);
