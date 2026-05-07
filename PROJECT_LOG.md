# PRISM Fluo — Project Log (Last 3 Weeks)

**Repo:** prism-fluo-main
**Owner:** Rahul Soni (rahulsoni25@gmail.com)
**Deployment:** Vercel (auto-deploy from `main` branch, sfo1 region)
**Database:** Supabase Postgres (session pooler, port 5432)
**Period covered:** 2026-04-24 → 2026-05-07 (~155 commits)

---

## 1. What PRISM Fluo Is

A marketing-intelligence platform that ingests campaign data (CSV / Excel / PDF / PPT) and produces strategic insights organized around the **4-Pillar PRISM framework** (Content / Commerce / Communication / Culture).

Core capabilities:
- Brief management (create, link, track SLA)
- Multi-format file ingestion with Gemini AI parsing
- Auto-generated insights dashboards with charts
- AI Copilot (Grok / xAI) for conversational drill-down
- Auto-generated PPTX decks from analysis
- Multi-user with owner-scoped data + auth (demo + Google OAuth)

---

## 2. Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16.2.4 (Turbopack, App Router) |
| Runtime | Node.js ≥ 22 |
| Language | TypeScript + JSX |
| Styling | Tailwind CSS v4 + Inter font |
| DB | Supabase Postgres (direct + pooler) |
| AI — Insights | Google Gemini 2.5 |
| AI — Copilot | Grok / xAI API |
| Auth | Custom session cookies + Google/LinkedIn OAuth |
| Email | nodemailer (SMTP, no Resend) |
| Decks | PPTX generation (custom template engine) |
| Deploy | **Vercel** (`vercel.json`, auto-deploy on `main`) |

**Note on Railway:** `railway.toml` exists in repo as legacy; project is **NOT** deployed there. Vercel is the live platform.

---

## 3. Phase Timeline

### Phase 1 — Foundation & Build Stabilization (Apr 24)
Commits: `6182f01` → `e8bdae2`

- Initial Next.js 16 stack work; many "first build" fights
- Fixed Node version requirement (≥ 20.9.0, then bumped to 22)
- Switched to **Docker multi-stage build** to escape `EBUSY` cache lock issues on Railway
- Added Tailwind CSS v4 (upload page was unstyled)
- Lazy-init DB pool to avoid crash during `next build`
- Skipped TS/ESLint build errors to unblock deploys

### Phase 2 — Core Insights Engine (Apr 24)
Commits: `caae3d2`, `137eadf`, `cf1236b`, `3a13275`, `9f6e83d`

- PDF upload + multi-tool parsers + Gemini AI titles
- Culture Dashboard, floating charts
- Per-chart PRISM bucket tagging + multi-file upload
- AnalysisDetail rewritten to match "Nike India insights" design
- Eliminated double-upload bug; fixed bucket distribution

### Phase 3 — Gemini Tone Tuning (Apr 24)
Commits: `165ec8a` → `35110f9`

- Adopted **Gemini 2.5** as primary PRISM analysis engine
- Iterated prompt: creative/media planning → 7th-grade plain English → magazine storytelling
- McKinsey-style dashboard + anti-hallucination guardrails + scatter charts
- Fixed 5 audit bugs (prompt literal, double enhance, badge map, col aliases, scatter tooltip)

### Phase 4 — Reliability & Bulk Insert Fixes (Apr 25)
Commits: `be9ed4e` → `f7c1b1c`

- PDF Gemini analysis + unique insight cards per slot
- Blocked rule engine on GWI data, improved Gemini failure logging
- Eliminated empty chart cards (data validation pre-render)
- `/api/version` endpoint for deploy verification
- Force-exit `init_db`, single Node entry-point

### Phase 5 — Multi-User & Auth Foundation (Apr 26)
Commits: `1fa31e6`, `c43fa6c`, `f1584c6`, `cf69d1b`, `4584a45`, `d8fd606`, `d6d2ba5`, `bc431e4`

- Added `users` table + ownership FKs + SLA schema (Phase A)
- SLA wired end-to-end across briefs API + UI
- Brief-linked uploads with auto status transitions, planned vs actual SLA
- Brief-aware upload UI, tools-used panel, template duplication
- **Real session-cookie login** (demo + OAuth-ready)
- Owner-scoping, route-guard middleware, real navbar (Phase C)
- Files panel, PDF/Excel export, owner-scoping cleanup
- Generic Gemini path for any tabular data (killed rule engine)
- **PRISM Copilot** powered by Ollama at this point

### Phase 6 — SMART Summaries & Brief/SLA Modals (Apr 27)
Commits: `6595597`, `3f23f81`, `2578f18`, `a7d9ff3`

- SMART-framework executive summaries for all analyses
- Fixed Tailwind `@import` issue (fonts moved into `@layer base`)
- **Brief selection & custom SLA workflow** added to upload flow

### Phase 7 — Presentation Generation & Enterprise Architecture (Apr 28)
Commits: `a0991f9` → `3b0ad94`

- Template-based presentation deck system
- "Generate Presentation" button on insights page
- Resilient to missing summary data / DB tables / migrations
- SLA module split to prevent client bundle errors
- Phase 2-4 of brief & SLA selection modals
- UX experiments: hide/show description on insights page (reverted)
- Modernized Executive Summary panel with card layout
- "Presentations" link added to navbar
- Complete presentation generation system with downloadable PPT export
- **Professional PPTX templates** (enterprise-grade, 100% free)
- "Enterprise Architecture: Complete Zero-Cost Production System" milestone
- Briefs files endpoint, Next.js 16 params type fix
- **Production deployment & security configuration**

### Phase 8 — Vercel Build Hardening (Apr 28–30)
Commits: `8cb7c79` → `2137692`

- Iterated `vercel.json` (multiple updates)
- `package.json` cleanup, removed invalid markdown
- Pinned stable package versions; added `.npmrc` to bypass peer deps
- Restored original working `package.json`/lockfile
- Switched to `npm install` (lockfile sync issues with `npm ci`)
- OAuth: use request origin for redirects + detailed error messages
- Resilience failsafe to bypass DB connection issues in production
- `/api/debug-db` whitelisted in middleware
- `@sentry/nextjs` pinned to `^8.28.0`
- Resolved merge conflict; removed invalid `env`/`buildCache` from `vercel.json`
- Added Google OAuth endpoints

### Phase 9 — DB Connection Pain (May 1)
Commits: `f9a4b2f` → `86da024`

- Temporary `/api/init-db` endpoint with debug logging (later removed)
- Brief creation: 5 redundant commits fixing draft-status DB constraint
- UUID validation for demo sessions (multiple iterations)
- `upsertUser` fallback to generate valid UUID format
- Detailed error logging on briefs POST
- SLA calculation fallback with default values

### Phase 10 — UUID & SLA Stability (May 1)
Commits: `8a45dca`, `bbf1555`, `e4447f2`, `520647f`, `d6be11d`, `f0ff76c`, `70e315f`, `2ee0c62`, `6b7db7c`, `32a05da`

- Sign-out cookie clearing + brief list UUID safety
- `/api/version` reads Vercel git env vars
- PostgREST fallback for DB
- Resolved all user UUIDs by email for consistent GET/POST ownership
- **`PRISM_SYSTEM_SUMMARY.md`** added (architecture, flows, env vars, fixes)
- Premium redesign of data mapper + presentation maker
- Parallel DB lookups + in-memory caching for faster API responses

### Phase 11 — File Parsing Robustness (May 2–5)
Commits: `d21211a`, `5e2c869`, `c5b120d`, `631765a`, `967dbc8`, `24acb90`, `1e9ae6e`, `50d18ac`, `d016696`, `af54ab8`, `a138f6d`, `88dde0c`, `2bd1af7`

- Robust file parsing with **Gemini raw-text fallback** for any CSV/Excel/PDF
- Lower ExcelJS header detection threshold (≥ 2 cells)
- Replaced Resend with **nodemailer SMTP** (no third-party account needed)
- **Email on brief creation**, In-Progress/Active status, SLA after upload
- Fixed `ReferenceError slaHours` + nodemailer dynamic import
- Insert uploads record before bulk inserts (FK constraint)
- Resilient uploads INSERT + `/api/migrate` endpoint for schema updates
- Auto-run schema migration on first upload (no manual `/api/migrate`)
- `ensureSchema` reduced from 7 round-trips to 2
- pg multi-statement → run each DDL separately
- Handle UTF-16 LE + tab-separated CSVs (Google Keyword Planner exports)
- **PPT/PPTX support** via slide text extraction → Gemini analysis
- Gemini retry on 429/503/timeout + stratified sampling + 20MB limit alignment

### Phase 12 — Vercel/Supabase Pipeline Fixes (May 4)
Commits: `0939d3b` → `cdf24ae`

- Rewrite `/api/migrate` with direct `pg.Client` + full schema
- Migrate uses direct Supabase port 5432 (not pooler 6543) + proper error handling
- Direct table probes instead of `information_schema` (broken through pgBouncer)
- `/api/debug-db` shows pg connectivity + schema state
- Fix Vercel 10s timeout + GWI Core files failing silently
- Proper GWI Core parser + direct pool for DB inserts (permanent fix)
- Reliable schema check, UI "analysing-stuck" bug, env diagnostics
- Use Supabase **session pooler (aws-1, port 5432)** + broaden SSL check to `supabase.com`
- `/api/debug-db` no longer hardcoded `pg_connected=true` — uses real connection test

### Phase 13 — Presentation Generation Hardening (May 6)
Commits: `75f61f4` → `7808839`

- Use `getPool().query()` in analyses save to surface real DB errors
- Explicit error logging on analyses upsert
- ON CONFLICT: use column names instead of constraint name
- Replaced ON CONFLICT with explicit INSERT-then-UPDATE (nuclear option)
- Generate UUID server-side, remove RETURNING clause
- Validate user exists before INSERT (avoid FK violation)
- Allow NULL user_id in analysis lookups (404 fix)
- `user_id` NULL fixes end-to-end + UUID + download endpoint
- Fix all `user_id` filters across entire API — accept NULL everywhere
- Fix `slide.ShapeType` undefined on multi-slide decks
- Final hardening: 5 production bugs before deploy
- PPTX download: return base64 inline, skip DB round-trip
- **Agency-grade PPTX redesign** with 6-slide visual system
- **4-pillar PPTX deck** (Content / Commerce / Communication / Culture)
- Removed alert popup, fixed dormant `ShapeType` bugs in `styles.ts`

### Phase 14 — SLA Modal Wiring & Demo Data (May 6)
Commits: `79d072b`, `2567662`

- Connected SLA selection modal to brief workflow
- Demo/prototype data visibility for dashboard (so empty users see UI in action)

### Phase 15 — Grok Copilot Migration (May 6)
Commits: `1b6d3f7`, `1bfd445`, `a3649e9`, `77e60b6`, `3ac1c1a`, `2b69041`, `5ab41f7`, `153db8d`

- Comprehensive deployment documentation
- Final deployment checklist + refined environment guides
- **Implemented Copilot with Grok API** (replacing Ollama) for deeper data insights
- Fix Copilot API parameter mismatch (`conversationHistory`)
- Updated config docs to use Grok instead of Ollama
- Grok Copilot verification checklist
- Grok implementation summary and status
- Action guide for immediate Grok setup

### Phase 16 — Design System Components (May 7) ← **CURRENT**
Commit: `efbd3b5`

- **24 React components** matching prototype design system
- Footer with **3 cards**: Objective (blue 🎯) / Key Findings (green 📊) / Actions (orange ⚡)
- Tailwind v4, Inter font, custom design tokens, responsive grid
- Barrel export at `components/Design/index.js`
- Bug fix: `const stats` → `let stats` in `/api/dashboard/overview/route.ts`

---

## 4. Current State (as of 2026-05-07)

**Working:**
- ✅ Vercel auto-deploys from `main`
- ✅ Supabase Postgres connected via session pooler (port 5432)
- ✅ Gemini 2.5 powering analysis pipeline
- ✅ Grok API powering Copilot
- ✅ Brief creation, file upload, SLA selection, insights generation
- ✅ PPTX generation + download
- ✅ Multi-user auth (demo + Google OAuth scaffolding)
- ✅ Email notifications via nodemailer SMTP
- ✅ Design system: 24 reusable components

**Pending / Open:**
- 🟡 Plan exists but not implemented: Brief Selection & Custom SLA modals (`~/.claude/plans/joyful-weaving-graham.md`) — partial work in `5130765` (Phase 2-4) but full plan flow not finalized
- 🟡 Dev overlay shows stale "[browser]" errors despite source being correct (Turbopack cache quirk; cosmetic only)
- 🟡 Latest commit `efbd3b5` is local — needs `git push origin main` to trigger Vercel deploy

---

## 5. Required Environment Variables (Vercel Dashboard)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Supabase Postgres connection (session pooler, port 5432) |
| `GEMINI_API_KEY` | Insights generation engine |
| `GROK_API_KEY` (or `XAI_API_KEY`) | Copilot conversational AI |
| `AUTH_SECRET` | Session cookie signing (`openssl rand -base64 32`) |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth |
| `AUTH_LINKEDIN_ID` / `AUTH_LINKEDIN_SECRET` | LinkedIn OAuth (optional) |
| `AUTH_DEMO_OPEN` | `false` to disable demo login (default `true`) |
| SMTP credentials | Email notifications via nodemailer |

---

## 6. Existing Documentation Files

- `README.md` — repo overview
- `AGENTS.md` / `CLAUDE.md` — agent guidance (Next.js 16 has breaking changes, read `node_modules/next/dist/docs/`)
- `PRISM_SYSTEM_SUMMARY.md` — full architecture
- `DEPLOYMENT.md` / `DEPLOYMENT_CHECKLIST.md` / `VERCEL_DEPLOYMENT.md` / `VERCEL_SETUP.md` — Vercel guides
- `SETUP_GUIDE.md` — local dev setup
- `COPILOT_GUIDE.md` — Copilot integration
- `GROK_IMPLEMENTATION_SUMMARY.md` / `GROK_VERIFICATION_CHECKLIST.md` / `RAILWAY_GROK_SETUP.md` / `ACTION_NOW.md` — Grok migration (note: Railway docs are stale; Vercel is live)
- `PRODUCTION_SECURITY.md` — security posture

---

## 7. Key Lessons Learned

1. **Vercel ≠ Railway:** Repo has `railway.toml` from earlier attempts; live deployment is Vercel.
2. **Supabase pooler quirk:** `information_schema` queries fail through pgBouncer; use direct table probes.
3. **pg multi-statement:** Doesn't work — split each DDL.
4. **Vercel 10s timeout:** Long Gemini calls need streaming or chunking.
5. **Demo data fallback:** Empty users see prototype briefs to demo the UI.
6. **`user_id` NULL everywhere:** Anonymous demo flow requires nullable FKs across the API.
7. **Turbopack dev overlay:** Caches old error messages — server can be healthy while overlay lies.
