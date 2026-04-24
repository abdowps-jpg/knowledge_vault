/**
 * Integration tests for vault permission plumbing: role gating, activity
 * logging, and the orphan-on-delete behavior. Each test gets a fresh
 * in-memory SQLite via `createTestDb()` and passes it to the helpers under
 * test as `dbOverride`, so nothing touches the real dev database.
 *
 * Design note for case (5): deleting a vault does **not** cascade-delete
 * its items or tasks. Instead, `orphanVaultResources()` sets `vault_id`
 * to NULL on every item/task that pointed at the vault. The vault row
 * itself, its members, and its activity log are then removed by the
 * `vaults.delete` router. Rationale: a vault is a grouping, not a
 * container of ownership — losing a vault should never destroy user
 * content. Rows silently revert to the creator's personal scope.
 */

import { randomUUID } from 'crypto';
import { TRPCError } from '@trpc/server';
import { and, eq, isNull } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  canRead,
  canWrite,
  logVaultActivity,
  orphanVaultResources,
} from '../lib/vault-permissions';
import { items } from '../server/schema/items';
import { tasks } from '../server/schema/tasks';
import { vaultActivity, vaultMembers, vaults } from '../server/schema/vaults';
import { createTestDb } from './helpers/in-memory-db';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

const OWNER_ID = 'user-owner';
const EDITOR_ID = 'user-editor';
const VIEWER_ID = 'user-viewer';
const OUTSIDER_ID = 'user-outsider';

async function seedVaultWithMembers(db: TestDb, vaultId: string) {
  const now = new Date();
  await db.insert(vaults)
    .values({
      id: vaultId,
      ownerUserId: OWNER_ID,
      name: 'Research',
      description: null,
      isPersonal: false,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  await db.insert(vaultMembers)
    .values([
      { id: randomUUID(), vaultId, userId: OWNER_ID, role: 'owner', invitedByUserId: null, joinedAt: now },
      { id: randomUUID(), vaultId, userId: EDITOR_ID, role: 'editor', invitedByUserId: OWNER_ID, joinedAt: now },
      { id: randomUUID(), vaultId, userId: VIEWER_ID, role: 'viewer', invitedByUserId: OWNER_ID, joinedAt: now },
    ])
    .run();
}

/**
 * Mimics the `items.create` router path: permission check → insert →
 * activity log. Used by tests (1), (2), (3) so the guard ordering mirrors
 * production exactly.
 */
async function createItemInVault(
  db: TestDb,
  actorUserId: string,
  vaultId: string,
  payload: { title: string; content?: string }
) {
  await canWrite(actorUserId, vaultId, db);
  const id = randomUUID();
  const now = new Date();
  await db.insert(items)
    .values({
      id,
      userId: actorUserId,
      vaultId,
      type: 'note',
      title: payload.title,
      content: payload.content ?? null,
      location: 'inbox',
      isFavorite: false,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  await logVaultActivity(vaultId, actorUserId, 'item.created', { kind: 'item', id }, undefined, db);
  return id;
}

describe('vault plumbing (in-memory DB)', () => {
  let db: TestDb;
  const vaultId = 'vault-research';

  beforeEach(async () => {
    db = await createTestDb();
    await seedVaultWithMembers(db, vaultId);
  });

  it('owner creates an item in a vault and lists it back', async () => {
    const itemId = await createItemInVault(db, OWNER_ID, vaultId, {
      title: 'Owner note',
      content: 'first entry',
    });

    await canRead(OWNER_ID, vaultId, db);
    const listed = await db
      .select()
      .from(items)
      .where(and(eq(items.vaultId, vaultId), isNull(items.deletedAt)))
      .all();

    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(itemId);
    expect(listed[0].title).toBe('Owner note');
    expect(listed[0].vaultId).toBe(vaultId);
  });

  it('editor creates an item in a vault successfully', async () => {
    const itemId = await createItemInVault(db, EDITOR_ID, vaultId, { title: 'Editor note' });
    const row = (await db.select().from(items).where(eq(items.id, itemId)).all())[0];
    expect(row).toBeDefined();
    expect(row.userId).toBe(EDITOR_ID);
    expect(row.vaultId).toBe(vaultId);
  });

  it('viewer attempting to create an item in a vault is FORBIDDEN', async () => {
    await expect(
      createItemInVault(db, VIEWER_ID, vaultId, { title: 'Forbidden note' })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const rowsAfter = await db.select().from(items).where(eq(items.vaultId, vaultId)).all();
    expect(rowsAfter).toHaveLength(0);
  });

  it('non-member attempting to list items in a vault is FORBIDDEN', async () => {
    await expect(canRead(OUTSIDER_ID, vaultId, db)).rejects.toBeInstanceOf(TRPCError);
    await expect(canRead(OUTSIDER_ID, vaultId, db)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('deleting a vault orphans its items by setting vault_id to NULL (documented)', async () => {
    // Two items live inside the vault, one outside.
    const insideA = randomUUID();
    const insideB = randomUUID();
    const outside = randomUUID();
    const now = new Date();
    await db.insert(items)
      .values([
        { id: insideA, userId: OWNER_ID, vaultId, type: 'note', title: 'A', createdAt: now, updatedAt: now },
        { id: insideB, userId: EDITOR_ID, vaultId, type: 'note', title: 'B', createdAt: now, updatedAt: now },
        { id: outside, userId: OWNER_ID, vaultId: null, type: 'note', title: 'C', createdAt: now, updatedAt: now },
      ])
      .run();
    await db.insert(tasks)
      .values([
        { id: randomUUID(), userId: OWNER_ID, vaultId, title: 'T1', createdAt: now, updatedAt: now },
      ])
      .run();

    const result = await orphanVaultResources(vaultId, db);
    expect(result).toEqual({ itemsOrphaned: 2, tasksOrphaned: 1 });

    // The router would delete the vault row itself after orphaning. Do that
    // here so the assertions cover the full cleanup path.
    await db.delete(vaultMembers).where(eq(vaultMembers.vaultId, vaultId)).run();
    await db.delete(vaults).where(eq(vaults.id, vaultId)).run();

    // Items and tasks survive; their vault_id is now NULL.
    const allItems = await db.select().from(items).all();
    expect(allItems).toHaveLength(3);
    for (const row of allItems) {
      expect(row.vaultId).toBeNull();
    }
    const allTasks = await db.select().from(tasks).all();
    expect(allTasks).toHaveLength(1);
    expect(allTasks[0].vaultId).toBeNull();

    // The vault itself is gone.
    const vaultRows = await db.select().from(vaults).where(eq(vaults.id, vaultId)).all();
    expect(vaultRows).toHaveLength(0);
  });

  it('vault_activity gets a new entry for each create and update', async () => {
    const itemId = await createItemInVault(db, OWNER_ID, vaultId, { title: 'To be edited' });

    // Simulate an update: bump row then log.
    await db.update(items).set({ title: 'Edited', updatedAt: new Date() }).where(eq(items.id, itemId)).run();
    await logVaultActivity(vaultId, OWNER_ID, 'item.updated', { kind: 'item', id: itemId }, undefined, db);

    const activity = await db
      .select()
      .from(vaultActivity)
      .where(eq(vaultActivity.vaultId, vaultId))
      .all();

    expect(activity).toHaveLength(2);
    const actions = activity.map((r) => r.action).sort();
    expect(actions).toEqual(['item.created', 'item.updated']);
    for (const row of activity) {
      expect(row.resourceKind).toBe('item');
      expect(row.resourceId).toBe(itemId);
      expect(row.actorUserId).toBe(OWNER_ID);
    }
  });
});
