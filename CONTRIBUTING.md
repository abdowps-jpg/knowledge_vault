# Contributing

Thanks for wanting to contribute. This repo is a mix of mobile app, backend
server, and browser extension, all in TypeScript. Here is the short version.

## Quick local setup

```bash
git clone https://github.com/abdowps-jpg/knowledge_vault.git
cd knowledge_vault
pnpm install
pnpm db:init
pnpm dev
```

That starts the API on :3000 and the Expo web client on :8081.

For a device, use `pnpm dev:mobile` and open Expo Go on the same LAN.

## Running tests

```bash
pnpm test            # vitest (currently 43 tests)
pnpm check           # tsc --noEmit
pnpm lint            # expo lint (ESLint config)
pnpm verify          # check + lint + test
```

Every PR must pass `pnpm verify`. CI will block the merge otherwise.

## Project layout

```
server/               Express + tRPC server (SQLite via better-sqlite3)
  _core/              boot, CORS, rate limits, CSP, realtime, validation
  lib/                helpers (audit, push-sender, link-metadata, etc)
  routers/            tRPC routers — one file per domain
  schema/             Drizzle schemas — one file per table
  setup-db.ts         idempotent CREATE TABLE + ALTER TABLE migrations

app/                  Expo Router 6 screens
  (app)/              authenticated app (tabs + detail screens)
  (auth)/             login, register, verify-email, forgot-password
  public/             public-share rendering

lib/                  Client-side helpers (storage, tRPC client, contexts,
                      notification hooks, realtime)
hooks/                React hooks used across screens
components/           Reusable UI components
extension/            Chrome / Firefox Manifest V3 clipper
tests/                Vitest unit tests (no DB dependency)
scripts/              Ops scripts (backup, smoke, sqlite-to-postgres, qr)
docs/                 Extra documentation (migration plans, etc)
```

## Coding conventions

- TypeScript everywhere, strict mode on.
- Use `useColors()` for theme tokens — never hard-code hex.
- Use `isNull(table.deletedAt)` on every list/get for data that supports
  soft delete. The filter is already woven into existing routers, follow
  the pattern for new ones.
- Per-user quotas on any endpoint that calls an external API (LLM,
  Whisper, link metadata). Use the helpers that already exist in each
  router — don't roll new quota logic.
- Strict zod schemas on every tRPC input. Empty-array defaults for
  query results so UIs don't break.
- Fail fast: env validation at boot, 403s with `required` scope hints,
  404/401/410/403 specific error codes for public endpoints.
- Commits follow `type(scope): short summary` with a body that lists
  what changed and why.

## Adding a new AI feature

1. Add a procedure in `server/routers/ai.ts` next to the existing ones.
2. Call `enforceLlmQuota(ctx.user.id)` + `logAiCall(ctx.user.id, 'name')`
   at the top.
3. Use `invokeLLM` with a strict `outputSchema` (JSON schema) — never
   parse free-form text.
4. Harden output: trim to max length, reject items that cite ids not in
   the catalog you sent, fall back to empty array on parse failure.
5. Wire a button in the UI only where it belongs (item detail, today,
   reviews, etc). Do not bloat settings.

## Adding a new table

1. Create `server/schema/<name>.ts` with `sqliteTable(...)`.
2. Export from `server/schema/index.ts`.
3. Add the idempotent `CREATE TABLE IF NOT EXISTS` block to
   `server/setup-db.ts`. If the column is new on an existing table, use
   `ALTER TABLE ... ADD COLUMN` wrapped in `try/catch` (SQLite errors on
   duplicate columns).
4. Update `server/routers/auth.ts` `deleteAccount` to cascade-delete the
   new table.
5. Mirror the change in `server/schema-pg/<name>.ts` when the Postgres
   migration lands — see `docs/MIGRATION-POSTGRES.md`.

## Adding a new UI screen

1. Add `app/(app)/<name>.tsx`. Import `ScreenContainer` and `useColors`.
2. Link it from `app/(app)/(tabs)/settings.tsx` under the right Section
   with `router.push('/<name>' as any)`.
3. Use existing tRPC hooks via `trpc.<router>.<procedure>.useQuery()` —
   never reinvent a client.

## Docker

```bash
docker compose up --build      # dev with hot reload
docker build -t kv-api .       # production image
```

## Before opening a PR

- [ ] `pnpm verify` passes
- [ ] Commit message explains the "why" and lists changes
- [ ] No unrelated refactors bundled in
- [ ] No accidental `console.log` leftovers
- [ ] No hard-coded secrets, URLs, or user data

## Questions

Ping the maintainer on the repo or open a Discussion — we'd rather
clarify scope before you spend hours.
