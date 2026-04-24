# Changelog

## [Unreleased]

### Security audit + Sentry wiring (2026-04-23)

**UGC XSS audit (`docs/security-audit.md`)**
- Enumerated every HTML/DOM sink: `/p/:token`, `/app`, landing page,
  `/privacy`, `/terms`, email-inbound, `/app.js` client-side `innerHTML`
  assignments — all verified protected via `escapeHtml` / `safeExternalUrl`
  / `esc()` / `safeUrl()`.
- **Found: stored XSS in `components/rich-text-editor.tsx`** web build.
  Markdown link regex interpolated href raw into `<a href="$2">`, allowing
  `[x](javascript:alert\`xss\`)` to execute on click. Reachable via shared
  items from collaborators with edit permission.
- Fix: extracted security-critical helpers into `lib/markdown-safe-html.ts`
  with a `safeMarkdownLinkHref` allow-list (`http:` / `https:` / `mailto:`
  only). Links also gain `rel="noopener noreferrer"`.
- Regression tests in `tests/markdown-safe-html.test.ts` (13 cases) cover
  `javascript:`, `data:`, `vbscript:`, `file:`, case-insensitivity,
  whitespace-padding, and the legitimate schemes.

**Sentry wiring**
- Server `reportError` now emits `tags` (indexed/searchable in Sentry UI)
  for `source`, `route`, `type`, `user_id`, `method` — previously buried
  in `extra`. Also sets `environment` and `user.id` at event top level.
- Authenticated tRPC `INTERNAL_SERVER_ERROR` events carry `user_id` tag
  via `ctx.user.id`; unauthenticated Express routes don't.
- New `/debug/throw?tag=...` endpoint (non-production only) for verifying
  the envelope reaches Sentry.
- Web client: `@sentry/browser` installed and initialized from
  `lib/sentry-web.ts`, loaded lazily from `app/_layout.tsx` behind a
  `Platform.OS === "web"` guard. `init()` registers `window.onerror` and
  `unhandledrejection` listeners automatically. **Native iOS/Android not
  covered** — would require `@sentry/react-native`.
- `README.md` gains an "Error monitoring (Sentry)" section documenting
  `SENTRY_DSN`, `EXPO_PUBLIC_SENTRY_DSN_WEB`, and the `/debug/throw`
  verification flow.

### Vaults plumbing + admin telemetry (2026-04-23)

**Shared Vaults (Phase 3 — 95%)**
- `vaultId` foreign key added to `items` and `tasks` with idempotent
  ALTER TABLE migrations and indexes
- `lib/vault-permissions.ts` with `canRead` / `canWrite` / `canDelete`,
  plus extracted `logVaultActivity` and `orphanVaultResources` helpers
  (all accept an optional `dbOverride` for testing)
- Items/tasks create-update-delete mutations gated by vault role when a
  `vaultId` is set (editor writes, owner deletes); `items.update`
  branches on vault scope before falling back to `ensureItemAccess`
- `vaults.delete` orphans items and tasks back to personal scope
  (`vault_id` → NULL) before tearing down members, activity, and the
  vault row itself — deleting a vault never destroys user content
- `item.created` / `item.updated` / `task.created` / `task.updated`
  events now appear in `vault_activity` for every vault-scoped mutation
- New `components/VaultSelector.tsx` chip picker wired into add-task
  modal, quick-add modal, and item detail screen
- New `app/(app)/vaults/[id].tsx` with Items / Tasks / Activity tabs;
  viewer role hides create FAB and locks vault binding
- Tests: `tests/vaults-plumbing.test.ts` covers owner/editor create,
  viewer FORBIDDEN, non-member read FORBIDDEN, vault-delete orphaning,
  and activity rows on create+update — 6/6 green alongside the
  existing 55 (61 total)

**Admin telemetry (Phase 5 — 70%)**
- New procedures: `admin.userUsage({ userId })` — 30-day AI call buckets
  from `audit_log` (`action LIKE 'ai.%'`) plus item/task counts and
  attachment byte totals; `admin.systemTrends()` — `signups30d` and
  `dau30d` (distinct users per day); `admin.failedWebhooks({ limit })`
  — subscriptions where `failureCount > 0` OR `lastStatus >= 400`
- Admin screen gets three new sections: user drill-down picker with
  usage cards and an AI-calls LineChart, system trends panel with two
  LineCharts (signups + DAU), and a failed webhooks list. All empty
  states render friendly text instead of a zeroed chart.
- New `admin.markFeedbackAddressed({ id, note })` procedure; "Mark as
  addressed" button on each feedback card, with an addressed badge and
  optional note visible after resolution
- `feedback.addressedAt` + `feedback.addressedNote` columns added via
  idempotent ALTER TABLE

### Phase 3 / 4 / 5 completion batch (2026-04-22)

**Shared Vaults (Phase 3 — 85%)**
- `vaults`, `vault_members`, `vault_activity` tables
- `vaultsRouter` with invite / remove / leave / feed / roles (owner /
  editor / viewer)
- Full UI at `app/(app)/vaults.tsx`

**PWA + Browser Extension (Phase 4 — 80%)**
- Chrome / Firefox Manifest V3 extension at `extension/` with popup,
  context menu (save page, link, selection-as-quote, selection-as-task),
  Alt+Shift+S shortcut, options page with connection test
- PWA manifest, service worker, installable landing page
- Zapier integration router + `/api/me` auth-test endpoint

**Enterprise foundation (Phase 5 — 60%)**
- `users.isAdmin` with idempotent ALTER TABLE migration
- `adminRouter` with system stats, user management, feedback review,
  audit event tail
- `ssoRouter` with OIDC discovery and env-driven provider detection
  (Google, GitHub, Apple, Microsoft, Okta, custom OIDC)
- Full admin UI at `app/(app)/admin.tsx`

### AI (Phase 2 — complete)

- `ai.suggestTags`, `summarize`, `search`, `expand`, `quickActions`,
  `relatedItems`, `dailyDigest`, `weeklyReview`, `categorize`,
  `translate`, `journalPrompt`, `extractTasks`, `proofread`,
  `suggestTitle`, `focusSuggestions`, `askVault`, `clusterRecent`,
  `linkToTasks`, `habitsReflection`, `summarizeTranscript`, `draftReply`,
  `compareItems`, `tagSummary`, `generateQuestions`, `autoTagSuggestions`
- Per-user LLM quota (60/hour) exposed via `ai.quota`
- All AI calls logged to audit log for cost attribution
- Audio transcription via Whisper, cached in `attachments.transcription`

### Realtime

- Server-Sent Events on `/events` (JWT-auth via Bearer or `?token=`)
- Notification broadcasts on mention / comment / share
- Client hook `useRealtime` with auto-reconnect and exponential backoff
- `_layout.tsx` invalidates notification queries so UI updates in <1s

### Security + Observability

- Auth rate limiter (10 attempts / 15min / IP) on login, register,
  password reset
- CSP + cross-origin headers + HSTS in production
- Sentry envelope reporter (no SDK dep; works if `SENTRY_DSN` is set)
- `/healthz`, `/_metrics`, `/api/schema` (v1.1), `/robots.txt`,
  `/sitemap.xml`
- Audit log with 90-day prune, viewable via Settings → Activity Log
- Webhook HMAC-SHA256 signatures over `timestamp.body`
- API key scope enforcement (read / write / admin)
- `/api/v1` URL alias for forward-compat versioning
- Attachment MIME + size validation (10MB image, 25MB audio)
- Env var validation at boot — hard-fails in production if JWT_SECRET,
  ALLOWED_ORIGINS, EMAIL_FROM, RESEND_API_KEY, or EMAIL_WEBHOOK_SECRET
  are missing

### Infrastructure

- GitHub Actions CI: pnpm check / lint / test on every push + PR, with
  a soft-failing audit job
- Dockerfile (production) + Dockerfile.dev (tsx watch) + docker-compose.yml
- `scripts/backup.sh` for SQLite snapshots with 30-day retention
- `scripts/sqlite-to-postgres.ts` for migration cutover
- `scripts/smoke.ts` for release verification
- `docs/MIGRATION-POSTGRES.md` — dual-driver → dual-write → cutover

### Tests

- 43 tests across 7 files; everything passes in < 5s
  - `validate-env` — env validation hard-fails in prod scenarios
  - `link-metadata` — SSRF guard blocks private IPs and non-http schemes
  - `webhook-signature` — HMAC is deterministic, time-bound, body-bound
  - `auth-password` — bcrypt round-trip, salt uniqueness, case-sensitivity
  - `auth-jwt` — generate → verify, tampered tokens return null
  - `sm2` — flashcard scheduling invariants
  - `items-domain` — duplicate-URL and domain-extraction normalization

### Legal

- `/privacy` and `/terms` — dark-mode HTML pages served by the API host,
  always matching the running version
- Settings links point at the configured `EXPO_PUBLIC_API_URL`

## History

See git log for the full commit-by-commit history. The project moved from
Phase 0 Stabilization through Phase 5 Enterprise foundation in one
continuous development sprint, with every commit passing `pnpm verify`.
