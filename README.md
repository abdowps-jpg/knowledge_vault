# Knowledge Vault

> Capture anything. Find everything. Act on what matters.

A personal knowledge operating system: capture notes, links, quotes, and
audio; organize with tags, categories, and shared vaults; retrieve with
full-text and AI-powered semantic search; act via integrated tasks, habits,
goals, and journal. Mobile-native, offline-first, AI-enhanced.

## Features

**Capture**
- Notes, links, quotes, audio with transcription (Whisper)
- Browser extension (Chrome / Firefox) for one-click save
- Email → task via inbound webhook
- Shareable clipping from selection on the web

**Organize**
- Tags and categories with item counts
- Shared Vaults (owner / editor / viewer workspaces)
- Bulk operations: move, tag, trash, favorite, restore
- Templates with `{{placeholder}}` substitution

**Retrieve**
- Instant keyword search across items, tasks, journal
- AI semantic search (LLM rerank)
- `ai.askVault` — answer questions citing your own items
- Saved searches, recent queries, trending terms

**Act**
- Tasks with priorities, due dates, recurrence, subtasks, time tracking
- Habits with streaks and 90-day heatmap
- Goals with milestones linked to tasks
- Daily journal with mood, weather, location, word clouds
- Spaced-repetition flashcards (SM-2 algorithm)
- AI-generated: daily digest, weekly review, focus suggestions,
  proofread, title suggestions, translate, tags, categorize, expand,
  extract tasks, recall questions

**Share**
- Public links (password-protected, expiring, view count tracked)
- Per-item shares with view/edit permissions
- @mentions in comments (email or username) with realtime push + SSE
- PWA-installable landing page

**Platform**
- REST + tRPC APIs with read/write/admin scopes, HMAC-signed webhooks,
  Zapier integration endpoints
- Mobile app (iOS / Android via Expo)
- Browser extension (Manifest V3)
- Chrome / Edge / Firefox / Safari web-extension CORS
- PWA manifest + service worker

**Enterprise-ready**
- Admin role + dashboard (user management, audit log, feedback)
- SSO scaffold (Google / GitHub / Apple / Microsoft / Okta / custom OIDC
  via env vars)
- Audit log with 90-day retention
- Encrypted push tokens
- Per-type notification preferences + quiet hours + snooze

## Stack

- **Frontend:** Expo Router 6, React Native 0.81, NativeWind, TanStack
  Query, tRPC v11 client
- **Backend:** Express 4 + tRPC v11, Drizzle ORM, SQLite (WAL mode) with
  a Postgres migration path
- **Auth:** bcrypt + JWT, email verification, password reset, audit log
- **AI:** Gemini 2.5 Flash + Whisper via Forge API, strict JSON schema
  output, per-user LLM quota

## Quick start

Prerequisites: Node 20, pnpm 9.

```bash
git clone https://github.com/abdowps-jpg/knowledge_vault.git
cd knowledge_vault
pnpm install

# Generate a test user (email: test@test.com, password: test1234)
pnpm db:init
pnpm tsx server/create-test-user.ts

# Start the API + Expo web
pnpm dev
```

Open http://localhost:8081 for the app, http://localhost:3000 for the API
landing page.

### Environment variables

Copy `.env.example` → `.env` and fill in at minimum:

- `JWT_SECRET` — a long random string (32+ chars)
- `BUILT_IN_FORGE_API_URL` + `BUILT_IN_FORGE_API_KEY` — for AI features
- `RESEND_API_KEY` + `EMAIL_FROM` — for email verification / password reset
- `ALLOWED_ORIGINS` — comma-separated allowed origins for CORS (production)

The server validates these at boot and hard-fails in production if any are
missing or still the placeholder value.

## Development scripts

```bash
pnpm dev          # API + Metro concurrently
pnpm dev:mobile   # API + Expo LAN (for device testing)
pnpm check        # TypeScript
pnpm lint         # ESLint
pnpm test         # Vitest (43 tests across 7 files)
pnpm verify       # check + lint + test
pnpm smoke        # hit every public endpoint (server must be running)
```

## Docker

```bash
# Development (hot reload via tsx watch)
docker compose up --build

# Production image
docker build -t knowledge-vault-api .
docker run -p 3000:3000 --env-file .env knowledge-vault-api
```

## Browser extension

See [`extension/README.md`](extension/README.md). Load unpacked from
`chrome://extensions` with Developer mode on.

## Error monitoring (Sentry)

Errors are forwarded to Sentry via the lightweight envelope reporter — no
SDK dependency on the server. Both DSNs are optional; when unset, errors
log to stdout only.

**Server** — set in `.env`:

```bash
SENTRY_DSN=https://<publicKey>@<host>/<projectId>
```

This catches everything: REST handlers (via the global Express error
middleware), tRPC `INTERNAL_SERVER_ERROR` codes (via `onError`), Node
`unhandledRejection`, and `uncaughtException`. Each event is tagged with
`source` (express / trpc / unhandledRejection / uncaughtException),
`route`, `type`, `method`, and `user_id` — all searchable in the Sentry UI.
The `user_id` tag is only set when the request was authenticated, so the
unauthenticated `/debug/throw` test will not exercise it; trigger an
authenticated tRPC error to see the user-id flow.

**Web client** — set as Expo public env vars (these survive into the
browser bundle):

```bash
EXPO_PUBLIC_SENTRY_DSN_WEB=https://<publicKey>@<host>/<projectId>
# Optional fallback: EXPO_PUBLIC_SENTRY_DSN
# Optional release tag: EXPO_PUBLIC_APP_VERSION
```

The web init lives in `lib/sentry-web.ts` and runs from `app/_layout.tsx`
behind a `Platform.OS === 'web'` guard. `@sentry/browser` registers
`window.onerror` and `unhandledrejection` listeners automatically. **Native
iOS/Android errors are not captured by this** — `@sentry/react-native`
would be the full-coverage replacement.

**Verify the pipeline.** With `NODE_ENV !== 'production'`, the server
exposes a deliberate-throw endpoint:

```bash
curl http://localhost:3000/debug/throw?tag=verify
# → 500, error logged to stdout, envelope sent to Sentry
# Look for `debug.throw: verify` in the Sentry issues feed
```

If `SENTRY_DSN` is unset, the line is logged but no envelope is sent. The
`/debug/throw` route is not registered in production.

## Documentation

- [ROADMAP.md](ROADMAP.md) — product strategy and phase-by-phase plan
- [docs/MIGRATION-POSTGRES.md](docs/MIGRATION-POSTGRES.md) — how to move
  from SQLite to Postgres without downtime
- [docs/security-audit.md](docs/security-audit.md) — UGC XSS audit (2026-04-23)
- [CHANGELOG.md](CHANGELOG.md) — version history
- [SECURITY.md](SECURITY.md) — how to report vulnerabilities
- [CONTRIBUTING.md](CONTRIBUTING.md) — contribution guide

## License

Private / proprietary. Contact the repository owner for licensing questions.
