/**
 * One-off copy from SQLite (local.db) to Postgres.
 *
 * Usage:
 *   DATABASE_URL=postgres://user:pass@host:5432/db \
 *     pnpm tsx scripts/sqlite-to-postgres.ts
 *
 * Requires `pg` package (install before running):
 *   pnpm add pg && pnpm add -D @types/pg
 *
 * This is a safe, re-runnable copy. It TRUNCATEs each target table before
 * copying so partial runs never leave duplicates.
 *
 * NOTE: this script does not run automatically. It's invoked manually during
 * a migration window — see docs/MIGRATION-POSTGRES.md.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import Database from 'better-sqlite3';

// The order below is FK-safe. Parents first, then junction tables, then
// children that reference the rest.
const TABLES_IN_ORDER = [
  'users',
  'vaults',
  'tags',
  'categories',
  'items',
  'tasks',
  'journal',
  'habits',
  'goals',
  'goal_milestones',
  'milestone_tasks',
  'subtasks',
  'item_tags',
  'item_categories',
  'item_shares',
  'item_comments',
  'item_versions',
  'attachments',
  'public_links',
  'api_keys',
  'webhook_subscriptions',
  'devices',
  'push_tokens',
  'notification_prefs',
  'vault_members',
  'vault_activity',
  'audit_log',
  'saved_searches',
  'templates',
  'feedback',
  'reviews',
  'onboarding',
  'habit_logs',
  'flashcards',
  'user_notifications',
  'task_time_entries',
];

async function main() {
  const pgUrl = process.env.DATABASE_URL;
  if (!pgUrl || !pgUrl.startsWith('postgres')) {
    console.error('[migrate] DATABASE_URL must point at a Postgres server.');
    process.exit(1);
  }

  // Deferred import so this script only needs `pg` when you actually run it.
  let pg: any;
  try {
    pg = await import('pg' as unknown as string);
  } catch {
    console.error('[migrate] `pg` package is not installed. Run: pnpm add pg');
    process.exit(1);
  }

  const sqlite = new Database('./local.db', { readonly: true });
  const pool = new pg.Pool({ connectionString: pgUrl });
  const pg_ = await pool.connect();

  console.log('[migrate] starting');

  try {
    for (const table of TABLES_IN_ORDER) {
      const exists = sqlite
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`)
        .get(table);
      if (!exists) {
        console.log(`[migrate] ⏭  skipping ${table} (not in sqlite)`);
        continue;
      }
      const rows = sqlite.prepare(`SELECT * FROM ${table}`).all() as any[];
      if (rows.length === 0) {
        console.log(`[migrate] ${table}: 0 rows`);
        continue;
      }
      console.log(`[migrate] ${table}: ${rows.length} rows`);
      await pg_.query(`TRUNCATE TABLE "${table}" CASCADE`);
      const columns = Object.keys(rows[0]);
      // Parameterize everything. For 10k-row scale this is fine; tune batch
      // size upward for much larger tables.
      const batchSize = 500;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const valueRows: string[] = [];
        const params: any[] = [];
        let pIdx = 1;
        for (const row of batch) {
          const placeholders = columns.map(() => `$${pIdx++}`).join(', ');
          valueRows.push(`(${placeholders})`);
          for (const col of columns) params.push(row[col]);
        }
        const sql = `INSERT INTO "${table}" (${columns
          .map((c) => `"${c}"`)
          .join(', ')}) VALUES ${valueRows.join(', ')}`;
        await pg_.query(sql, params);
      }
    }
    console.log('[migrate] ✓ done');
  } finally {
    pg_.release();
    await pool.end();
    sqlite.close();
  }
}

main().catch((err) => {
  console.error('[migrate] failed:', err);
  process.exit(1);
});
