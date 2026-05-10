# PRISM Intelligence — Complete Learning & Reference Document

> **Purpose:** Permanent reference for all analysis logic, AI prompts, architecture decisions, and rules built into PRISM. Read this before touching any analysis code. Updated: May 2026.

---

## Table of Contents

1. [Platform Overview](#1-platform-overview)
2. [The Four PRISM Buckets](#2-the-four-prism-buckets)
3. [3-Tier AI Cascade Architecture](#3-3-tier-ai-cascade-architecture)
4. [GWI Data Pipeline (Primary Path)](#4-gwi-data-pipeline-primary-path)
5. [Gemini Prompts & Rules (Verbatim)](#5-gemini-prompts--rules-verbatim)
6. [Insight Title Patterns (A–F)](#6-insight-title-patterns-af)
7. [Auto-Analysis Fallback Logic (Conviction 70)](#7-auto-analysis-fallback-logic-conviction-70)
8. [Generic Tabular & Social Listening Paths](#8-generic-tabular--social-listening-paths)
9. [Rule-Based Inference Engine (lib/inference.ts)](#9-rule-based-inference-engine-libinferencets)
10. [OpenRouter Fallback (Conviction 82)](#10-openrouter-fallback-conviction-82)
11. [SLA Formula & Badge Logic](#11-sla-formula--badge-logic)
12. [Architecture Decisions & Why](#12-architecture-decisions--why)
13. [Key Files Map](#13-key-files-map)
14. [Conviction Score System](#14-conviction-score-system)
15. [Investor Demo Rules](#15-investor-demo-rules)

---

## 1. Platform Overview

PRISM is a **consumer intelligence platform** built for brand managers and media planners in India. Users upload data (GWI surveys, Amazon, Helium10, social listening, sales, keyword planner) and PRISM generates 8 McKinsey-quality insight cards — 2 per PRISM bucket.

**User workflow:**
1. Submit brief (brand, category, objective)
2. Upload data file(s) via `/upload`
3. System detects data type, routes to correct pipeline
4. Gemini writes narrative cards from pre-computed slot data
5. Cards displayed at `/insights?id=...`

**Core principle:** PRISM never invents numbers. Gemini is only allowed to translate numbers from the data into human language — every stat must come from the slot.

---

## 2. The Four PRISM Buckets

Every insight card is assigned to one of four buckets. They appear as tabs on the insights page.

| Bucket | Icon | What it covers |
|--------|------|----------------|
| **Content** | 📝 | What people watch/read/play, formats, devices, screen behaviour, OTT, streaming |
| **Commerce** | 🛒 | Purchase behaviour, shopping, pricing, brand preference, retailers, e-commerce, BSR |
| **Communication** | 📢 | How brands show up: ads, campaigns, discovery, social media, brand voice, earned media |
| **Culture** | 🌍 | Who the audience is: demographics, lifestyle, values, identity, family, employment |

### Bucket Assignment — Three-tier Priority

**Tier 1: Hard-coded chart ID rules** (highest priority, always wins):
```
gwi_index_heatmap   → culture
keyword_tiers       → commerce
brand_share         → commerce
corr_scatter        → communication
bubble_3way         → culture
radar_bench         → culture
cross_cat           → commerce
time_*              → even index → content, odd index → communication
cat_*               → rotates: commerce → culture → content
```

**Tier 2: Text keyword scoring** (title + obs + labels scored against 4 regex patterns):
```
commerce:      /sale|revenue|order|transact|purchas|price|cost|profit|margin|keyword|search.?volume|bid|cpc|tier|sku|inventory|stock|e.?commerce|brand.?search/
communication: /campaign|click|impression|ctr|reach|engagement|follow|mention|sentiment|social.?media|ad.?spend|reel|story|post|broadcast|pr\b/
culture:       /culture|lifestyle|trend|interest|leisure|activit|consumer|index|gwi|survey|demograph|audience|behav|psychograph|cohort|gen.?z|millennial/
content:       /content|media|video|article|blog|view|watch|read|page|format|channel|creat/
```

**Tier 3: Chart-type semantic fallback** (when no keywords match):
```
pie / bar / hbar  → commerce
line / area       → content
scatter           → communication
bubble / radar    → culture
```

### Question → Bucket (GWI path)
The `questionBucket()` function assigns buckets by matching the GWI question text:
```
device|owned media|content format|streaming|screen time    → content
paid media|advert|discover|brand relation|advocacy|earned  → communication
purchase|buy|shop|price|retailer|sale|eco|product research → commerce
employ|household|children|vehicle|living arrangement|pet   → culture
default                                                     → content
```

---

## 3. 3-Tier AI Cascade Architecture

Every analysis request goes through three tiers. The system tries Tier 1, falls through to Tier 2 on failure, then Tier 3:

```
POST /api/ai/analyze-data
         │
         ├── GWI path (slots.length > 0) ──────────────────────────────────┐
         │                                                                   │
         │   TIER 1: Gemini 2.5 (Primary)                                   │
         │     Models: 2.0-flash-lite → 2.5-flash-preview → 2.5-pro        │
         │     3 parallel batches of 6 slots, 30s hard timeout each         │
         │     Conviction: 90  |  toolLabel: "GWI"                          │
         │            ↓ all batches fail                                     │
         │   TIER 2: OpenRouter (7-model cascade, batches of 8, seq.)       │
         │     Conviction: 82  |  toolLabel: "GWI · OpenRouter"             │
         │            ↓ all OpenRouter models fail                           │
         │   TIER 3: Auto-Analysis (no AI, pure slot data)                  │
         │     Conviction: 70  |  toolLabel: "GWI · Auto-Analysis"          │
         │     Never hallucinates — every sentence template-matched          │
         │            ↓ no index scores in data → 422 error                 │
         │                                                                   │
         └── Generic tabular / Social Listening path ──────────────────────┘
                  │
                  │   TIER 1: Gemini (40s timeout)
                  │     analyzeGenericTabularForPRISM or analyzeSocialListeningForPRISM
                  │     Conviction: 88
                  │            ↓ Gemini fails
                  │   TIER 2: OpenRouter (same 7-model cascade)
                  │     Uses buildInsightSlots(rows) as slot input
                  │     Conviction: 82
                  │            ↓ OpenRouter fails
                  │   TIER 3: Auto-Analysis (generic tabular only)
                  │     generateFallbackCards(genericSlots)
                  │     Works when data has Index-like columns
                  │     Conviction: 70
                  │            ↓ no slots → 502 / 422 error
```

**Critical Vercel constraint:** maxDuration = 60s. If Gemini hangs past 30s, the entire function is killed at 60s before fallback code runs. The `withTimeout()` wrapper solves this by racing each batch against a 30s deadline.

```typescript
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms/1000}s`)), ms)
    ),
  ]);
}
```

---

## 4. GWI Data Pipeline (Primary Path)

### Step 1: GWI Sheet Detection (`lib/gwi.ts`)

Detected when ALL of these conditions are true:
- Headers contain `Audience %` (at least 2 occurrences)
- Headers contain `Data point %`
- Headers contain `Universe`
- Headers contain `Index`
- Headers contain `Responses`
- Headers contain `Short Label`
- Headers contain `Attributes`
- First 10 rows contain `source: gwi` OR `time spent on social media`

### Step 2: Build Insight Slots (`buildInsightSlots`)

1. **Group by question** — uses column aliases: `Short Label Question`, `Question`, `question`, `time_bucket`, `Category`, `Sheet`

2. **Per-group processing:**
   - Parse rows extracting: `attr`, `audiencePct`, `dataPct`, `index`, `universe`
   - Filter: only rows where `attr` is non-empty AND `index > 0`
   - Sort by Index descending (highest signal first)
   - Keep top 10 rows per slot

3. **Bucket guarantee** — ensure at least 2 slots per bucket:
   ```
   For each of [content, commerce, communication, culture]:
     Take top 2 by maxIndex from that bucket
   Then append remaining slots sorted by maxIndex
   Cap total at 20 slots
   ```

4. **Chart suggestion per slot** — semantic + data-shape logic:

   | Condition | Chart Type |
   |-----------|-----------|
   | `purchase/funnel/convert` in question AND ≤8 rows | `funnel` |
   | `week/month/quarter/trend/growth` in question | `area` |
   | `attitude/value/lifestyle/profile` AND 3–8 rows | `radar` |
   | `revenue/spend/budget/breakdown/bridge` AND 3–10 rows | `waterfall` |
   | `distribut/frequenc/range/bracket` AND ≥4 rows | `histogram` |
   | ≤3 rows | `pie` |
   | ≤5 rows | `doughnut` |
   | ≥4 rows have audiencePct > 0 AND index > 80 | `scatter` |
   | ≤7 rows | `bar` |
   | default (large set, long labels) | `hbar` |

### Step 3: Batch and Send to Gemini

- Max 18 slots (first 18 of up to 20)
- Batch size: 6 slots → 3 parallel Gemini calls
- Each batch: 30s hard timeout via `withTimeout()`
- `Promise.allSettled()` collects results — failed batches log a warning, don't crash

### Step 4: Fallback Chain

```
insights.length === 0 (all Gemini batches failed)
  → Try OpenRouter with ALL slots
  → If OpenRouter fails → generateFallbackCards(slots)
  → If no slots (no index scores) → 422 error
```

---

## 5. Gemini Prompts & Rules (Verbatim)

### 5.1 GWI Slot Analysis Prompt (`analyzeDataForPRISM`)

The persona: *"You are a brilliant Creative Strategist and Media Planner at PRISM, a top consumer intelligence firm in India."*

**Slot format sent to Gemini:**
```
SLOT N | PRISM Bucket: CULTURE | Topic: Purchase Behaviour
Suggested chart: hbar
DATA (use ONLY these numbers — no other sources, no estimates):
    • Full Price: 48.6% of this audience have this — that is 1.68× the national average, approximately 12.4 million people in India
    • Sale Price: 38.1% of this audience have this — that is 1.41× the national average...
```

**Anti-hallucination rule (verbatim):**
> Every single number, percentage, or statistic in your observation MUST come directly from the slot data above. Do NOT invent, guess, round differently, or add any number that is not in the slot. If a slot says "3.45× the national average", you can write "about 3 and a half times more likely". If a slot says "21.8% of this audience", you can write "roughly 1 in 5 people".

**Tone rules (verbatim):**
> Write like a brilliant colleague explaining a finding over coffee — not a consultant writing a deck.
> - A 16-year-old and a CMO should both find every card interesting and easy to read
> - Short sentences. Active voice. Plain English.
> - **Banned words:** over-index, leverage, cohort, synergy, touchpoint, whitespace, holistic, robust, utilize, paradigm, seamless
> - **Use:** people, families, buyers, young Indians, 1 in 3, nearly twice, here is the thing, think about this

**Title format (verbatim):**
> Write like a great magazine cover line. Lead with the surprising finding. Include one plain-English number.
> ✅ "Almost Half of Urban Indian Families Still Prefer Buying at a Local Store"
> ✅ "India's Full-Price Shoppers Are Nearly Twice as Common as Brands Think"
> ❌ "Consumers Over-Index on Full Price vs Sale Purchase Behaviour"

**Observation structure (verbatim):**
> - Sentence 1: Start with a punchy surprising fact drawn directly from the highest-index item in THIS slot.
> - Sentence 2: Give the exact numbers in plain English — reference the specific attributes, percentages, and multipliers from THIS slot.
> - Sentence 3: State the strategic so-what for a brand or media team in one clear, direct sentence.

**Recommendation format (verbatim):**
> One sentence written as a direct brief to a creative director or media buyer. Name a specific Indian platform or channel (YouTube, Instagram Reels, Hotstar, JioCinema, Meesho, Flipkart, etc.). Name a specific format (6-second bumper, 15-second Reel, CTV pre-roll, in-feed video, search ad, etc.). Name a specific creative angle (real Indian homes, confident buyers, family moments, aspiration, utility).

**Chart variety mandate (verbatim):**
> Across all N cards you MUST use at least 4 DIFFERENT chart types. NEVER assign the same type to more than 2 consecutive cards. If your current card would create a third repetition in a row, override with a different type. Distribution target: use hbar/bar for at most 3 cards total — fill remaining cards with area, doughnut, scatter, radar, funnel, waterfall, or combo wherever data supports it.

**Stat format (verbatim):**
> One crisp number that would make a room go quiet. Derived strictly from THIS slot's data.
> ✅ "Nearly 2 in 3 Indian households in this group prefer local stores over big chains"
> ❌ "Index 168 · Full Price behaviour" (never write Index numbers raw)

**Uniqueness rule (verbatim):**
> Card 1 → SLOT 1 only. Card 2 → SLOT 2 only. Do NOT mix findings from different slots. Do NOT repeat the same finding, stat, or sentence across any two cards.

### 5.2 Generic Tabular Prompt (`analyzeGenericTabularForPRISM`)

Additional tone constraint for non-GWI data (Amazon, Helium10, sales, marketing):

> **NEVER use stock-market or finance language:** tailspin, momentum, volatility, breakout, multiplier, dominance alert, market moat, volume-capture, growth risk, critical warning, capitalise.
> **Write like a smart magazine editor or strategy planner.**

Bucket definitions for non-GWI:
- `content` — what people watch/read/play, formats, devices, listings, titles, descriptions
- `commerce` — purchase, price, ranking (BSR), sales rank, units, sellers, conversion
- `communication` — how brands show up: ads, search visibility, reviews, ratings, social signals
- `culture` — who the audience is, lifestyle, values, region, demographics

Chart variety: MUST use ≥5 different chart types. NEVER hbar/bar for more than 3 cards.

### 5.3 Social Listening Prompt (`analyzeSocialListeningForPRISM`)

Data blocks sent to Gemini (pre-aggregated, not raw posts):
- Sentiment breakdown (Positive/Negative/Neutral counts + %)
- Platform distribution (platform name + post count + %)
- Sentiment × Platform cross-tab
- Top Themes (all posts, positive, negative)
- Top Posts by reach (with follower count + message excerpt)
- Volume Over Time

Chart mapping for social data:
| Data type | Suggested chart |
|-----------|----------------|
| Sentiment breakdown | `doughnut` |
| Platform distribution | `bar` or `hbar` |
| Top themes | `hbar` |
| Volume over time | `area` |
| Sentiment × Platform | `combo` |
| Funnel signals | `funnel` |
| Month-on-month swings | `waterfall` |
| Multi-platform comparison | `radar` |

### 5.4 Executive Summary (`generateExecutiveSummary`)

SMART framework — four mandatory sections:
1. **HEADLINE** — 8–12 words, PPT-title ready, must hint at a metric or business result
2. **OBJECTIVE** — 1–2 sentences, the main business goal inferred from the data
3. **OBSERVATIONS** — 3–6 items, each with a concrete metric (+15%, 2x, etc.)
4. **RECOMMENDATIONS** — 3–5 items, each: action + where + target/goal + timeframe

### 5.5 PDF / Free-Text Analysis (`analyzeTextForPRISM`)

- Truncates to 12,000 chars
- Writes 8 cards from document text, 2 per bucket
- Every number MUST come from the document
- If no numeric data for a card: still write obs/stat/rec in plain English, chartLabels: []

---

## 6. Insight Title Patterns (A–F)

Used in `enhanceInsightTitles()` — Gemini selects the BEST pattern for each insight based on the data nature:

| Pattern | When to use | Structure |
|---------|-------------|-----------|
| **A — HOOK FIRST** | Behaviour is surprising or counterintuitive | `[Surprising behavior] — [Who + What], [Stat]` |
| **B — STAT FIRST** | The number itself is the most shocking element | `[Stat]: [Why humans do this] — [Brand implication]` |
| **C — HUMAN FIRST** | Emotion or fear is the real driver | `[Human emotion/behavior] drives [Main insight] — [Stat] [Context]` |
| **D — TENSION** | Data contradicts what brands currently believe | `[Old assumption] is wrong — [New reality], [Stat] [Who]` |
| **E — QUESTION** | Finding raises an obvious "but why?" | `Why [Human behavior]? [Answer] — [Stat] in [Context]` |
| **F — CONSEQUENCE** | Stat signals a trend demanding brand action NOW | `[Stat] [Who] now [behavior] — [Brand] must [implication]` |

**Signal words that trigger each pattern:**
- Pattern A: "despite", "instead of", "rather than", "avoiding", "ignoring"
- Pattern B: very large %, a multiple (3×, 10×), or a shocking rank
- Pattern C: "fear", "trust", "prefer", "choose", "avoid", "worry"
- Pattern D: gap between brand behaviour and consumer behaviour
- Pattern E: an unexplained pattern that needs a cause
- Pattern F: rapid growth, first-time behaviour, competitive window closing

**Universal rules:**
- Max 18 words
- Always embed the real stat from the observation
- Active voice — people do things
- Human behaviour verbs: search, scroll, skip, switch, fear, trust, choose, avoid, discover
- Sound like Bloomberg or The Economist
- **No jargon:** ban over-index, leverage, cohort, synergy, touchpoint, utilise, significant, notable

---

## 7. Auto-Analysis Fallback Logic (Conviction 70)

When all AI fails, `generateFallbackCards()` builds insight cards deterministically from slot data. Every sentence is grounded in actual numbers — zero hallucination risk. Runs for both GWI and generic tabular paths (Tier 3 in both cascades).

---

### Bucket Assignment — `questionBucket()`

Each question / sheet name is regex-matched to a bucket:

| Bucket | Keywords that trigger it |
|--------|--------------------------|
| **Content** | device, owned media, content format, streaming, screen time |
| **Communication** | paid media, advert, discover, brand relation, advocacy, earned media, brand qual, brand action, word-of-mouth |
| **Commerce** | purchase, buy, shop, price, retailer, sale, eco, product research, income, mortgage, grocery, familiarity, purchase driver, in-store, online brand |
| **Culture** | employ, household, children, vehicle, living arrangement, pet, lifestyle, family, grandchild, age of child, properties owned, number of children |
| **Default** | content |

---

### S3 Strategic So-What — per bucket

The third sentence of every auto-analysis observation. Exact copy used in production:

| Bucket | Line |
|--------|------|
| **Content** | "For brands in this space, reflecting this behaviour in content strategy — not just targeting — will deliver meaningfully stronger engagement with this group." |
| **Commerce** | "Messaging that acknowledges how this audience actually makes purchase decisions will consistently outperform generic category creative." |
| **Communication** | "Media spend aligned to the platforms and formats this audience actively uses will deliver higher earned attention and more efficient CPMs." |
| **Culture** | "Campaigns that genuinely connect with these cultural values will feel authentic to this group — and they have a sharp radar for brands that do it well vs. brands that appropriate." |

---

### Number Translation Functions

**`pctToWords(pct)`** — Audience % to plain English:

| Threshold | Output |
|-----------|--------|
| ≥80% | "more than 4 in 5" |
| ≥70% | "about 7 in 10" |
| ≥60% | "more than 3 in 5" |
| ≥55% | "more than half" |
| ≥48% | "nearly 1 in 2" |
| ≥40% | "about 2 in 5" |
| ≥33% | "about 1 in 3" |
| ≥25% | "about 1 in 4" |
| ≥20% | "about 1 in 5" |
| ≥16% | "roughly 1 in 6" |
| ≥13% | "roughly 1 in 7" |
| ≥10% | "about 1 in 10" |
| else | `${pct.toFixed(0)}%` |

**`indexToWords(index)`** — GWI Index to plain English multiplier:

| Index | Output |
|-------|--------|
| ≥400 | "nearly N times more likely than" |
| ≥300 | "more than three times as likely as" |
| ≥250 | "more than twice as likely as" |
| ≥200 | "twice as likely as" |
| ≥175 | "nearly twice as likely as" |
| ≥150 | "one and a half times more likely than" |
| ≥130 | "about N% more likely than" |
| ≥110 | "around N% more likely than" |
| else | "slightly more likely than" |

---

### Attribute Text Cleaning (`cleanAttrText`)

Strips GWI attribute boilerplate into natural English:

| Input pattern | Transformed to |
|---------------|----------------|
| `", (Important to me)"` etc. | removed |
| `"^I am "` prefix | removed — `"I am using social media less"` → `"using social media less"` |
| `"^I "` prefix | removed — `"I prefer local stores"` → `"prefer local stores"` |
| `"^My "` prefix | removed — `"My income"` → `"income"` |
| `"^Other "` prefix | removed |
| `" than I used to"` suffix | → `" than before"` |

---

### Title Building (`buildTitle`)

Three patterns based on the leading structure of the attribute text:

**Pattern 1 — Verb/Behaviour** (attr starts with "I am" or action verb: using / watching / buying / prefer / trust / worry…):
```
With pct:    "${pct}% of This Audience Are ${clean} — a Signal Worth Building Into the Brief"
Without pct: "A Key Segment of This Audience Is ${clean} — Stronger Than the National Average Suggests"
```

**Pattern 2 — Persona** (title-case, ≤3 words, e.g. "Young Parent", "Social Media Scroller"):
```
With pct:    "${attr}s Make Up ${pct}% of This Audience — Disproportionately High vs the National Average"
Without pct: "${attr}s Are More Prevalent in This Audience Than Brands Typically Assume"
```

**Pattern 3 — Topic/Interest** (everything else):
```
With pct:    "${pct}% of This Audience Prioritise ${clean} — ${mult}× the National Average"
Without pct: "${clean} Is ${mult}× More Common Here Than in the General Indian Population"
```

---

### Observation Building

**S1 (`buildS1`)** — Opening punchy fact, highest-index attribute:
```
Verb + pct + fraction:
"${pct}% of this audience — ${fraction} — are ${clean}, a rate ${mult}× the national average and a clear indicator of where this group's attention is heading."

Verb + fraction only:
"${cap(fraction)} of this audience are ${clean} — ${mult}× the national average, and a pattern that runs consistently across this group."

Topic + pct + fraction:
"${pct}% of this audience — ${fraction} — prioritise ${clean}, placing this group ${mult}× the national average and making it one of the strongest signals in this dataset."

Topic + fraction only:
"${cap(fraction)} of this audience lean strongly towards ${clean} — ${mult}× the national average, and a signal that holds up across multiple data cuts."
```

**S2 (`buildS2`)** — Second attribute (must be different from S1), confirms the pattern:
```
Verb + pct2:
"The same audience also shows a strong lean towards ${clean2}: ${pct2}% exhibit this behaviour (${mult2}×), reinforcing a consistent picture of how this group thinks and acts."

Topic + pct2:
"${cap(clean2)} is the next strongest signal at ${pct2}% (${mult2}×) — confirming this is a consistent audience orientation, not a one-off finding."

Same attribute (edge case):
"This pattern holds consistently across multiple attributes in this category, suggesting a deliberate audience orientation rather than an isolated data point."
```

**S3** — Strategic so-what (see S3 table above, bucket-specific fixed copy).

---

### Recommendation Building — `buildRec()`

**Step 1:** Checks attribute text for specific signals. If matched, overrides the bucket default:

| Signal in attribute text | Platform + Format |
|--------------------------|-------------------|
| `stream\|ott\|netflix\|hotstar\|prime\|jiocinema\|zee5` | "Shift 60–65% of video budget to JioCinema and Hotstar pre-rolls — this audience spends a disproportionate amount of screen time inside these apps…" |
| `social media\|using.*less\|spend.*time.*social\|worry.*social\|instagram\|facebook` | "Build a 'less is more' content strategy — fewer, higher-quality short-form videos on Instagram Reels and YouTube…" |
| `device\|smartphone\|phone\|laptop\|tablet\|gadget\|smart` | "Run YouTube bumper ads and connected TV pre-rolls on Hotstar that show technology fitting naturally into everyday Indian home life…" |
| `purchas\|buy\|shop\|price\|store\|retail\|ecomm\|discount\|full.price` | "Integrate Instagram Shopping tags and Flipkart in-app placements into the media plan…" |
| `challeng\|aspir\|ambiti\|goal\|learn\|grow\|improv\|achiev` | "Run 15-second Instagram Reels and YouTube pre-rolls built around personal progress moments…" |
| `family\|household\|children\|parent\|home\|domestic` | "Place CTV pre-rolls on Hotstar family content in the 7–10pm slot…" |
| `employ\|work\|career\|income\|profession\|job` | "Target LinkedIn sponsored content and YouTube pre-rolls with career-aspiration messaging…" |
| `news\|inform\|read\|current\|aware` | "Build content partnerships with Times of India, Scroll, and YouTube news channels…" |

**Step 2:** If no attribute match, falls back to bucket default:

| Bucket | Default recommendation |
|--------|------------------------|
| **Commerce** | "Allocate a meaningful share of commerce spend to Meesho and Flipkart in-app placements — lead creative with social proof and value clarity, not discount depth." |
| **Communication** | "Shift 40–50% of paid social spend to creator-led Instagram Reels and YouTube Shorts — brief creators with the insight, not the script." |
| **Culture** | "Build regional-language creative for Moj and Josh in addition to Hindi-first platforms — campaigns that acknowledge cultural identity will outperform those that flatten it." |
| **Content** (default) | "Prioritise short-form video on Instagram Reels and YouTube — 15-second formats that lead with the insight rather than the brand." |

---

## 8. Generic Tabular & Social Listening Paths

### Tool Detection

Route detection from `fileNames[0]` + column keys:
```
Social Listening:  columns have `sentiment` AND (`mediatype`/`platform`/`message`)
                   OR filename matches: sentiment|shareofvoice|social.listening|brandwatch|konnect
Keyword Planner:   filename includes `keyword`
Amazon:            filename includes `amazon`
Helium10:          filename includes `helium`
Flipkart:          filename includes `flipkart`
Meesho:            filename includes `meesho`
Default:           TABULAR
```

### Generic Tabular Path
1. Try `analyzeGenericTabularForPRISM` (Gemini, 40s timeout)
2. If fails → Try OpenRouter with `buildInsightSlots(rows)` (fake slots from column structure)
3. If fails → 502 error (no auto-analysis fallback for non-GWI data)

### Social Listening Path
1. Pre-aggregated by `lib/social/parser.ts` before this route (sentiment/platform/theme/volume rows)
2. Try `analyzeSocialListeningForPRISM` (Gemini, 40s timeout)
3. If fails → Try OpenRouter with empty slots + social context
4. If fails → 422 error

### Stratified Sampling (Generic Tabular)

For large datasets, Gemini sees a 120-row stratified sample — **not the first 120 rows**:
```typescript
function stratifiedSample(rows, n):
  step = (rows.length - 1) / (n - 1)
  output = rows[round(i * step)] for i in 0..n-1
```
This captures head + middle + tail, so patterns in later rows (e.g. sorted-by-date exports) are not missed.

---

## 9. Rule-Based Inference Engine (`lib/inference.ts`)

This is the **original** PRISM inference engine — used for the `/insights` page when displaying generic non-GWI data, and as the basis for scorecards, anomaly detection, and strategic briefs.

**Important:** The rule engine's language ("Dominance Alert", "Breakout Performance", "Critical Warning") sounds like a stock-market terminal. It is NOT used as a fallback for AI analysis. The GWI pipeline uses `generateFallbackCards()` instead.

### Schema Inference (`inferSchema`)

Classifies every column into one of three types:
- **Time columns:** `>50%` of values parse as dates, OR column name contains `date/time/month/year/period/week/quarter`
- **Numeric columns:** `>80%` of values are numeric (non-NaN, finite)
- **Categorical columns:** unique values ≤ `max(50, 0.5 × rowCount)`

### Scorecard Generation

For each numeric column (up to 4):
- `value` = sum of all values
- `avg` = mean
- `trend` = % change: first half vs second half of dataset
- `isPositive` = trend ≥ 0

### Chart Generation Priority

1. **GWI heatmap** — if `isGWISheet()` returns true → `gwi_index_heatmap` (hbar)
2. **Keyword tiers** — if domain = "Search & SEO" AND has `tier` column → `keyword_tiers` (pie)
3. **Brand share** — if domain = "Search & SEO" AND has `brand` column → `brand_share` (hbar)
4. **Time series** (for each of first 2 numeric columns):
   - Title pattern: growing + high CV → "Growth Risk: volatility threatens stability"
   - Title pattern: growing + big jump → "Breakout Performance: surges X%"
   - Title pattern: growing + stable → "Steady Momentum: on track to hit..."
   - Title pattern: declining + severe → "Critical Warning: entered X% tailspin"
   - Title pattern: declining + mild → "Softening Signals: structural shift"
   - Chart type: CV > 40% → `line`, else → `area`
5. **Categorical dominance** (for each of first 3 categorical columns):
   - HHI > 0.25 AND top share > 60% → "Dominance Alert"
   - HHI > 0.25 → "Market Lead"
   - >5 segments → "Fragmented Landscape"
   - else → "Competitive Race"
   - Chart type: ≤5 segments AND top < 60% → `pie`, ≤10 → `bar`, else → `hbar`
6. **Correlation scatter** — Pearson r, conviction = r > 0.5 ? 92 : 76
7. **Bubble 3-way** — 3 numeric columns → convergence zone analysis
8. **Radar benchmark** — ≥3 numeric + categorical with 2–10 unique values
9. **Cross-categorical** — top 2 categorical × first numeric, top 12 combos

### Domain Detection

Scores column names against keyword lists to detect one of 10 domains:
```
Sales & Revenue:          revenue, sales, order, transaction, purchase, price, cost, profit
Marketing & Performance:  campaign, click, impression, ctr, cpc, cpm, ad, spend, reach
Search & SEO:             keyword, search, seo, rank, volume, traffic, pageview, session
User & Product Analytics: user, signup, churn, retention, active, dau, mau, cohort
Social Media Intelligence: follower, like, share, comment, post, reel, story, view
Content Performance:      content, article, video, blog, page, format, type, channel
HR & Workforce Analytics: employee, salary, headcount, department, hire, attrition
Supply Chain & Inventory: inventory, stock, sku, warehouse, supply, demand, fulfillment
Healthcare Analytics:     patient, diagnosis, treatment, health, clinical, hospital
Education Analytics:      student, grade, score, course, enrollment, attendance
```
Default: "Data Intelligence"

### Anomaly Detection

Z-score based: `|z| > 3` → anomaly (Surge if z > 0, Dip if z < 0)
Returns up to 5 anomalies with: `metric`, `value`, `row`, `severity` (z-score.toFixed(1)), `type`, `context`

### Strategic Brief Generation

Three pillars:
- `LEAD` — from first categorical chart, first sentence of `obs`
- `GROWTH` — from first time-series chart
- `RISK` — from anomalies (if any) OR correlation chart

Master action: `"Based on N KPIs analysed, PRISM recommends an [Accelerate/Defensive] Strategy centred on [FocalPoint]."`

---

## 10. OpenRouter Fallback (Conviction 82)

### Model Cascade (verified May 2026, all free tier)
```
1. openai/gpt-oss-120b:free              — best quality
2. nousresearch/hermes-3-llama-3.1-405b:free
3. meta-llama/llama-3.3-70b-instruct:free
4. google/gemma-4-31b-it:free
5. nvidia/nemotron-3-super-120b-a12b:free
6. openai/gpt-oss-20b:free               — lighter fallback
7. meta-llama/llama-3.2-3b-instruct:free — last resort
```

### How it works
- Same prompt as Gemini (`buildSlotBlock` + PRISM rules)
- Batches of 8 slots, **sequential** (not parallel) to stay within free-tier rate limits
- For each batch: tries models in cascade order, stops at first success
- Temperature: 0.65, max_tokens: 3500
- Conviction hardcoded to **82** regardless of what the model returns
- toolLabel appended with `· OpenRouter`

### URL and headers
```
POST https://openrouter.ai/api/v1/chat/completions
Authorization: Bearer ${OPENROUTER_API_KEY}
HTTP-Referer: https://prism-fluo.vercel.app
X-Title: PRISM
```

### `callOpenRouterText` (for non-slot routes)
A simple text helper used by copilot, trends/insights, and gemini/basic routes. Same 7-model cascade, returns raw text string (not parsed cards).

---

## 11. SLA Formula & Badge Logic

### Formula (`lib/sla.ts`)

```
sla_hours = ceil(4 + min(2, N × 0.5))
sla_due_at = now + sla_hours
```
Where N = currently active briefs (`status` in `['waiting_for_data', 'processing']`)

| Active Briefs | Calculation | SLA |
|---------------|-------------|-----|
| 0 | 4 + 0 = 4 | 4h |
| 1 | 4 + 0.5 = 4.5 → ceil | 5h |
| 2 | 4 + 1.0 = 5 | 5h |
| 3 | 4 + 1.5 = 5.5 → ceil | 6h |
| 4+ | 4 + 2.0 = 6 (cap) | 6h |

**Philosophy:** Always under-promise / over-deliver. Maximum is 6h, never exceeds.

### Badge Text (`formatSlaBadge`)

```
If completed:
  elapsed < 1h  → "Done in Xm"
  elapsed ≥ 1h  → "Done in X.Xh"

If not completed:
  diffMs ≤ 0    → "Overdue"
  minutes < 60  → "Due in Xm"
  else           → "Due in Xh"
```

---

## 12. Architecture Decisions & Why

### Why No Smoke Test for Gemini Models

**Problem:** Parallel uploads trigger 4+ simultaneous batches. With a smoke test, each batch probes 3 model candidates = 12+ extra API calls before real work starts. On the free tier (15 RPM) this exhausts quota instantly and ALL batches fail.

**Fix:** No smoke test. Pick the first non-blacklisted candidate immediately. Real 404s/empty responses are caught in `callGeminiWithRetry()` and blacklist the model. The cascade advances on the next call.

### Why Singleton Promise for Model Selection

Parallel batches hitting `getModel()` simultaneously would each launch their own selection. The `_probePromise` singleton ensures they all share ONE selection promise. The first to arrive creates the promise; the rest await it.

### Why Rule Engine NOT Used as Fallback

The original inference engine (`lib/inference.ts`) writes titles like "Dominance Alert", "Critical Warning", "Breakout Performance", "Market Moat" — stock-market/finance terminal language. This is wrong for an audience of brand managers and media planners. `generateFallbackCards()` uses friendly language anchored in actual data numbers.

### Why Auto-Analysis toolLabel Includes "· Auto-Analysis"

Conviction 70 signals to the UI that no AI was used. The toolLabel "GWI · Auto-Analysis" is also honest to the UI. **However**, for investor demos this label should probably be hidden or replaced with just "GWI".

### Why OpenRouter Uses Sequential Batches

Parallel batches to free-tier OpenRouter would hit rate limits instantly (most free models have very low RPM caps). Sequential ensures each batch completes before the next starts.

### Why 30s Timeout Per Gemini Batch (Not 60s)

Vercel Hobby plan caps function execution at 60s. With three parallel batches all at 60s timeout, `Promise.allSettled()` could wait up to 60s before resolving — leaving 0s for OpenRouter. At 30s, `allSettled` resolves by t=30, leaving ~25s for OpenRouter if needed.

### Why GWI Slots Cap at 18 (Not All 20)

Slot 1–18 = 3 parallel batches of 6. Adding slot 19–20 would create a 4th batch (slower, more API calls, higher chance of timeout). The cap is a deliberate tradeoff: cover all key GWI questions in exactly 3 calls.

### Why `Promise.allSettled` Instead of `Promise.all`

`Promise.all` rejects on first failure — one bad batch kills all results. `Promise.allSettled` collects results from all batches even if some fail. A single slow batch doesn't wipe out the 10 cards from the other two batches.

### WordPress-Style Publishing

Pages have `status` (draft/published), `show_in_nav`, and `protected` columns. The admin panel at `/admin/pages` lets admin users publish/unpublish without a deployment. `isPageOn('/route')` checks `published` only; `isInNav('/route')` checks both `show_in_nav AND published`.

### Next.js 16 Params Breaking Change

In Next.js 16, `params` in route handlers is a `Promise<{...}>`, not a plain object. Pattern:
```typescript
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // ...
}
```
Forgetting `await params` makes `params.id = undefined`, causing "Page not found" / 404 errors.

---

## 13. Key Files Map

| File | Purpose |
|------|---------|
| `app/api/ai/analyze-data/route.ts` | Main analysis pipeline, all 3 tiers, slot building, timeout wrapper |
| `lib/ai/gemini.ts` | Gemini client, model cascade, all 5 Gemini functions, title/narrative helpers |
| `lib/ai/openrouter.ts` | OpenRouter 7-model cascade, text helper |
| `lib/inference.ts` | Rule-based engine: schema, charts, scorecards, anomalies, strategic brief |
| `lib/gwi.ts` | GWI sheet detection, question parsing, tidy conversion |
| `lib/sla.ts` | SLA formula and badge formatting |
| `lib/keywords.ts` | Keyword planner data detection |
| `lib/social/parser.ts` | Social listening pre-aggregation |
| `components/BriefCard.js` | Dashboard cards with status gradient, delete button |
| `components/TrendPanel.jsx` | Live Google Trends widget on dashboard |
| `app/dashboard/page.js` | Dashboard with stats, filter bar, brief cards |
| `app/insights/page.js` | Insights display: exec summary, bucket tabs, chart cards |
| `app/upload/page.tsx` | File upload flow, analysis trigger |
| `app/admin/pages/page.tsx` | Admin panel for publish/unpublish/bulk control |
| `app/api/admin/pages/[id]/route.ts` | PATCH endpoint for page status (Next.js 16 `await params`) |
| `app/api/briefs/[id]/route.js` | DELETE handler for brief deletion |
| `app/api/dashboard/overview/route.ts` | Single round-trip overview with DB-aggregated stats |
| `app/api/migrate/route.ts` | DB migration: pages table, is_admin column, all schema |
| `middleware.ts` | Auth gates, public route list |
| `lib/db/schema.sql` | DB schema (idempotent ALTER statements) |

---

## 14. Conviction Score System

Every insight card has a `conviction` number (0–100) that represents the quality/source of the analysis:

| Score | Source | Label |
|-------|--------|-------|
| **99** | Hard-coded GWI heatmap (known exact formula) | `PRISM GWI Engine` |
| **98** | Hard-coded keyword tiers | `PRISM Keyword Engine` |
| **96** | Hard-coded brand share | `PRISM Keyword Engine` |
| **94** | Rule engine: time series | `PRISM Storyteller · Performance Logic` |
| **93** | Rule engine: categorical dominance | `PRISM Storyteller · Multi-Segment Engine` |
| **92** | Rule engine: correlation (r > 0.5) | `PRISM Storyteller · Dynamic Correlation` |
| **90** | Gemini: GWI slot analysis | `GWI` |
| **90** | Rule engine: radar benchmark | `PRISM Storyteller · Benchmark Logic` |
| **88** | Gemini: generic tabular / social | varies |
| **85** | Gemini: PDF text analysis | filename |
| **82** | **OpenRouter** (honest tier) | `GWI · OpenRouter` |
| **76** | Rule engine: weak correlation (r ≤ 0.5) | — |
| **70** | **Auto-Analysis** (pure data, no AI) | `GWI · Auto-Analysis` |

**Investor note:** Conviction scores and the "Auto-Analysis" / "OpenRouter" labels in `toolLabel` are visible in the UI. For demos, consider hiding the numeric conviction score and normalising the toolLabel to just show the data source.

---

## 15. Investor Demo Rules

Critical rules that must hold for investor demos:

1. **No 504 errors visible.** The `withTimeout(30_000)` wrapper ensures Gemini never hangs past Vercel's 60s limit. If Gemini is slow, OpenRouter takes over within the same function call.

2. **No "Auto-Analysis" label visible.** This is the Tier 3 fallback. If it appears, it means both Gemini AND OpenRouter failed — which is very rare but possible during API outages.

3. **No raw Index numbers in UI.** Cards must never show "Index 168" — always convert to "nearly 70% more likely than".

4. **No finance jargon.** Banned from ALL paths: tailspin, volatility, breakout, multiplier, dominance alert, market moat, volume-capture, growth risk, critical warning, capitalise, over-index, leverage, cohort, synergy, touchpoint, whitespace, holistic, robust, utilize, paradigm, seamless.

5. **Fallbacks are invisible.** OpenRouter conviction (82) and Gemini conviction (90) are close enough that the cards look the same. Only conviction 70 (auto-analysis) is noticeably different in tone.

6. **SLA never over-promises.** Maximum SLA is 6h. "Typical delivery 4–6 hrs" on the dashboard is accurate.

7. **Delete button has confirm dialog.** `window.confirm()` prevents accidental deletion during demos.

---

*Last updated: May 2026. Maintained by PRISM engineering. If you change any of the core logic above, update this document in the same commit.*
