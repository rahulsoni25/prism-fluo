# PRISM Fluo — Project Status & Pending Tasks
*Living document. Last updated: 2026-05-18*
*Twice-daily reminder pings the conversation with this file's pending list.*

---

## What shipped this week (timeline)

### 2026-05-15 to 2026-05-17 — Analyzer reliability
1. **Keyword 8-Layer methodology** — `analyzeKeywordPlannerForPRISM` + `keyword-strategist` skill
2. **3-lens curation** — every card carries `creative | media | category` lens
3. **Unified blueprint across all analyzers**:
   - `lib/ai/prompt-fragments.ts` — `STORYTELLING_DISCIPLINE` + `ANTI_HALLUCINATION` + `THREE_LENS_RUBRIC` shared by GWI / keyword / generic-tabular / social-listening
   - 5 skill blueprints in `.claude/skills/`: gwi · keyword · commerce · social-listening · pptx-narrative
4. **2× speedup** — switched primary model to `gemini-2.0-flash` (no thinking-mode overhead), parallel overview generation, sample size + card count tuned
5. **Forgiving JSON parser** — recovers 95% of cards when one is malformed
6. **`generateBriefOverview()`** — unified Executive Summary headline + audience snapshot for non-GWI paths

### 2026-05-17 — Insight Nuggets v2 rail (header)
1. **9-card 3×3 grid below banner**:
   - Row 1: Market Size · Commerce bet · Content bet (existing)
   - Row 2: ★ The Ask · 🔎 Search Pulse · 🛒 Shelf Pulse (data anchors)
   - Row 3: 🏆 Competition · 🎬 Cultural Cues · 🛡️ Trust Signals (framework signals)
2. **`lib/nuggets/synthesize.ts`** — deterministic Pareto / HHI / weighted YoY / brand SOV / bigram clustering, NEVER returns Gemini-template output
3. **Named-competitor brand-by-brand table** (Ghadi, Nirma, Rin, Wheel, Fena, Mr. White, Patanjali, Nise)
4. **Multi-source bucket-aware synthesis** — every uploaded file's signals reach the Strategic Read paragraph
5. **Source pills** synthesized at render time from `toolLabel + layer + lens + conviction`

### 2026-05-18 — Executive Summary panel
1. **OBJECTIVE column deleted** — was duplicate of breadcrumb + ★ The Ask card + banner
2. **Strategic Read paragraph** — Gemini-grounded ONE-paragraph synthesis replacing the bullet "Key Findings" list
3. **Anti-repetition (3 layers)**:
   - OPENER STYLE SEED — hash of `brand + objective + category` picks one of 4 archetypes (SCENE / NUMBER / TENSION / STANCE)
   - PHRASE BLOCKLIST in prompt + REPHRASE_MAP post-process
   - DETERMINISTIC FALLBACK — `synthesizeReadFallback()` builds a real paragraph from nuggets numbers when Gemini fails
4. **Cross-bucket multi-source rule** — paragraph cites ≥2 buckets when multiple sources present
5. **Bucket-diverse Next Moves** — top 3 actions span different buckets (creative + media + commerce, not 3 commerce)
6. **Cache versioning** — `STRATEGIC_READ_VERSION = 2` + `?regenerate=1` query param + "↻ Regenerate" button on hero banner

### Tier 1 PPT push (in flight today)
- A. Executive Summary slide
- B. Computed Stats Snapshot slide
- C. Speaker notes on every slide
- D. Cover enrichment

---

## Current rating per component

| Component | Rating | Honest gap |
|---|---|---|
| Analyzer pipeline | **9/10** | Helium 10 Black Box file with 10 ASINs is too small for full L9 coverage |
| Nuggets rail (9-card 3×3 grid) | **9/10** | Not verified on real GWI + Keyword + Amazon combined upload |
| Strategic Read paragraph | **9.5/10** | Multi-source rule untested in production |
| **PPT output** | **5/10** | Doesn't use any of the new Nuggets / Strategic Read / Audience Snapshot data |
| Next Moves | **9/10** | Bucket-diverse but still pulls Gemini-written `rec` text |
| **Frontend test coverage** | **3/10** | No automated regression tests for any of the above |

---

## Pending tasks to reach 10/10 across the board

### High priority (blocks final polish)
- [ ] **Real multi-source upload verification** — upload GWI + Keyword + Amazon + Social Listening together, confirm Strategic Read cites all 4
- [ ] **PPT Tier 2** — Add Competition / Cultural / Trust / Next Moves dedicated slides (after Tier 1 lands)
- [ ] **PPT Tier 3** — Narrative reorder (Cover → Exec Summary → Computed Stats → Competition → Themes → 9-Bucket Detail → Next Moves)
- [ ] **Generic-tabular path local repro** — never run end-to-end on real Amazon data; ship a test
- [ ] **Social-listening path local repro** — never tested

### Medium priority
- [ ] **PPT Visual polish — 3 small defects keeping Visual dimension at 7/10** (added 2026-05-18):
  - [ ] Slide 2 (Exec Summary): Next Moves numbers "01/02/03" stack vertically — `0` on one line, digit on next. Fix in `slideExecutiveSummary` — drop fontSize from 30pt or widen the counter box from 0.75in.
  - [ ] Slide 13 (Proportional bars): `%` wraps to new line after each percentage ("35\n%" instead of "35%"). Fix in `drawProportionalBars` — widen the % readout box from 0.45in to 0.65in.
  - [ ] Slide 3 (Stats Snapshot): "fabric condition" wraps awkwardly in Cultural Cue tile because of 16-char truncation. Increase to 22 chars OR pick a different theme from hoverLines.
- [ ] **PPT Methodology slide** — add a slide between Stats Snapshot and Agenda that defines what `conviction` means, what 8-Layer / 9-Layer / 3-Lens are, and how the numbers were computed. Currently the deck shows conviction badges without defining them.
- [ ] **8-Layer Keyword L4 (Competition × Cost quadrant)** — frequently returns 0 cards; reinforce prompt
- [ ] **Bigram cultural cues stopwords** — still occasionally surfaces fragments (verify on next live upload)
- [ ] **PRISM Fluo Helium10 Blueprint merge** — full reference doc at `references/helium10_blueprint.md`, user paused this thread
- [ ] **Mobile responsive pass** on Nuggets rail (3-col → 1-col already works; verify on real phone)
- [ ] **Token + Infra optimization discussion** — `docs/TOKEN-INFRA-OPTIMIZATION-PLAN.md` paused for 9:30 AM session; user said wake up. Not picked back up.

### Low priority (nice-to-haves)
- [ ] **Frontend regression tests** for Nuggets / Strategic Read / Next Moves rendering
- [ ] **Cache invalidation UI** — show "stale, refreshing" instead of silent regeneration
- [ ] **A/B test opener styles** for Strategic Read (which produces best client feedback?)
- [ ] **Decision Triggers / Anomalies & Outliers** (from the user's Key Questions Framework, currently shelved)
- [ ] **Source provenance footer** on insight cards (currently in source pills, could go inline)

### Always-on guards (already operational)
- [x] Anti-repetition phrase blocklist
- [x] Deterministic fallback for Gemini failures
- [x] Forgiving JSON parser
- [x] Cache version key for safe regenerations

---

## Open user questions / decisions

- **PPT Tier 2/3** — user committed to Tier 1 today; Tier 2/3 awaiting decision
- **Cache bust for old analyses** — currently auto-regenerate on next load when version mismatches
- **Helium10 Blueprint** — full reference doc to live at `.claude/skills/commerce-strategist/references/helium10_blueprint.md`; user hasn't pasted the content yet

---

## How this reminder works

A **durable cron job** (set up in this session, persisted to `.claude/scheduled_tasks.json`) pings the conversation twice daily — once around **10:13 AM local** and once around **5:47 PM local** — with a prompt that reads this file and surfaces the **High Priority** pending tasks in chat.

To stop the reminders: tell me **"stop the pending-tasks reminder"** and I'll call `CronDelete`.

To bump frequency or change times: tell me the new schedule (e.g. "remind me at 9am and 3pm") and I'll recreate the jobs.

To **add** a pending task to this list: tell me what to add and I'll edit the file (no code regeneration needed).

To **complete** a task: tell me which one. I'll move it to the timeline above.
