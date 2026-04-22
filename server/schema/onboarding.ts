import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const onboarding = sqliteTable('onboarding', {
  userId: text('user_id').primaryKey(),
  completedSteps: text('completed_steps').notNull().default(''),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});
