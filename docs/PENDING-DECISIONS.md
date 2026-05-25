# Pending decisions

Tracking decisions the user wants to come back to. Future Claude sessions:
read this at the start of any agent/insight-related work.

---

## 🚧 Live Google Trends panel (HIDDEN on dashboard)

**Status:** Hidden behind `false /* SHOW_TRENDS_PANEL */` in app/dashboard/page.js.
**Reason:** Data wasn't grounded — surfaced "indicative trend · live data syncing"
  language without a verified Trends API. Pulled until we wire a real source.
**To re-enable:** Flip the constant to `true`. Component code in
  `components/TrendPanel.jsx` is untouched and still works.
**To do before re-enabling:**
  • Wire a real Trends data source (options: paid Google Trends API,
    Glimpse, in-house cache via scheduled puppeteer, or third-party
    enrichment SaaS)
  • Make the "Indicative trend" copy match the actual source's freshness
  • Add a verified-source badge so users know where the numbers come from
  • Re-add tests for the rendered panel state

---

## 🏷 PRISM Insight Classifier (9-bucket spec)

**Status:** Spec written, feasibility assessed, NOT implemented.
**Last touched:** 2026-05-24
**Owner:** rahul

### The ask
User provided a "PRISM Insight Classifier" prompt that tags every insight by
its **measured variable** (not its narrative framing) into exactly one of 9
buckets: content / commerce / communication / culture / channel / media /
creative / pricing / search. With explicit tiebreaker rules and Mode A
(classify new) + Mode B (audit existing).

### Why it matters
Current PRISM does **domain-blanket tagging** via `lib/insights/buckets.js
DOMAIN_TO_BUCKET` (all GWI → culture, all keyword → commerce). The spec is
**variable-based** — so "accounts followed" is media even if it came from
GWI, and "search volume" is search even if it came from keyword data. Implementing
this would re-bucket a non-trivial portion of existing analyses.

### Options on the table (cheapest → most ambitious)

| # | Approach | Effort | Effect |
|---|---|---|---|
| 1 | Enhance existing Gemini prompts with the 9-bucket decision tree | ~2 hrs | New cards self-classify correctly; no audit infra |
| 2 | Deterministic JS rules engine, no LLM | ~3 hrs | Zero LLM cost; rigid but predictable |
| 3 | Fix only the 2 contradiction hotspots (gemini.ts:1688-1694 + DOMAIN_TO_BUCKET) | ~3 hrs | ~70% of current mistagging cleaned up |
| 4 | Doc-only (`/admin/classification-guide` rubric for manual review) | 30 min | Zero code, manual scaling |
| 5 | Full classifier agent (6th in verification council) + Mode B audit UI + apply-deltas + cross-ref rendering | ~21 hrs | Spec implemented in full |

### Claude's recommendation when this resumes
Ship **Option 1 + Option 3 together (~4 hrs total)**. Skip the audit infra
until 1+3 have shipped and any remaining gaps are concrete.

### Decision blockers
Need user to confirm:
1. OK with directional re-bucketing of historical analyses?
2. Classifier auto-applies for High confidence or always requires human approve?
3. Run at analyze-time, on-demand, or both?

### Where to start next session
- Read the spec at the top of this file's git history under commit message
  "PRISM Insight Classification & Re-Verification Prompt" (user pasted it
  in chat 2026-05-24).
- Touch points: `lib/ai/gemini.ts:285-308` (bucket types), `lib/ai/gemini.ts:1688-1694`
  (hardcoded Keyword bucket rules), `lib/insights/buckets.js:57-71`
  (DOMAIN_TO_BUCKET fallback), `lib/ai/verify/orchestrator.ts` (where a
  6th classifier agent would plug in if going with Option 5).
