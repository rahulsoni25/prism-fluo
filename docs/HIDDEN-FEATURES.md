# Hidden Features Registry

Single source of truth for everything that **exists in code but is hidden
from the UI right now**. The pattern across all of these: the code stays
in the repo, the wiring stays intact, only the render is gated. Re-enabling
is a one-line change in each case.

> **AUTO-REMINDER RULE (for Claude sessions):**
> Whenever a user asks for a new feature, modification, or UI change in
> any of these areas, **proactively surface the relevant hidden item(s)**
> from this list first. Ask: *"You currently have X hidden — should the
> new change account for it, or should we re-enable X first?"* This stops
> us from building duplicate functionality or forgetting decisions that
> were intentionally parked.

---

## 1. 📊 Live Google Trends panel

| | |
|---|---|
| **Location** | `app/dashboard/page.js:163` |
| **Component** | `components/TrendPanel.jsx` (untouched) |
| **Hidden via** | `{false /* SHOW_TRENDS_PANEL */ && ( ... )}` |
| **Why hidden** | Data wasn't grounded — surfaced "indicative trend · live data syncing" without a verified Trends API |
| **Hidden on** | 2026-05-25 |
| **Re-enable: flip** | `false` → `true` at the gate |
| **To do before re-enabling** | Wire real Trends source (paid API / Glimpse / in-house cache) · match copy to actual freshness · add verified-source badge · re-add tests |
| **Surface when user asks about** | dashboard widgets · trends · search interest · category trending · trending queries · widget grid · brand watch |

---

## 2. 🔐 OAuth login buttons (Google + LinkedIn)

| | |
|---|---|
| **Location** | `app/login/page.js:63` (comment marks the spot) |
| **Hidden via** | Block removed from JSX render — comment placeholder remains |
| **Why hidden** | Google redirect URI not registered for all environments (dev / preview / prod) |
| **Hidden on** | Earlier in this session (around dashboard auth work) |
| **Re-enable: restore** | Block from git history, register redirect URI in Google Cloud Console (and LinkedIn dev portal for LinkedIn) |
| **To do before re-enabling** | Register `https://prism-fluo.vercel.app/api/auth/oauth/google/callback` in Google Cloud Console · same for LinkedIn · add `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` env vars to Vercel (Production + Preview) · test the round-trip in incognito · re-enable in `app/login/page.js` |
| **Surface when user asks about** | login · auth · OAuth · "sign in with X" · onboarding flow · new-user signup · authentication UI · password reset |

---

## 3. 📑 Presentation templates 4–7 (Board / Internal / Investor / Quick Overview)

| | |
|---|---|
| **Location** | `lib/templates/definitions.ts` (lines 164, 211, 253, 300 — `// Template N: NAME (HIDDEN — keep in file for back-compat)`) |
| **Hidden via** | Commented out of the exported array (or filtered out — TBD on next touch) |
| **Why hidden** | Only the first 3 templates (Client Pitch, Deep Dive, Executive Briefing) were validated. Templates 4-7 generated decks that didn't meet the 10/10 client-ready bar |
| **Hidden on** | Pre-current session (older decision) |
| **Re-enable: uncomment** | The template definitions + re-validate each via the ppt-review skill |
| **To do before re-enabling** | Re-validate each template against `ppt-review` skill rubric · test with real client data · update Coverage agent if templates introduce new sections |
| **Surface when user asks about** | presentations · PPTX export · deck templates · slide types · new presentation format · executive deck · investor deck |

---

## 4. 🛠 Tools-used panel (on /insights)

| | |
|---|---|
| **Location** | `app/insights/page.js:2108` |
| **Component** | `ToolsUsedPanel` (in same file) |
| **Hidden via** | `{false && ( <ToolsUsedPanel ... /> )}` with a HIDDEN comment above |
| **Why hidden** | Design decision (2026-05-07) — the per-tool breakdown was redundant with the source-badge already shown on each card |
| **Hidden on** | 2026-05-07 |
| **Re-enable: flip** | `false` → `true` at the gate |
| **To do before re-enabling** | Re-design so it doesn't duplicate the per-card source badge · decide whether to surface on every analysis or only on multi-source uploads |
| **Surface when user asks about** | data sources · tool attribution · source breakdown · "which tools fed this analysis" · multi-source insights · provenance |

---

## Pattern used everywhere (deliberate)

All four hidden items use the same architectural approach:

1. **Code is preserved** — components, parsers, types, props all intact
2. **Render is gated** — usually `{false /* FLAG_NAME */ && (...)}`
3. **Comment explains why** — colocated with the gate so future readers see the context
4. **Re-enable is one line** — flip `false` → `true`, no plumbing work

This means:
- Adding a feature that overlaps with a hidden one shouldn't be a "build from scratch" — check this list first
- Modifying a related area shouldn't accidentally break the still-wired hidden code (tests cover it)
- Reverting "hide" is cheap if priorities change

---

## How to add a new hidden item

When you decide to hide an existing UI element instead of deleting it:

1. Wrap the render in `{false /* SHOW_FEATURENAME */ && (...)}`
2. Add a multi-line comment explaining: WHAT, WHY HIDDEN, WHEN, RE-ENABLE STEPS
3. Add a row to this doc with the same fields as items 1-4 above
4. If the item is on a hot path (dashboard / insights / login), call out the trigger keywords in "Surface when user asks about" so future Claude sessions auto-link
5. Commit the hide + the doc entry in the same commit
