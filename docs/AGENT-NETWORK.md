# PRISM Agent Network — End-User Guide

Plain-language documentation of every agent council that runs behind PRISM,
when each fires, and what users actually see.

> **TL;DR:** PRISM has **4 councils, 12 agents** working in concert. They run
> automatically on every upload, analysis, and export. You see their work as:
> a 🗜 compression badge in the upload log, a 🔍 verification check on every
> brief, a ● LIVE chip on the Market Size card, and a stale-brief banner when
> you edit brief inputs.

---

## The 4 councils at a glance

| # | Council | When it runs | What it does | Where you see it |
|---|---|---|---|---|
| 🗜 | **Mapper** | On every upload | Compresses + verifies file integrity | Upload log + `/admin/mapper-history` |
| 🩺 | **AI Health** | Continuously | Quarantines failing models, routes around outages | `/admin/ai-health` |
| 🔍 | **Verification** | On every brief generation | 5 agents fact-check the insights | Verified badge on `/insights` + `/admin/verification-history` |
| 📤 | **Export Gatekeeper** | On every PPT/Excel/PDF download | Inspects byte streams before download | `/admin/export-history` |

All councils are visible together at **[`/admin/agents`](/admin/agents)** with
a live system grade.

---

## 🗜 Mapper Council (3 server agents + 2 browser agents)

**The job:** make sure every uploaded file is parseable, compressed if
needed, and contains the text PRISM's analyzers need.

**The agents:**
- **Client-Compressor** (browser) — shrinks PDFs/PPTX/XLSX/CSV *before* upload
- **Client-QA** (browser) — verifies the compressed file still has the right
  page/slide/sheet count; falls back to original if not
- **Server-Compressor** — second-pass compression after upload
- **Mapper-QA** — re-extracts text via pdf-parse, checks ≥98% match vs original
- **Senior-Audit** — file integrity check for small files (<10 MB)

**What you see when uploading:**

```
✅ Selected brief: AI White Paper
📤 Uploading "deck.pdf"…
🗜 Client council passed (10/10): 25 MB → 8 MB (−68%, saved 17 MB before upload)
📦 Streaming "deck.pdf" (8 MB) directly to Blob storage…
🗜 Council compressed by 0.2 MB (grade 10/10)
✅ Done
```

If the source file is image-dense and lossless compression won't help, you'll
see honest messaging instead:

```
⚠ This 25 MB file is already well-optimized — lossless compression won't help.
💡 For a 60–80% smaller upload, use /compress (Ghostscript-backed image re-encoding).
```

**If the council finds a problem** (scanned PDF, image-only, corrupted file)
it logs a warning but **never blocks the upload**. The original file proceeds.

---

## 🩺 AI Health Council (2 agents)

**The job:** keep PRISM's AI calls (Gemini, OpenRouter) working even when
individual models fail.

**The agents:**
- **Model-Health** — tracks per-model success rate in a rolling 5-minute
  window, quarantines anything that crosses a failure threshold
- **Fallback-Monitor** — logs every fallback event with severity, triggers
  alerts when a model class goes fully down

**What you see:**
- Nothing, when everything works (which is most of the time)
- On `/admin/ai-health`: live model status table + 24h fallback summary
- On `/admin/openrouter-probe`: 5-step OpenRouter diagnostic if there's a key issue

**Auto-recovery in action:**
- Model returns HTTP 429 → quarantined for 60s, traffic routes to next model
- Quarantine expires → small probe request; if successful, model rejoins rotation
- All models down → alert logged with severity 'all-models-down'

---

## 🔍 Verification Council (5 agents)

**The job:** sanity-check every insight before it ships to a brief. Catch
hallucinations, bad math, missing methodology coverage.

**The agents:**
- **ProofReader** — text quality, brand-stem consistency, prose hygiene
- **StatChecker** — numbers in obs/stat/rec match each other + the chart data
- **FactAnalyzer** — claims have visible evidence in the source data
- **MathIntegrity** — TAM/funnel math re-derived from brief; catches the
  "84M audience" class of bug (where deriving market size went wrong by 2×)
- **Coverage** — checks methodology metrics from the Fluo Research Framework
  blueprint are addressed

**What you see:**

On every analysis page, a "Verified" badge appears once the council has run.
Findings (with severity Blocker / Major / Minor) appear next to affected cards.

The full activity log is at `/admin/verification-history`:
- Lifetime totals (analyses verified · findings caught · by severity)
- Per-agent breakdown (which agent caught what)
- Coverage gaps by methodology section
- 30-day daily trend
- Last 50 verification runs with filter (clean / review / block)

**Cross-talk with Mapper:**

If Mapper flagged the source as thin/scanned/image-only, the Verification
Council **softens FactAnalyzer + Coverage severities by one tier** (blocker
→ major, major → minor). The AI doesn't get blamed for thin source files.
Math/Stat/Proofreader findings stay at full severity — those are AI errors
regardless of source quality.

---

## 📤 Export Gatekeeper (2 agents)

**The job:** make sure every PDF / Excel download is structurally valid and
its content matches the analysis it was generated from.

**The agents:**
- **PDF-Inspector** — verifies page count, expected sections, text extraction
- **Excel-Inspector** — verifies sheet count, expected columns, data integrity

**What you see:**
- On a clean export: you just get the download
- On a blocker: a modal stops the download with the issue + a "Try again"
  button (auto-recovery may re-trigger analysis regenerate)
- On `/admin/export-history`: every export logged with action (allow / ask /
  block), confidence score, byte size, reasoning

---

## How councils communicate (cross-talk)

```
                ┌──────────────────────────────────────┐
                │ UPLOAD                               │
   user file ─→ │ Mapper Council                       │ ─→ writes
                │ compress + verify + grade            │    uploads.mapper_verdict
                └──────────────┬───────────────────────┘
                               ▼
                ┌──────────────────────────────────────┐
                │ ANALYZE                              │
                │ Gemini (via AI Health Cascade) ←─────┼──→ Health Council
                │                                      │    quarantines bad models
                └──────────────┬───────────────────────┘
                               ▼
                ┌──────────────────────────────────────┐
                │ VERIFY                               │
                │ Verification Council reads ◄─────────┼──── (uploads.mapper_verdict)
                │ Mapper verdict → softens severity    │
                │ on FactAnalyzer + Coverage findings  │
                │ when source was thin/scanned         │
                └──────────────┬───────────────────────┘
                               ▼
                ┌──────────────────────────────────────┐
                │ EXPORT                               │
                │ Gatekeeper inspects → allow/ask/block│
                └──────────────────────────────────────┘
```

---

## Proactive-solve rule (applies to every agent)

From `AGENTS.md`:

> When a critical issue surfaces, every council must **auto-resolve recoverable
> failures** (retry / fallback / quarantine / alternate-route) before
> surfacing the issue to the user.

Each council declares which auto-recovery strategies it owns:

| Council | retry | fallback | quarantine | alternate-route |
|---|:---:|:---:|:---:|:---:|
| Mapper | ✅ | ✅ | | ✅ (CloudConvert when Vercel Blob blocked) |
| Verification | ✅ | ✅ | | |
| AI Health | ✅ | ✅ | ✅ | ✅ (Gemini ↔ OpenRouter ↔ local) |
| Export | ✅ | ✅ | | |

You can see these as green badges on each council card at `/admin/agents`.

---

## Adding a new council

PRISM uses a registry pattern — adding a 5th council is a **single-file change**:

1. Create `lib/agents/councils/<your-id>.ts` (~30 LOC) following the
   `CouncilDescriptor` shape
2. Add one import line in `lib/agents/councils/index.ts`
3. The new council appears automatically on `/admin/agents`, in the
   lifecycle diagram, and in the system-grade composite

See `lib/agents/councils/mapper.ts` or `verification.ts` as references.

---

## What's NOT yet automated (parked in docs/PENDING-DECISIONS.md)

- **PRISM Insight Classifier (Mode B audit)** — bulk re-classification of
  existing analyses against the 9-bucket spec. Foundation shipped; audit mode
  deferred.
- **Per-user CloudConvert quota** — defer until 10+ active users
- **Mobile-responsive admin pages** — defer (admin uses desktop)

---

## Where to look when something looks wrong

| Symptom | First place to check |
|---|---|
| Upload stuck for >60s | `/admin/mapper-history` — was the file blocked or council timeout? |
| AI returning errors | `/admin/ai-health` — any models quarantined? |
| Insight numbers look off | `/admin/verification-history` — find the analysis, see what the council flagged |
| Export refused to download | `/admin/export-history` — find the entry, read the `reasoning` column |
| Everything generally | `/admin/agents` — single dashboard, system grade tells you the state |
