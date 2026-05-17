---
name: keyword-strategist
description: Use this skill when running analysis on Google Keyword Planner CSV exports (or any keyword-volume dataset) in the PRISM codebase. Applies the 8-Layer Keyword Methodology (Volume → Intent → Themes → Competition → Trend → Recommendations → Deep Intel → Senior Toolkit), with optional Phase 0 alphabet-soup discovery. Invoke whenever working on `lib/keywords/`, `parseKeywordCsvText`, `analyzeKeywordPlannerForPRISM`, `isKeywordPlannerShape`, the KEYWORD_PLANNER branch of `app/api/ai/analyze-data/route.ts`, or any code path that produces narrative/charts from a keyword export.
---

# Keyword Analysis — 8-Layer Methodology

Applies to any Google Keyword Planner CSV export. Optional Phase 0 (Discovery) precedes the analysis when starting from seeds without volume data.

## Phase 0 — Discovery (optional)

When user has seeds but no volume data. Uses alphabet-soup auto-suggest expansion across Google, YouTube, Bing, Amazon, App Store (reliable) + Play Store, Pinterest, TikTok (best-effort). Output feeds Google Keyword Planner for volume enrichment, then proceeds to Layers 1-8.

## Layers 1-8

| # | Layer | Outputs |
|---|---|---|
| 1 | Volume Landscape | Top keywords, volume buckets (Mega/High/Mid/Long-tail/Micro), Pareto concentration |
| 2 | Intent & Length | Tail split (short/mid/long), intent classification (Navigational > Transactional > Commercial > Informational > Generic), Length × Intent heatmap |
| 3 | Theme Clusters | Token-based multi-label clustering with volume + competition per theme |
| 4 | Competition × Cost | 5-quadrant matrix (Quick Wins / Battlegrounds / Easy Long-tail / Avoid / Unknown), scatter plot, premium-cost keywords |
| 5 | Trend & Seasonality | YoY winners/losers, 3-month momentum, 12-month curve, peak/trough months |
| 6 | Strategic Recommendations | Quick Wins (vol >1K, low/med comp, below-median bid), Rising Stars (YoY >50%), Brand Defense, Long-tail SEO targets |
| 7 | Deep Intelligence | 12 sub-analyses: Brand SOV, question mining, pack sizes, comparator pairs (X vs Y), price sensitivity, per-keyword seasonality, volatility, CPC efficiency, demand gap, n-grams, brand×intent matrix, competitor-steal |
| 8 | Senior Specialist Toolkit | Cannibalization (Jaccard ≥0.7 same-intent pairs), Winnability score (0.4×vol + 0.4×inv_comp + 0.2×bid_affordability), Pillar-cluster architecture, Match-type strategy (Broad/Phrase/Exact), Negative keyword candidates, Campaign & ad-group blueprint, Branded vs non-branded split with budget guidance, Funnel mapping (TOFU/MOFU/BOFU) with channel mix |

## Routing rules

- **CSV provided** → Path A (run Layers 1-8 on the data)
- **Seeds only** → Path B (run Phase 0 discovery first, then enrich via Keyword Planner, then Path A)
- **Both already prepared** → Path C (discovery output gets wired into the analysis as source-trace sheets)

## Skip conditions

| Condition | Skip |
|---|---|
| < 50 keywords | Layer 3 (themes) |
| < 6 months monthly data | Layer 5 seasonality + Layer 10 forecast |
| No brand tokens inferable | Layers 7.1, 7.11, 7.12 |
| No bid columns | Layer 7.8, 8.7 budget detail |
| Organic share empty (typical) | Layer 7.9 (note needs SEMrush/GSC) |

## Output expectations

- Excel workbook with sheet-per-layer + dashboard summary
- PowerPoint deck with charts and source captions
- Methodology sheet documenting all thresholds and skipped layers
- Every number traces to a source row — zero hallucination, zero invented benchmarks

## Hand-off to other Prism Fluo modules

This methodology produces structured outputs that feed:
- Content strategy modules (Layer 6 long-tail SEO + Layer 8.3 pillar-cluster)
- PPC campaign modules (Layer 8.4 match types + Layer 8.6 campaign blueprint)
- Brand intelligence modules (Layer 7.1 SOV + Layer 8.7 branded split)
- Competitive intelligence modules (Layer 7.4 comparators + Layer 7.12 competitor-steal)

## Code surface area

When invoked, the rules above govern:

| File | Function | What |
|---|---|---|
| `lib/ai/gemini.ts` | `analyzeKeywordPlannerForPRISM` | 8-layer prompt construction + bucket mapping |
| `lib/ai/gemini.ts` | `isKeywordPlannerShape` | Column-shape detection (Keyword + Avg. monthly searches) |
| `app/api/ai/analyze-data/route.ts` | KEYWORD_PLANNER branch | Routes to keyword analyzer before generic-tabular |
| `lib/keywords/parser.ts` | `parseKeywordCsvText` | Google Keyword Planner UTF-16 TAB CSV parser |
| `lib/keywords/detector.ts` | `isGoogleKeywordPlanCsv` | Identifies Keyword Planner CSVs at upload |

## When NOT to apply this skill

- GWI data — use the `gwi-insight-strategist` skill instead.
- Social listening data — uses `analyzeSocialListeningForPRISM`.
- Amazon / Helium10 / generic tabular — uses `analyzeGenericTabularForPRISM`.
