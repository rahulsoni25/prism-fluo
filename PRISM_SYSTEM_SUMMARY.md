# PRISM — System Summary
> Last updated: 2026-05-01  
> Production URL: https://prism-fluo.vercel.app  
> Repo: https://github.com/rahulsoni25/prism-fluo

---

## What This App Does

PRISM is an **agency intelligence platform**. It lets marketing/research teams:
1. **Create a Brief** — define a brand campaign (brand, category, objective, target audience, SLA)
2. **Upload research files** — Excel, CSV, or PDF (GWI surveys, keyword plans, Helium10, Google Trends, etc.)
3. **Auto-generate an Intelligence Report** — Gemini 2.5 AI analyses the data and produces insight cards grouped by Content / Commerce / Communication / Culture
4. **Download a PPT** — the insights deck is exportable
5. **Track SLA** — each brief has a go-live timer (3h / 6h / 12h / 24h / 48h)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, TypeScript) |
| Database | Supabase PostgreSQL |
| DB connection | `pg.Pool` (direct) + PostgREST HTTP fallback |
| Auth | Custom JWT session cookie (`prism_session`) signed with `AUTH_SECRET` |
| AI | Gemini 2.5 Flash (via `GEMINI_API_KEY`) |
| Hosting | Vercel (Hobby plan, sfo1 region) |
| Styling | Tailwind CSS v4 + globals.css custom properties |

---

## Environment Variables (Vercel Production)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | `postgresql://postgres.euwvjzszgnbuabyrvxhr:...@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres` — Supabase pooler (NOT direct port 5432) |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://euwvjzszgnbuabyrvxhr.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service key (bypasses RLS, used for PostgREST fallback) |
| `AUTH_SECRET` | Secret for signing session JWTs |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth |
| `AUTH_DEMO_OPEN` | `true` = allow demo email login (default on) |
| `GEMINI_API_KEY` | Google Gemini 2.5 API key |
| `NEXT_PUBLIC_APP_URL` | `https://prism-fluo.vercel.app` |

---

## Key Architecture Decisions

### 1. Dual DB Write Path (pg + PostgREST fallback)
`pg.Pool` connects directly to Supabase. If TCP port 5432 is blocked or the password changes, ALL queries silently return `{rows:[]}` (the catch block in `lib/db/client.ts` swallows errors).

To compensate, critical routes have a **PostgREST HTTP fallback** — every important write/read also tries `https://<SUPA_URL>/rest/v1/<table>` with the service role key if `pg` returns empty.

Files with PostgREST fallback:
- `lib/auth/server.ts` — `upsertUser()`
- `app/api/briefs/route.js` — GET list + POST create
- `lib/uploads/handler.ts` — upload insert

### 2. Session Auth
- Login: `POST /api/auth/login` with email (any `@wunderman.com`, `@fluo.ai`, etc.)
- Session stored in `prism_session` cookie (HMAC-signed JWT, 7-day TTL)
- `lib/auth/session.ts` — `signSession()` / `verifySession()`
- `lib/auth/server.ts` — `getSession()` reads cookie in API routes

### 3. User ID Resolution
A known issue: if `pg.Pool` fails at login time, `upsertUser` generates an email-hash fallback UUID (e.g. `73617261-...`). Briefs and uploads created later resolve the *real* DB UUID via email lookup.

The `resolveUserIds(session)` helper in `app/api/briefs/route.js` handles this by:
1. Looking up all UUIDs for `session.email` via pg (email → SELECT id FROM users WHERE email = $1)
2. Falling back to PostgREST if pg is empty
3. Including `session.userId` as additional candidate
4. Using `WHERE user_id = ANY($ids::uuid[])` so briefs under ANY of the user's UUIDs are returned

---

## User Flow (Full)

```
/login  →  POST /api/auth/login  →  session cookie set
                ↓
/briefs  →  GET /api/briefs  →  list all user's briefs
                ↓
/briefs/new  →  POST /api/briefs  →  create brief (brand, category, SLA auto-calculated)
                ↓
/upload?briefId=<id>   (or just /upload — BriefSelectModal appears)
  Step 1: Select Brief (BriefSelectModal)
  Step 2: Drop Excel/CSV/PDF files → processAll()
    → POST /api/upload  (stores upload row, parses file, stores data in gwi_time_spent / keywords / tool_data)
    → POST /api/ai/analyze-data  (Gemini 2.5 generates insight cards)
    → POST /api/analyses  (saves analysis, flips brief.status → 'ready')
  Step 3: SLA picker appears (SlaSelectModal)
  Step 4: Redirect → /insights?id=<analysisId>&sla=<hours>
                ↓
/insights?id=<analysisId>  →  shows PRISM Intelligence Report with charts
  - Gemini-powered insight cards grouped by Content/Commerce/Communication/Culture
  - SLA badge showing go-live time
  - Copilot chat panel (bottom-right)
  - Download PPT button
```

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `users` | id, email, name, image, provider, last_login |
| `briefs` | id, brand, category, objective, status, age_ranges, gender, market, sla_hours, sla_due_at, actual_completed_at, user_id |
| `uploads` | id, filename, brief_id, user_id, sla_hours, sla_due_at |
| `analyses` | id, upload_id, sheet_name, filename, results (JSON), brief_id, user_id |
| `gwi_time_spent` | GWI survey data rows |
| `keywords` | Keyword plan data |
| `tool_data` | Helium10/Trends/Konnect/generic rows |

**Brief status flow:** `draft` → `waiting_for_data` → `processing` → `ready`  
(auto-transitions when upload is linked via `brief_id`)

---

## Key API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/auth/login` | POST | Demo/email login → sets session cookie |
| `/api/auth/logout` | POST | Clears session cookie |
| `/api/auth/me` | GET | Returns current session user |
| `/api/briefs` | GET | List user's briefs (multi-UUID aware) |
| `/api/briefs` | POST | Create brief with auto SLA |
| `/api/upload` | POST | Upload file, parse, store data |
| `/api/analyses` | POST | Save analysis, link to brief, flip status |
| `/api/analyses` | GET | List analyses for user |
| `/api/ai/analyze-data` | POST | Gemini 2.5 insight generation |
| `/api/ai/analyze-pdf` | POST | Gemini 2.5 PDF text analysis |
| `/api/ai/enhance` | POST | Gemini title enhancement |
| `/api/uploads/:id/sheets/:name/data` | GET | Fetch parsed sheet rows |
| `/api/copilot` | POST | Chat with analysis data via Gemini |
| `/api/health` | GET | DB + system health check |
| `/api/version` | GET | Deployed commit SHA + env var status |

---

## Key Source Files

```
app/
  api/
    auth/login/route.ts        — demo login
    auth/logout/route.ts       — sign out (clears cookie with full options)
    auth/me/route.ts           — session info
    briefs/route.js            — GET/POST briefs with resolveUserIds()
    upload/route.ts            — file upload handler
    analyses/route.ts          — save analysis + link to brief
    ai/analyze-data/route.ts   — Gemini 2.5 tabular analysis
    ai/analyze-pdf/route.ts    — Gemini 2.5 PDF analysis
    health/route.ts            — health check
    version/route.ts           — deployment info
  upload/page.tsx              — upload flow UI (BriefSelectModal + SlaSelectModal)
  insights/page.js             — intelligence report viewer
  briefs/page.js               — briefs dashboard

components/
  BriefSelectModal.jsx         — modal: pick brief before upload
  SlaSelectModal.jsx           — modal: pick SLA (3/6/12/24/48h) after upload
  BriefCard.js                 — brief card component
  Navbar.js                    — navigation
  Copilot.jsx                  — AI chat panel (floating, insights page)

lib/
  auth/
    session.ts                 — JWT sign/verify, SESSION_COOKIE_OPTIONS
    server.ts                  — getSession(), upsertUser() with PostgREST fallback
  db/
    client.ts                  — pg.Pool wrapper (NOTE: silently swallows errors)
    schema.sql                 — full DB schema with ALTER TABLE migrations
  uploads/handler.ts           — file parsing + DB insert (sla_hours support)
  sla.server.ts                — calculateSla() — dynamic SLA based on queue depth
  cache.ts                     — in-memory LRU cache
  logger.ts                    — structured logging
```

---

## Known Issues / Technical Debt

1. **`lib/db/client.ts` swallows errors silently** — the `catch` block returns `{rows:[]}` instead of re-throwing. This means:
   - Health check always shows "connected" even when DB is down
   - All routes that rely on pg need explicit PostgREST fallback
   - **Fix**: replace the catch with `throw err` and update routes to handle errors

2. **Fallback UUID in session** — if pg.Pool fails at login time, `upsertUser()` generates an email-hash UUID (`73617261-...` for `sarah@wunderman.com`). This UUID gets into the session cookie. Subsequent requests use `resolveUserIds()` to also look up the real UUID by email, but the underlying root cause is the silent pg failure.

3. **Vercel auto-deploy gap** — GitHub pushes create preview deployments (SSO-protected), NOT production deployments. Must run `npx vercel --prod --yes` from the local repo to update `prism-fluo.vercel.app`.

4. **`maxDuration = 60` on upload route** — Vercel Hobby plan caps at 60s. Very large files may timeout.

---

## How to Deploy

```bash
# 1. Make changes locally
# 2. Commit
git add -A && git commit -m "your message"

# 3. Push to GitHub (creates preview only)
git push origin main

# 4. Deploy to production
npx vercel --prod --yes

# 5. Verify
curl https://prism-fluo.vercel.app/api/version
```

---

## Demo Login

- URL: https://prism-fluo.vercel.app/login
- Email: `sarah@wunderman.com` (or any `@wunderman.com` / `@fluo.ai` email)
- Password: anything (demo mode accepts all passwords)

---

## Issues Fixed in This Session (2026-05-01)

| # | Problem | Root Cause | Fix |
|---|---------|-----------|-----|
| 1 | Brief creation 500 error | `pg.Pool` silently failing → `upsertUser` returned email-hash UUID → FK constraint violated | Added PostgREST fallback in `upsertUser` + user ID resolution in briefs route |
| 2 | Sign-out not working | Logout route set `maxAge:0` without matching `Secure`/`SameSite` flags → browser ignored deletion | Spread full `SESSION_COOKIE_OPTIONS` when clearing cookie |
| 3 | Briefs not appearing after creation | GET filter used session UUID (`73617261...`) but briefs stored under real UUID (`056e0f54...`) | Added `resolveUserIds()` — email-based lookup returning all UUIDs; GET uses `ANY($ids)` |
| 4 | Vercel not serving production | GitHub push created SSO-protected preview, not updating prod alias | Run `vercel --prod --yes` explicitly |
| 5 | DATABASE_URL wrong | Pointing to direct `db.supabase.co:5432` which is blocked | Updated to pooler URL `pooler.supabase.com:6543` |
