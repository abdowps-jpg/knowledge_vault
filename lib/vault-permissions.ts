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
 * Use these from routers whenever an item / task / comment / share is
 * scoped to a vault.
 */

import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';

import { db } from '../server/db';
import { vaultMembers } from '../server/schema/vaults';

type MemberRow = typeof vaultMembers.$inferSelect;

async function getMembership(userId: string, vaultId: string): Promise<MemberRow | null> {
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

/**
 * Any vault member (owner | editor | viewer) can read.
 * Throws FORBIDDEN if the user is not a member.
 */
export async function canRead(userId: string, vaultId: string): Promise<true> {
  const member = await getMembership(userId, vaultId);
  if (!member) deny('read', ['owner', 'editor', 'viewer']);
  return true;
}

/**
 * Owners and editors can write. Viewers cannot.
 * Throws FORBIDDEN otherwise.
 */
export async function canWrite(userId: string, vaultId: string): Promise<true> {
  const member = await getMembership(userId, vaultId);
  if (!member || (member.role !== 'owner' && member.role !== 'editor')) {
    deny('write', ['owner', 'editor']);
  }
  return true;
}

/**
 * Only the owner can delete.
 * Throws FORBIDDEN otherwise.
 */
export async function canDelete(userId: string, vaultId: string): Promise<true> {
  const member = await getMembership(userId, vaultId);
  if (!member || member.role !== 'owner') {
    deny('delete', ['owner']);
  }
  return true;
}
