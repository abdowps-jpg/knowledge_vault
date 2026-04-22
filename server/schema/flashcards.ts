import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const flashcards = sqliteTable(
  'flashcards',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    itemId: text('item_id'),
    question: text('question').notNull(),
    answer: text('answer').notNull(),
    ease: real('ease').notNull().default(2.5),
    interval: integer('interval').notNull().default(1), // days
    repetitions: integer('repetitions').notNull().default(0),
    nextReviewDate: text('next_review_date').notNull(), // YYYY-MM-DD
    lastReviewedAt: integer('last_reviewed_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => ({
    userIdx: index('flashcards_user_idx').on(table.userId),
    nextReviewIdx: index('flashcards_next_review_idx').on(table.nextReviewDate),
    itemIdx: index('flashcards_item_idx').on(table.itemId),
  })
);
