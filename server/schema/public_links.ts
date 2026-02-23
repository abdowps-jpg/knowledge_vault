import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const publicLinks = sqliteTable(
  'public_links',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull().unique(),
    itemId: text('item_id').notNull(),
    ownerUserId: text('owner_user_id').notNull(),
    passwordHash: text('password_hash'),
    expiresAt: integer('expires_at', { mode: 'timestamp' }),
    isRevoked: integer('is_revoked', { mode: 'boolean' }).default(false),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => ({
    tokenIdx: index('public_links_token_idx').on(table.token),
    itemIdx: index('public_links_item_idx').on(table.itemId),
    ownerIdx: index('public_links_owner_idx').on(table.ownerUserId),
  })
);
