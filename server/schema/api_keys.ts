import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const apiKeys = sqliteTable(
  'api_keys',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    keyHash: text('key_hash').notNull(),
    keyPreview: text('key_preview').notNull(),
    isActive: integer('is_active', { mode: 'boolean' }).default(true),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
  },
  (table) => ({
    userIdx: index('api_keys_user_idx').on(table.userId),
    hashIdx: index('api_keys_hash_idx').on(table.keyHash),
    activeIdx: index('api_keys_active_idx').on(table.isActive),
  })
);

export const webhookSubscriptions = sqliteTable(
  'webhook_subscriptions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    url: text('url').notNull(),
    event: text('event').notNull(),
    secret: text('secret'),
    isActive: integer('is_active', { mode: 'boolean' }).default(true),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => ({
    userIdx: index('webhooks_user_idx').on(table.userId),
    eventIdx: index('webhooks_event_idx').on(table.event),
    activeIdx: index('webhooks_active_idx').on(table.isActive),
  })
);
