/**
 * Vault access-control helpers.
 *
 * Each function looks up the caller's membership in `vault_members` and
 * compares the role against the action's required role. If the user has
 * access, the function resolves with `true`. If not, it throws a tRPC
 * `FORBIDDEN` error so callers don't have to remember to check the return.
 *
 * Role hierarchy:
 *   owner  → can read + write + delete
 *   editor → can read + write
 *   viewer → can read only
 *
 * All functions accept an optional `dbOverride` so tests can swap in an
 * in-memory Drizzle database without mocking the whole module. Production
 * callers omit it and get the singleton from `server/db`.
 */

import { randomUUID } from 'crypto';
import { TRPCError } from '@trpc/server';
import { and, eq, inArray } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';

import { db as productionDb } from '../server/db';
import * as schema from '../server/schema';
import { items } from '../server/schema/items';
import { tasks } from '../server/schema/tasks';
import { vaultActivity, vaultMembers } from '../server/schema/vaults';

type Db = LibSQLDatabase<typeof schema>;
type MemberRow = typeof vaultMembers.$inferSelect;

async function getMembership(
  userId: string,
  vaultId: string,
  db: Db
): Promise<MemberRow | null> {
  const rows = await db
    .select()
    .from(vaultMembers)
    .where(and(eq(vaultMembers.vaultId, vaultId), eq(vaultMembers.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

function deny(action: string, requiredRoles: readonly string[]): never {
  throw new TRPCError({
    code: 'FORBIDDEN',
    message: `${action} requires one of: ${requiredRoles.join(', ')}.`,
  });
}

export async function canRead(
  userId: string,
  vaultId: string,
  dbOverride?: Db
): Promise<true> {
  const db = dbOverride ?? productionDb;
  const member = await getMembership(userId, vaultId, db);
  if (!member) deny('read', ['owner', 'editor', 'viewer']);
  return true;
}

export async function canWrite(
  userId: string,
  vaultId: string,
  dbOverride?: Db
): Promise<true> {
  const db = dbOverride ?? productionDb;
  const member = await getMembership(userId, vaultId, db);
  if (!member || (member.role !== 'owner' && member.role !== 'editor')) {
    deny('write', ['owner', 'editor']);
  }
  return true;
}

export async function canDelete(
  userId: string,
  vaultId: string,
  dbOverride?: Db
): Promise<true> {
  const db = dbOverride ?? productionDb;
  const member = await getMembership(userId, vaultId, db);
  if (!member || member.role !== 'owner') {
    deny('delete', ['owner']);
  }
  return true;
}

/**
 * Append a row to `vault_activity`. Swallows insert errors so callers don't
 * have to wrap in try/catch — activity is observational and should never
 * break the mutation that triggered it.
 */
export async function logVaultActivity(
  vaultId: string,
  actorUserId: string,
  action: string,
  resource?: { kind: string; id: string },
  meta?: Record<string, unknown>,
  dbOverride?: Db
): Promise<void> {
  const db = dbOverride ?? productionDb;
  try {
    await db.insert(vaultActivity).values({
      id: randomUUID(),
      vaultId,
      actorUserId,
      action: action.slice(0, 80),
      resourceKind: resource?.kind ?? null,
      resourceId: resource?.id ?? null,
      meta: meta ? JSON.stringify(meta).slice(0, 2000) : null,
      createdAt: new Date(),
    });
  } catch (err) {
    console.error('[vault-permissions] activity log failed:', err);
  }
}

/**
 * Orphan a vault's items and tasks by setting their `vault_id` to NULL.
 * Called by `vaults.delete` before the vault row itself is removed.
 *
 * Design choice: we keep the items/tasks and only detach them, because
 * losing an entire vault should never destroy user content — a deleted
 * vault is a demotion back to the owner's personal scope, not a cascade
 * delete. Users can still find, edit, and re-vault their rows afterward.
 */
export async function orphanVaultResources(
  vaultId: string,
  dbOverride?: Db
): Promise<{ itemsOrphaned: number; tasksOrphaned: number }> {
  const db = dbOverride ?? productionDb;
  const affectedItems = await db
    .select({ id: items.id })
    .from(items)
    .where(eq(items.vaultId, vaultId));
  const affectedTasks = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(eq(tasks.vaultId, vaultId));

  if (affectedItems.length > 0) {
    await db
      .update(items)
      .set({ vaultId: null })
      .where(inArray(items.id, affectedItems.map((r) => r.id)));
  }
  if (affectedTasks.length > 0) {
    await db
      .update(tasks)
      .set({ vaultId: null })
      .where(inArray(tasks.id, affectedTasks.map((r) => r.id)));
  }
  return { itemsOrphaned: affectedItems.length, tasksOrphaned: affectedTasks.length };
}
