import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const vaults = sqliteTable(
  'vaults',
  {
    id: text('id').primaryKey(),
    ownerUserId: text('owner_user_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    isPersonal: integer('is_personal', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => ({
    ownerIdx: index('vaults_owner_idx').on(table.ownerUserId),
  })
);

export const vaultMembers = sqliteTable(
  'vault_members',
  {
    id: text('id').primaryKey(),
    vaultId: text('vault_id').notNull(),
    userId: text('user_id').notNull(),
    role: text('role', { enum: ['owner', 'editor', 'viewer'] }).notNull().default('viewer'),
    invitedByUserId: text('invited_by_user_id'),
    joinedAt: integer('joined_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => ({
    vaultIdx: index('vault_members_vault_idx').on(table.vaultId),
    userIdx: index('vault_members_user_idx').on(table.userId),
    uniqueMembership: uniqueIndex('vault_members_unique').on(table.vaultId, table.userId),
  })
);

export const vaultActivity = sqliteTable(
  'vault_activity',
  {
    id: text('id').primaryKey(),
    vaultId: text('vault_id').notNull(),
    actorUserId: text('actor_user_id').notNull(),
    action: text('action').notNull(), // item.created, comment.added, share.granted, ...
    resourceKind: text('resource_kind'),
    resourceId: text('resource_id'),
    meta: text('meta'),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => ({
    vaultIdx: index('vault_activity_vault_idx').on(table.vaultId),
    createdIdx: index('vault_activity_created_idx').on(table.createdAt),
  })
);
