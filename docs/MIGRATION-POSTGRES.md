# PostgreSQL Migration Plan

This document describes how to move the server from SQLite (`local.db`) to
PostgreSQL without downtime, when the hosted tier starts exceeding ~1000
concurrent users or when you need multi-node deployments, read replicas, or
`pgvector` for semantic search.

## Why not today

SQLite (with WAL mode, 100+ QPS on a decent VM) handles most workloads up to a
few thousand daily-active users per instance. The moving-target costs kick in
when:

- You need more than one API node behind a load balancer.
- You want read replicas to offload analytics queries.
- You want `pgvector` for embedding-based semantic search (currently we use
  LLM-rerank as a stand-in).
- Your compliance regime requires point-in-time recovery across regions.

## Prerequisites

1. A PostgreSQL 16+ instance. Recommended hosts: Neon, Supabase, AWS RDS,
   Google Cloud SQL, Hetzner Managed Postgres.
2. `pgvector` extension enabled (`CREATE EXTENSION vector;`) if you plan to
   add embeddings later.
3. Network access from the API host.
4. A maintenance window of ~15 minutes for the final cutover.

## Phase 1 — dual driver (safe, additive)

Install the Postgres driver alongside `better-sqlite3`:

```bash
pnpm add pg
pnpm add -D @types/pg
```

Create a second Drizzle instance in `server/db.pg.ts`:

```ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema-pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const pgDb = drizzle(pool, { schema });
```

Mirror `server/schema/*.ts` into `server/schema-pg/*.ts` using Postgres core
imports (`pgTable`, `text`, `integer`, `timestamp`, `boolean`, `uniqueIndex`).

Generate migrations:

```bash
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

Commit the generated SQL but do not switch traffic yet.

## Phase 2 — data copy

Run `scripts/sqlite-to-postgres.ts` (scaffold in this repo) to stream every
table from SQLite into Postgres. Tables migrate in FK-safe order:

```
users
 ↓ (children share userId)
items · tasks · journal · habits · goals · tags · categories · vaults
 ↓
item_tags · item_categories · vault_members · goal_milestones · subtasks
 ↓
item_shares · item_comments · item_versions · attachments · public_links
 ↓
api_keys · webhook_subscriptions · push_tokens · notification_prefs
 ↓
audit_log · saved_searches · templates · feedback · reviews · onboarding
  · habit_logs · flashcards · vault_activity
```

The script:

- Reads rows in batches of 1000
- Converts SQLite `integer` timestamps back to JS `Date` → Postgres `timestamp`
- Preserves primary keys so foreign keys keep pointing at the same rows
- Is idempotent: re-running truncates the target table first so partial runs
  don't double-insert

## Phase 3 — dual write window

Enable `DUAL_WRITE=1` in the env. The API writes to SQLite and Postgres on
every mutation but reads only from SQLite. Run this for 24-48 hours to build
confidence and catch serialization drift.

## Phase 4 — cutover

Steps:

1. Flip `DATABASE_DRIVER=postgres` in env.
2. Roll the API pod(s) — new processes read + write Postgres only.
3. Monitor `/_metrics` and Sentry for 30 minutes.
4. Keep SQLite file around for a week as a rollback safety net.

## Phase 5 — cleanup

- Remove `better-sqlite3` from deps.
- Delete `server/db.ts`, rename `server/db.pg.ts` → `server/db.ts`.
- Delete `server/schema/*` in favor of `server/schema-pg/*`.
- Run `pnpm audit` to confirm no unused native dependencies.
- Enable pgvector and start writing `embedding vector(1536)` columns on items
  (separate migration).

## Rollback

If Phase 4 goes wrong, set `DATABASE_DRIVER=sqlite` and re-roll. Data written
to Postgres during the dual-write window is preserved and will be replayed
onto SQLite by the migration script in reverse mode (`scripts/postgres-to-sqlite.ts`,
TODO).

## Known gotchas

- **Boolean columns**: SQLite stores as 0/1 `integer`; Postgres uses native
  `boolean`. Drizzle's `integer({ mode: 'boolean' })` handles SQLite only, so
  the mirrored `-pg` schema must use `boolean('...')`.
- **Timestamps**: Already UTC on the SQLite side as seconds-since-epoch; the
  migration script converts via `new Date(value * 1000)` where needed.
- **Large TEXT**: Content and attachment base64 stay as TEXT — Postgres has
  no column length limit, so no schema change needed.
- **Full-text search**: The current `searchFast` procedures use `LOWER LIKE`
  which is portable. If you add GIN indexes and `websearch_to_tsquery` later,
  gate them on `DATABASE_DRIVER === 'postgres'`.
