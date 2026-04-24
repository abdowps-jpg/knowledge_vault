import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../../server/schema";

/**
 * Fresh in-memory SQLite instance with every migration applied. Each
 * integration test that imports from here gets a completely clean DB.
 */
export async function createTestDb() {
  const client = createClient({ url: ":memory:" });
  await applyMigrations(client);
  return drizzle(client, { schema });
}

async function applyMigrations(client: Client): Promise<void> {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      username TEXT,
      is_active INTEGER DEFAULT 1,
      is_admin INTEGER NOT NULL DEFAULT 0,
      email_verified INTEGER DEFAULT 0,
      email_verified_at INTEGER,
      pending_email TEXT,
      email_verification_code TEXT,
      email_verification_expires_at INTEGER,
      last_synced_at INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      vault_id TEXT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT,
      url TEXT,
      location TEXT DEFAULT 'inbox',
      is_favorite INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      deleted_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      vault_id TEXT,
      title TEXT NOT NULL,
      description TEXT,
      due_date TEXT,
      blocked_by_task_id TEXT,
      location_lat TEXT,
      location_lng TEXT,
      location_radius_meters INTEGER,
      is_urgent INTEGER DEFAULT 0,
      is_important INTEGER DEFAULT 0,
      priority TEXT DEFAULT 'medium',
      is_completed INTEGER DEFAULT 0,
      completed_at INTEGER,
      recurrence TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      deleted_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS item_tags (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS vaults (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      is_personal INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS vault_members (
      id TEXT PRIMARY KEY,
      vault_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      invited_by_user_id TEXT,
      joined_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS vault_members_unique
      ON vault_members(vault_id, user_id);

    CREATE TABLE IF NOT EXISTS vault_activity (
      id TEXT PRIMARY KEY,
      vault_id TEXT NOT NULL,
      actor_user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      resource_kind TEXT,
      resource_id TEXT,
      meta TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
  `);
}
