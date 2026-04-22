# Knowledge Vault — Product Roadmap

> From current state to production-grade, monetized SaaS product.

---

## 1. Product Vision & Strategy

### Vision
The definitive personal knowledge operating system — a single vault where professionals capture, organize, retrieve, and act on everything they know, powered by AI that surfaces the right knowledge at the right time.

### Target Audience

| Segment | Profile | Pain Point |
|---------|---------|------------|
| **Primary** | Knowledge workers (developers, researchers, consultants, writers) | Information scattered across 5+ apps; can never find what they saved |
| **Secondary** | Students & lifelong learners | Notes decay — no system to review, connect, or apply what they learn |
| **Tertiary** | Small teams (2–10) | Shared knowledge lives in Slack threads and dies there |

### Core Problem
People collect information but can't retrieve or leverage it. The average knowledge worker spends 19% of their time searching for information (McKinsey). Existing tools force users to choose between capture speed (bookmarks, quick notes) and organization depth (Notion, wikis) — Knowledge Vault eliminates that tradeoff.

### Unique Value Proposition
**"Capture anything. Find everything. Act on what matters."**

- **Capture**: Notes, links, quotes, audio — all item types, one inbox
- **Organize**: Tags, categories, AI-suggested taxonomy — zero-friction filing
- **Retrieve**: Semantic search + AI summaries across your entire vault
- **Act**: Tasks, habits, goals, and journal integrated — knowledge drives action
- **Own**: Offline-first, version-controlled, exportable — your data stays yours

### Competitive Positioning

| Feature | Notion | Obsidian | Evernote | Knowledge Vault |
|---------|--------|----------|----------|-----------------|
| Offline-first | Partial | Yes | No | **Yes** |
| Mobile native | Slow | Plugin | Legacy | **Native (Expo)** |
| AI-powered | Paid add-on | Plugin | Basic | **Built-in** |
| Task management | Basic | Plugin | Basic | **Integrated** |
| Habit tracking | No | No | No | **Yes** |
| Goal system | No | No | No | **Yes** |
| Public sharing | Limited | Publish | No | **Yes (password-protected)** |
| API + Webhooks | Yes | No | Limited | **Yes** |
| Data export | CSV | Markdown | ENEX | **Full JSON** |

---

## 2. Feature Breakdown

### Current State (Built)

**Core Data:**
- Items (notes, links, quotes, audio) with CRUD, tagging, categorization
- Version history (capped at 50 per item)
- Attachments (images, audio)
- Full-text search

**Productivity:**
- Tasks with priorities, due dates, subtasks, time tracking, location reminders
- Eisenhower matrix view (urgent/important quadrants)
- Habits with streak tracking
- Goals with milestones linked to tasks
- Daily journal with mood, weather, location

**Organization:**
- Tags and categories (user-created)
- Library view with filters
- Calendar view
- Analytics and stats dashboards
- Weekly/monthly reviews

**Platform:**
- JWT auth with email verification
- Offline-first with sync queue and conflict resolution
- Multi-device support with device tracking
- Public link sharing (password-protected, expiring)
- REST API with API key auth
- Webhook subscriptions (items/tasks CRUD events)
- Email-to-task inbound webhook
- Data export (JSON)

**AI Infrastructure:**
- LLM module ready (Gemini 2.5 Flash via Forge API)
- AI features screen (placeholder — all locked)

### MVP Gaps (Must Ship Before Launch)

| # | Feature | Why Critical | Effort |
|---|---------|-------------|--------|
| 1 | **AI Smart Search** | Core differentiator — semantic search across vault | 2 weeks |
| 2 | **AI Summarization** | Auto-summarize long notes/articles on save | 1 week |
| 3 | **AI Auto-Tagging** | Reduce organization friction to zero | 1 week |
| 4 | **Onboarding Flow** | First-time users drop off without guided setup | 1 week |
| 5 | **Password Reset** | Users locked out = immediate churn | 2 days |
| 6 | **Rate Limiting** | Public API + auth endpoints are unprotected | 2 days |
| 7 | **Input Sanitization Audit** | XSS vectors in content rendering | 3 days |
| 8 | **Error Monitoring** | Sentry DSN configured but not wired | 1 day |
| 9 | **Audio Transcription** | Audio items are opaque without text | 1 week |
| 10 | **Push Notifications** | Habit reminders, task due dates, daily journal prompts | 1 week |

### Post-Launch Advanced Features

**Phase 2 — Intelligence (Months 2–4):**
- AI Related Items ("You saved something similar 3 weeks ago")
- AI Quick Actions (suggested next steps from content)
- Smart Daily Digest (AI-curated review of recent captures)
- Natural language search ("What did I save about React performance last month?")
- Content enrichment (auto-fetch metadata for links, generate thumbnails)

**Phase 3 — Collaboration (Months 4–6):**
- Shared vaults (team workspaces)
- Real-time collaborative editing
- Comments and @mentions on shared items
- Team activity feed
- Role-based access control (owner, editor, viewer)

**Phase 4 — Platform (Months 6–9):**
- Browser extension (clip web content directly)
- Desktop app (Electron or Tauri)
- Zapier/Make integration (pre-built)
- Notion/Obsidian import
- Markdown export
- Plugin/extension API for community features

**Phase 5 — Enterprise (Months 9–12):**
- SSO (SAML/OIDC)
- Admin dashboard
- Audit logs
- Data residency options
- SLA and priority support
- Custom AI model fine-tuning per organization

### UX/UI Principles

1. **Capture in < 3 seconds** — Quick-add modal from any screen, voice note, share sheet
2. **Retrieve in < 5 seconds** — Global search always accessible, AI surfaces results before you finish typing
3. **Zero-friction organization** — AI suggests tags/categories; user confirms with one tap
4. **Progressive disclosure** — Simple by default, powerful on demand (filters, advanced search, API)
5. **Offline confidence** — Clear sync status indicators; user never worries about data loss
6. **Dark mode first** — Knowledge workers work late; respect their eyes

### Key User Flows

```
Capture Flow:
  Open app → Quick-add (FAB) → Choose type (note/link/quote/audio)
  → Enter content → AI suggests tags → Confirm → Saved + synced

Retrieve Flow:
  Open app → Search (tab) → Type query → AI semantic results
  → Tap item → Full view with versions, comments, related items

Daily Review Flow:
  Morning notification → Open app → Journal tab → Write entry
  → Mood/weather auto-detected → Review today's tasks → Check habits

Weekly Review Flow:
  Sunday notification → Reviews screen → AI-generated weekly summary
  → Goals progress → Habit streaks → Plan next week's priorities
```

---

## 3. Technical Architecture

### Current Architecture

```
┌─────────────────────────────────────────────────────┐
│                    MOBILE APP                        │
│  Expo Router 6 + React Native 0.81 + NativeWind     │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ Contexts  │  │  tRPC    │  │  Offline Manager │   │
│  │ (5 domains│  │  Client  │  │  + Sync Queue    │   │
│  │  + hooks) │  │          │  │                  │   │
│  └──────────┘  └────┬─────┘  └────────┬─────────┘   │
│                     │                 │              │
└─────────────────────┼─────────────────┼──────────────┘
                      │ HTTP/tRPC       │ Batch Sync
                      ▼                 ▼
┌─────────────────────────────────────────────────────┐
│                   API SERVER                         │
│  Express 4 + tRPC 11 + Zod Validation               │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │  22 tRPC  │  │  REST    │  │  Webhook         │   │
│  │  Routers  │  │  /api/*  │  │  Delivery         │  │
│  └──────┬───┘  └────┬─────┘  └────────┬─────────┘   │
│         │           │                 │              │
│         ▼           ▼                 ▼              │
│  ┌──────────────────────────────────────────────┐    │
│  │          Drizzle ORM (SQLite + MySQL)        │    │
│  └──────────────────┬───────────────────────────┘    │
│                     │                                │
│  ┌──────────────────▼───────────────────────────┐    │
│  │           SQLite (local.db, WAL mode)        │    │
│  │           23 tables, indexed                 │    │
│  └──────────────────────────────────────────────┘    │
│                                                      │
│  ┌──────────────────────────────────────────────┐    │
│  │     LLM Module (Gemini 2.5 Flash / Forge)    │    │
│  └──────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

### Target Architecture (Production)

```
┌─────────────┐  ┌─────────────┐  ┌──────────────────┐
│  Mobile App  │  │  Web App    │  │  Browser Ext.    │
│  (iOS/Android│  │  (React)    │  │  (Chrome/Firefox)│
└──────┬───────┘  └──────┬──────┘  └────────┬─────────┘
       │                 │                  │
       └────────┬────────┴──────────────────┘
                │ HTTPS / WSS
                ▼
┌───────────────────────────────────────────────────────┐
│                   EDGE / CDN                          │
│  Cloudflare (DDoS, WAF, rate limiting, caching)       │
└───────────────────────┬───────────────────────────────┘
                        │
┌───────────────────────▼───────────────────────────────┐
│                  LOAD BALANCER                         │
│  (health checks, SSL termination)                     │
└───────────────────────┬───────────────────────────────┘
                        │
         ┌──────────────┼──────────────┐
         ▼              ▼              ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│  API Node 1 │ │  API Node 2 │ │  API Node N │
│  Express+   │ │  Express+   │ │  Express+   │
│  tRPC       │ │  tRPC       │ │  tRPC       │
└──────┬──────┘ └──────┬──────┘ └──────┬──────┘
       │               │               │
       └───────┬───────┴───────┬───────┘
               │               │
     ┌─────────▼─────┐ ┌──────▼──────────┐
     │  PostgreSQL   │ │  Redis           │
     │  (Primary +   │ │  (Sessions,      │
     │   Read Replica)│ │   Rate Limits,   │
     │               │ │   Job Queue)     │
     └───────────────┘ └─────────────────┘
               │
     ┌─────────▼─────────┐
     │  Object Storage   │
     │  (S3/R2)          │
     │  Attachments,     │
     │  Audio, Exports   │
     └───────────────────┘
               │
     ┌─────────▼─────────┐
     │  AI Pipeline      │
     │  ┌──────────────┐ │
     │  │ Embedding Gen│ │ (on item create/update)
     │  │ (text-embed) │ │
     │  └──────┬───────┘ │
     │         ▼         │
     │  ┌──────────────┐ │
     │  │ Vector DB    │ │ (pgvector or Pinecone)
     │  │ (Semantic    │ │
     │  │  Search)     │ │
     │  └──────────────┘ │
     │  ┌──────────────┐ │
     │  │ LLM (Gemini/ │ │ (summarize, tag, relate)
     │  │  Claude API) │ │
     │  └──────────────┘ │
     └───────────────────┘

┌───────────────────────────────────────────────────────┐
│                   OBSERVABILITY                        │
│  Sentry (errors) + Grafana (metrics) + Loki (logs)    │
└───────────────────────────────────────────────────────┘
```

### Database Migration Plan

**Current:** SQLite (local.db) — single-file, no concurrent writes, no replication
**Target:** PostgreSQL 16 + pgvector extension

| Phase | Action | Risk |
|-------|--------|------|
| 1 | Add PostgreSQL support to Drizzle config (dual-driver) | Low |
| 2 | Migrate `tags` from `mysqlTable` to `sqliteTable` (fix legacy) | Medium — requires migration script |
| 3 | Generate PostgreSQL schema from Drizzle | Low |
| 4 | Write data migration script (SQLite → PostgreSQL) | Medium |
| 5 | Switch production to PostgreSQL | High — requires downtime window |
| 6 | Add pgvector extension for semantic search | Low |
| 7 | Add read replica for analytics queries | Low |

### API Design

**Current:** tRPC (internal) + REST (external API keys)
**Target:** Keep both — tRPC for app, REST for integrations

REST API versioning strategy:
- `/api/v1/items` — current
- Version in URL path (not header) for simplicity
- Deprecation: 6-month notice, sunset header

---

## 4. Development Roadmap

### Phase 0 — Stabilization (Current → Week 2)

**Goal:** Fix all production blockers in existing code.

| Task | Status | Owner |
|------|--------|-------|
| Fix privilege escalation in tags.delete | Done | — |
| Fix privilege escalation in categories.delete | Done | — |
| Fix habits undo bug (streak/lastCompletedDate) | Done | — |
| Fix goals TOCTOU race condition | Done | — |
| Fix attachments list type filter bug | Done | — |
| Fix soft-delete leak in items.list | Done | — |
| Fix soft-delete leak in public-links.getPublic | Done | — |
| Cap item version history at 50 | Done | — |
| Enforce API key limit (10) and webhook limit (20) | Done | — |
| Comprehensive account deletion (23 tables) | Done | — |
| Theme consistency (useColors across all screens) | Done | — |
| Add public link creation limit | Pending | — |
| Password reset flow | Pending | — |
| Rate limiting on auth endpoints | Pending | — |
| Input sanitization audit | Pending | — |
| Wire up Sentry error monitoring | Pending | — |

### Phase 1 — MVP Launch (Weeks 3–8)

**Goal:** Ship to App Store / Play Store with AI differentiators.

**Sprint 1–2: AI Core**
- Implement AI auto-tagging on item creation
- Implement AI summarization for notes and links
- Implement semantic search (embeddings + vector similarity)
- Audio transcription (Whisper API integration)

**Sprint 3–4: Polish & Onboarding**
- First-run onboarding flow (3 screens: capture, organize, review)
- Push notifications (habit reminders, task due dates, journal prompts)
- Password reset flow (email-based)
- App Store assets (screenshots, description, keywords)
- Privacy policy and terms of service pages

**Sprint 5–6: Infrastructure**
- Migrate to PostgreSQL
- Deploy API to cloud (Railway / Render / VPS)
- Set up CI/CD pipeline (GitHub Actions)
- Configure Sentry, logging, health checks
- Load testing (k6 or Artillery)
- App Store submission (iOS + Android)

### Phase 2 — Intelligence (Months 3–4)

- AI Related Items suggestions
- AI Quick Actions from content
- Smart Daily Digest
- Natural language search
- Link metadata auto-fetch (title, description, thumbnail)
- Weekly review AI summaries

### Phase 3 — Collaboration (Months 5–6)

- Shared vaults (multi-user workspaces)
- Real-time sync (WebSocket upgrade)
- Team activity feed
- Role-based access (owner, editor, viewer)
- @mentions in comments

### Phase 4 — Platform Expansion (Months 7–9)

- Browser extension (Chrome, Firefox)
- Web app (responsive, PWA)
- Notion/Obsidian/Evernote import tools
- Markdown export
- Zapier/Make pre-built integrations
- Public API documentation site

### Phase 5 — Enterprise (Months 10–12)

- SSO (SAML 2.0, OIDC)
- Admin dashboard
- Audit logging
- Custom domains for public links
- Data residency (EU/US)
- SLA tiers

### Team Roles

| Role | Phase 0–1 | Phase 2–3 | Phase 4–5 |
|------|-----------|-----------|-----------|
| Fullstack Dev (you) | 1 | 1 | 1 |
| Mobile Dev | — | 0.5 | 1 |
| AI/ML Engineer | — | 0.5 | 1 |
| Designer | 0.5 | 0.5 | 1 |
| DevOps | — | 0.5 | 1 |
| Product Manager | — | — | 1 |
| Marketing | — | 0.5 | 1 |

---

## 5. Cybersecurity & Data Protection

### Authentication & Authorization

| Layer | Current | Target |
|-------|---------|--------|
| Password hashing | bcrypt (12 rounds) | Keep — industry standard |
| Token auth | JWT (single token) | JWT access (15m) + refresh token (7d) + rotation |
| Session management | Stateless JWT | Add token blacklist (Redis) for logout/revoke |
| Biometric | Expo module installed, not wired | Integrate for app unlock + sensitive actions |
| MFA | None | TOTP (Google Authenticator) for premium users |
| OAuth | Callback page exists | Google, Apple, GitHub SSO |
| Rate limiting | None | Express-rate-limit: 5 login attempts/15min, 100 API calls/min |
| API keys | SHA-256 hash stored | Keep — add scoped permissions (read-only, write, admin) |

### Encryption

| Data State | Current | Target |
|------------|---------|--------|
| In transit | HTTPS (assumed) | TLS 1.3 enforced, HSTS header |
| At rest (DB) | None | PostgreSQL TDE or application-level AES-256 for sensitive fields |
| At rest (files) | None | S3 server-side encryption (SSE-S3) |
| Client-side | Expo SecureStore for tokens | End-to-end encryption option for premium vaults |
| Backups | None | Encrypted daily backups to separate region |

### Compliance

**GDPR (EU users):**
- Data export: Already built (JSON export)
- Right to deletion: Already built (cascading account delete)
- Consent: Add cookie consent banner (web)
- Data Processing Agreement: Draft for enterprise tier
- Privacy policy: Must create before App Store submission

**SOC 2 (Enterprise):**
- Audit logging: Add to Phase 5
- Access controls: Role-based already started
- Encryption at rest: Required
- Incident response plan: Document before enterprise launch

### Security Hardening Checklist

- [ ] Rate limiting on all auth endpoints
- [ ] CSRF protection (SameSite cookies + token)
- [ ] Content Security Policy headers
- [ ] SQL injection review (Drizzle ORM parameterizes — verify raw queries)
- [ ] XSS audit on all user-generated content rendering
- [ ] Dependency vulnerability scan (pnpm audit, Snyk)
- [ ] Secret scanning (no keys in git history)
- [ ] CORS configuration (restrict to app domains only)
- [ ] File upload validation (type, size, malware scan)
- [ ] Webhook signature verification (HMAC-SHA256)
- [ ] API key scope enforcement
- [ ] Penetration test before enterprise launch

### Backup Strategy

| Component | Frequency | Retention | Location |
|-----------|-----------|-----------|----------|
| PostgreSQL | Daily full + hourly WAL | 30 days | Separate cloud region |
| Object storage | Cross-region replication | Indefinite | Secondary S3 bucket |
| Secrets/config | On change | All versions | Vault (HashiCorp) or AWS SSM |
| App state | Per-device sync | Latest + 50 versions | Server DB |

---

## 6. Infrastructure & Scalability

### Hosting Recommendation

**Phase 1 (Launch):** Single VPS or PaaS
- **Option A — Railway/Render:** $20–50/month, zero-ops, auto-deploy from GitHub
- **Option B — VPS (Hetzner/DigitalOcean):** $10–20/month, more control, manual setup

**Phase 2–3 (Growth):** Managed services
- PostgreSQL: Neon or Supabase (free tier → $25/month)
- Redis: Upstash (serverless, pay-per-use)
- Object Storage: Cloudflare R2 (no egress fees)
- CDN: Cloudflare (free tier)

**Phase 4–5 (Scale):** Container orchestration
- Kubernetes (EKS/GKE) or Docker Swarm
- Auto-scaling based on CPU/request count
- Multi-region deployment

### DevOps Pipeline

```
Developer Push → GitHub Actions CI:
  1. pnpm install (cached)
  2. pnpm check (TypeScript)
  3. pnpm lint (ESLint)
  4. pnpm test (Vitest)
  5. pnpm audit (security)
  6. Build Docker image
  7. Push to container registry
  8. Deploy to staging
  9. Run smoke tests
  10. Manual approval → Deploy to production
```

### Monitoring Stack

| Concern | Tool | Cost |
|---------|------|------|
| Error tracking | Sentry (already configured) | Free tier (5K events/month) |
| APM | Sentry Performance | Included |
| Uptime | BetterUptime or UptimeRobot | Free tier |
| Logs | Grafana Loki or Axiom | Free tier |
| Metrics | Grafana Cloud | Free tier |
| Alerts | PagerDuty or Grafana Alerting | Free tier |

### Performance Targets

| Metric | Target | How to Measure |
|--------|--------|----------------|
| API p95 latency | < 200ms | Sentry Performance |
| App cold start | < 2s | Expo Performance |
| Search response | < 500ms | Custom timing |
| Sync completion | < 5s for 100 items | Custom timing |
| Uptime | 99.9% (8.7h downtime/year) | Uptime monitor |
| Error rate | < 0.1% of requests | Sentry |

---

## 7. Go-to-Market Strategy

### Branding

- **Name:** Knowledge Vault
- **Tagline:** "Capture anything. Find everything. Act on what matters."
- **Tone:** Professional but approachable. Not corporate. Not cutesy.
- **Visual Identity:** Clean, minimal, dark-mode-forward. Vault/safe metaphor in logo.

### Positioning

**Category:** Personal Knowledge Management (PKM) + Productivity
**Position:** "The knowledge app for people who actually want to use what they save"

**Key Messages:**
1. Stop saving things you'll never find again
2. AI that organizes so you don't have to
3. Your knowledge, your device, your rules (offline-first, exportable)

### Pricing Model

| Tier | Price | Features |
|------|-------|----------|
| **Free** | $0 | 500 items, 3 tags, basic search, 1 device |
| **Pro** | $8/month or $72/year | Unlimited items, AI features, semantic search, 5 devices, API access |
| **Team** | $12/user/month | Shared vaults, collaboration, team analytics, priority support |
| **Enterprise** | Custom | SSO, audit logs, SLA, data residency, dedicated support |

**Why this pricing:**
- Free tier generous enough to prove value (500 items = ~6 months of daily use)
- Pro priced below Notion ($10) and Evernote ($15) — positioned as better value
- Annual discount (25%) drives commitment
- Team tier bridges gap to enterprise

### Acquisition Channels

**Organic (Months 1–6):**
1. **Product Hunt launch** — Target #1 Product of the Day
2. **Reddit** — r/productivity, r/PKMS, r/ObsidianMD, r/notion (share genuinely, not spam)
3. **Twitter/X** — Build in public, share development journey
4. **YouTube** — "How I built a PKM app" series, demo videos
5. **Blog/SEO** — "Best note-taking apps 2026", "Obsidian vs Notion vs Knowledge Vault"
6. **Hacker News** — Show HN post

**Paid (Months 6+):**
1. **Google Ads** — "note taking app", "knowledge management tool"
2. **YouTube sponsorships** — Productivity YouTubers (Ali Abdaal, Thomas Frank tier)
3. **App Store ASO** — Keywords: knowledge, notes, productivity, AI notes

**Community (Ongoing):**
1. Discord server for users
2. Public roadmap (Linear or GitHub Projects)
3. Changelog blog
4. Template/workflow sharing

---

## 8. Launch Strategy

### Pre-Launch (4 weeks before)

- [ ] Landing page live (knowledgevault.app) with email waitlist
- [ ] Product Hunt upcoming page created
- [ ] Social media accounts created (Twitter, Discord)
- [ ] Beta testers recruited (target: 50–100 users)
- [ ] App Store developer accounts (Apple $99/year, Google $25 one-time)
- [ ] Privacy policy and ToS published
- [ ] Press kit (screenshots, logo, description)

### Beta Phase (2–4 weeks)

- [ ] TestFlight (iOS) + Internal Testing (Android) distribution
- [ ] In-app feedback mechanism (shake to report, feedback form)
- [ ] Daily monitoring of Sentry errors
- [ ] Weekly beta user survey (5 questions max)
- [ ] Bug triage and fix cycle (48h turnaround for critical)
- [ ] Identify top 3 feature requests for post-launch sprint

### Beta Success Criteria

| Metric | Target | Action if Missed |
|--------|--------|------------------|
| Day-1 retention | > 60% | Improve onboarding |
| Day-7 retention | > 30% | Add engagement hooks (notifications, streaks) |
| Items created per user (week 1) | > 10 | Simplify capture flow |
| Crash-free rate | > 99.5% | Fix stability before launch |
| NPS score | > 40 | Address top complaints |

### Launch Day

1. Submit to App Store + Play Store (allow 3–7 days for review)
2. Product Hunt post goes live (coordinate for Tuesday, 12:01 AM PT)
3. Hacker News "Show HN" post
4. Tweet thread + Reddit posts
5. Email waitlist with download links
6. Discord server opens to public
7. Monitor everything: Sentry, app reviews, social mentions

### Post-Launch Iteration Cycle

```
Weekly cycle:
  Monday    — Review analytics (retention, usage, errors)
  Tuesday   — Prioritize bugs and feature requests
  Wednesday — Build (focus on highest-impact item)
  Thursday  — Build + internal testing
  Friday    — Ship update + respond to reviews
```

---

## 9. Post-Launch Growth Plan

### Analytics Framework

**Key Metrics (North Star: Weekly Active Users who create 3+ items):**

| Category | Metric | Tool |
|----------|--------|------|
| Acquisition | Downloads, signups, activation rate | App Store Connect, Firebase |
| Activation | % who create first item within 24h | Custom events |
| Engagement | DAU/WAU/MAU, items created/day, search queries/day | Mixpanel or PostHog |
| Retention | D1, D7, D30 retention | Mixpanel or PostHog |
| Revenue | MRR, ARPU, conversion rate (free→pro), churn | Stripe Dashboard |
| Referral | Shares created, public links viewed, invite rate | Custom events |

### Retention Strategy

1. **Daily journal prompt** (push notification at user's preferred time)
2. **Habit streak protection** ("You're on a 14-day streak! Don't break it")
3. **Weekly review digest** (email + in-app: "You saved 12 items this week")
4. **AI insights** ("Your most productive day is Wednesday")
5. **Progressive feature discovery** (tooltip tours for advanced features)
6. **Social proof** ("5,000 knowledge workers trust Knowledge Vault")

### Feature Expansion Prioritization

Use ICE scoring (Impact × Confidence × Ease):

| Feature | Impact | Confidence | Ease | Score | Priority |
|---------|--------|------------|------|-------|----------|
| Semantic search | 10 | 9 | 7 | 630 | P0 |
| Browser extension | 9 | 8 | 6 | 432 | P1 |
| AI daily digest | 8 | 7 | 8 | 448 | P1 |
| Notion import | 7 | 8 | 7 | 392 | P1 |
| Shared vaults | 9 | 6 | 4 | 216 | P2 |
| Web app | 8 | 7 | 4 | 224 | P2 |
| Desktop app | 6 | 6 | 3 | 108 | P3 |

### Monetization Milestones

| Milestone | Target | Timeline |
|-----------|--------|----------|
| First paying customer | 1 Pro subscriber | Month 2 |
| Ramen profitability | $2K MRR (covers server + dev costs) | Month 6 |
| Growth phase | $10K MRR, 1000+ Pro users | Month 12 |
| Team tier traction | 10 teams, $5K team MRR | Month 15 |
| Series-ready | $50K MRR, 10K+ users | Month 18–24 |

---

## 10. Risks, Bottlenecks & Mitigation

### Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| SQLite won't scale past 1000 concurrent users | High | High | Migrate to PostgreSQL in Phase 1 (planned) |
| Tags schema uses mysqlTable (type mismatch) | Already present | Medium | Migrate to sqliteTable → pgTable in DB migration |
| AI API costs spike with usage | Medium | High | Cache AI results, rate-limit AI features per tier, use smaller models for tagging |
| Offline sync conflicts increase with multi-device | Medium | Medium | Improve conflict resolution UI, add auto-merge for non-conflicting fields |
| App Store rejection | Low | High | Review guidelines pre-submission, avoid private APIs, include privacy nutrition labels |

### Product Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Feature overlap with Notion/Obsidian makes differentiation hard | Medium | High | Double down on AI + action integration (tasks/habits/goals) — competitors don't have this |
| Users save items but never retrieve (graveyard effect) | High | High | AI proactive suggestions, daily digest, spaced repetition prompts |
| Free tier too generous → no conversion | Medium | Medium | A/B test limits, ensure AI features are Pro-only |
| Free tier too restrictive → no adoption | Medium | Medium | A/B test limits, ensure core value is free |

### Business Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Solo developer burnout | High | Critical | Automate everything possible, scope ruthlessly, hire first before scaling |
| AI provider (Gemini) changes pricing or terms | Medium | High | Abstract LLM layer (already done), support multiple providers |
| Data breach | Low | Critical | Security hardening checklist, penetration test, incident response plan |
| Competitor launches similar AI-PKM product | Medium | Medium | Speed to market, community moat, data portability as trust signal |

### Key Bottlenecks

1. **Single developer** — Everything depends on one person. Mitigate: automate CI/CD, use managed services, defer non-essential features.
2. **Database migration** — SQLite→PostgreSQL is the single riskiest technical task. Mitigate: comprehensive migration script with rollback, run in parallel before cutover.
3. **AI cost scaling** — Each item creation triggers LLM calls. Mitigate: batch processing, caching, use embeddings (cheap) for search and LLM (expensive) only on demand.
4. **App Store review cycles** — Each update takes 1–3 days. Mitigate: OTA updates via Expo Updates for JS changes, reserve native builds for critical updates.

---

## Appendix: Decision Log

| Decision | Rationale | Date |
|----------|-----------|------|
| Expo + React Native over Flutter | Existing codebase, JS ecosystem, OTA updates | Pre-existing |
| tRPC over GraphQL | Type safety end-to-end, simpler for solo dev, perfect for React Native | Pre-existing |
| SQLite → PostgreSQL migration planned | SQLite can't handle concurrent writes, no vector search | Phase 1 |
| Gemini 2.5 Flash as primary LLM | Cost-effective, fast, good enough for tagging/summarization | Pre-existing |
| Offline-first architecture | Core differentiator, mobile users expect it, builds trust | Pre-existing |
| Freemium pricing over subscription-only | Lower barrier to adoption, prove value before asking for payment | Phase 1 |
| No web app at launch | Focus on mobile excellence first, web adds complexity | Phase 4 |

---

## Shipped Checkpoint — 2026-04-22 (phases 3/4/5 rounded out)

### Phase 3 — Collaboration (now ~85%)
- `vaults` + `vault_members` + `vault_activity` tables
- `vaultsRouter`: listMine / create / update / delete / listMembers / invite /
  removeMember / leave / feed / logEvent. Roles: owner / editor / viewer.
- Still TODO: plumb vaultId through item/task queries for per-vault filtering
  (additive, non-breaking)

### Phase 4 — Platform Expansion (now ~80%)
- Browser extension (shipped earlier)
- PWA: `/manifest.webmanifest`, `/sw.js` service worker (offline landing),
  `/pwa-icon-*.svg`, theme-color meta, installable from the landing page
- Zapier integration: `zapierRouter` with authTest / recentItems /
  recentTasks / recipes + REST `/api/me` for key verification
- Still TODO: a full interactive web app (flashcards/items UI beyond landing)

### Phase 5 — Enterprise (now ~60%)
- `users.isAdmin` column + idempotent ALTER TABLE
- `adminRouter`: whoami / systemStats / listUsers / setUserActive /
  grantAdmin / listFeedback / recentAuditEvents
- `ssoRouter`: listProviders / allProviders / discovery (OIDC .well-known)
  driven by env vars (Google, GitHub, Apple, Microsoft, Okta, custom OIDC)
- Still TODO: actual OAuth callback handlers, data residency policy,
  SLA tiers (operational — not code)

## Shipped Checkpoint — 2026-04-22

Phase 0 (Stabilization) and Phase 1 (MVP) are both fundamentally complete in
code; Phase 2 (Intelligence) is 100% shipped as tRPC procedures with UI
integration; Phase 3 (Collaboration) is ~60% (mentions, comments, shares,
push delivery, notification prefs — missing realtime WebSocket and multi-
user vaults); Phase 4 (Platform Expansion) is ~55% (browser extension
shipped, markdown import/export, server-rendered public pages, /api/v1
alias, /api/schema docs, /_metrics — missing web app and Zapier); Phase 5
(Enterprise) is ~35% (audit log, API key scopes, webhook HMAC, activity log
UI, quiet hours — missing SSO and admin dashboard).

**Shipped tRPC routers (31 total):** auth, items, tasks, journal, tags,
categories, attachments, export, stats, sync, devices, transcription,
analytics, taskTime, habits, goals, subtasks, itemShares, itemComments,
publicLinks, api, itemVersions, ai, pushTokens, notifications,
savedSearches, templates, feedback, search, reviews, onboarding.

**Shipped tables beyond the original 23:** audit_log, push_tokens,
saved_searches, templates, feedback, notification_prefs, reviews,
onboarding (8 new).

**Browser extension:** Chrome/Firefox Manifest V3 at `extension/`, uses
REST API with X-Api-Key (write scope), supports popup capture, context
menu (page / selection as quote / link / selection as task), and a
keyboard shortcut (Alt+Shift+S).

Next big-ticket (unshipped):

- Real-time sync (WebSocket) — replaces the current 30s comment polling
- Shared vaults (team workspaces) — today's sharing is per-item only
- Web app / PWA — for desktop capture without the extension
- SSO (SAML/OIDC)
- Admin dashboard with per-user usage, quotas, billing state
- pgvector-backed embeddings (current semantic search is LLM-rerank)
- PostgreSQL migration (SQLite is fine until ~1000 concurrent users)

---

*Last updated: 2026-04-22*
*Author: Knowledge Vault Product Team*
