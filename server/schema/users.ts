import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull().unique(),
    password: text('password').notNull(),
    username: text('username'),
    isActive: integer('is_active', { mode: 'boolean' }).default(true),
    emailVerified: integer('email_verified', { mode: 'boolean' }).default(false),
    emailVerifiedAt: integer('email_verified_at', { mode: 'timestamp' }),
    pendingEmail: text('pending_email'),
    emailVerificationCode: text('email_verification_code'),
    emailVerificationExpiresAt: integer('email_verification_expires_at', { mode: 'timestamp' }),
    lastSyncedAt: integer('last_synced_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => ({
    emailIdx: index('user_email_idx').on(table.email),
    activeIdx: index('user_active_idx').on(table.isActive),
    verifiedIdx: index('user_email_verified_idx').on(table.emailVerified),
  })
);
