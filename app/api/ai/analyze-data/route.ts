/**
 * POST /api/ai/analyze-data
 *
 * Pre-processes raw rows into structured insight slots (exact data per slot),
 * then asks Gemini 2.5 to write narrative around those exact numbers only.
 *
 * Body:  { rows: object[], sheetName: string, fileNames?: string[] }
 * Reply: { insights: GeminiInsightCard[], slots: DataSlot[] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { analyzeDataForPRISM, analyzeGenericTabularForPRISM, analyzeSocialListeningForPRISM } from '@/lib/ai/gemini';
import { analyzeWithOpenRouter, analyzeGenericWithOpenRouter, analyzeSocialWithOpenRouter } from '@/lib/ai/openrouter';
import type { DataSlot, GeminiInsightCard } from '@/lib/ai/gemini';

// Vercel Hobby plan default timeout is 10 s — Gemini 2.5 routinely takes 15-40 s.
// Setting maxDuration = 60 (the Hobby-plan maximum) prevents premature timeouts.
export const maxDuration = 60;

// ── Column aliases ────────────────────────────────────────────
function col(row: any, ...keys: string[]): string {
  for (const k of keys) if (row[k] != null && row[k] !== '') return String(row[k]);
  return '';
}
function num(row: any, ...keys: string[]): number {
  for (const k of keys) { const v = parseFloat(String(row[k] ?? '')); if (!isNaN(v)) return v; }
  return 0;
}

// ── Question → PRISM bucket ───────────────────────────────────
// Order matters: Communication checked BEFORE Content so "social media brand"
// questions route to Communication, not the Content default.
function questionBucket(q: string): DataSlot['bucket'] {
  const t = q.toLowerCase();

  // ── COMMUNICATION — brand touchpoints, advertising, social signals, discovery ──
  if (
    /paid media|advert|discover|brand.rel|brand.action|brand.qual|advocacy|earned.media|word.of.mouth/.test(t) ||
    /brand.aware|brand.trust|brand.image|brand.percep|brand.sentiment|brand.affin|brand.equity/.test(t) ||
    /influenc|creator.market|ad.recall|net.promot|\bnps\b|social.media.attit|social.media.brand/.test(t) ||
    /brand.discov|discover.brand|brand.famil|brand.consider|brand.prefer/.test(t) ||
    /social.network.attit|platform.attit|media.channel|channel.prefer/.test(t)
  ) return 'communication';

  // ── COMMERCE — purchase intent, spending, financial, retail, pricing ──────
  if (
    /purchase|buy|shop|price|retailer|\bsale\b|ecomm|product.research|familiarity|purchase.driver|in.store|online.brand/.test(t) ||
    /income|mortgage|grocer|financ|saving|loan|credit|subscript|afford|discount|voucher|cashback/.test(t) ||
    /loyalty.prog|reward.point|consumer.confid|disposable|spend.habit|money.manage|financial.attit/.test(t) ||
    /\beco\b|product.categor|brand.switch|value.for.money|deal.seek/.test(t)
  ) return 'commerce';

  // ── CULTURE — demographics, attitudes, lifestyle, values, identity ─────────
  if (
    /employ|household|children|vehicle|living.arrangement|\bpet\b|lifestyle|family|grandchild|age.child|properties.owned|number.child/.test(t) ||
    /attitude|values?|\bbelief|\bopinion|wellbeing|mental.health|physical.health/.test(t) ||
    /fitness|\bsport|\bexercis|\bhealth\b|food.habit|drink.habit|\btravel\b|holiday|vacation/.test(t) ||
    /fashion|style|\bbeauty\b|grooming|environment|sustainab|social.issue|politic|religion|spirit/.test(t) ||
    /community|education|\bcareer|work.life|life.goal|parenting|identity|demograph|hobbi/.test(t) ||
    /luxury.attit|social.cause|personal.value|cultural.identity|self.image/.test(t)
  ) return 'culture';

  // ── CONTENT — media consumption, devices, screen time, formats ────────────
  if (
    /device|owned.media|content.format|streaming|screen.time|television|\btv\b/.test(t) ||
    /gaming|\bgame\b|podcast|\bmusic\b|radio|internet.usage|digital.device|\bott\b/.test(t) ||
    /social.media(?!.attit)(?!.brand)|social.network(?!.attit)|messag.app|content.consumption/.test(t) ||
    /news.consumption|video.content|audio.content|reading.habit/.test(t)
  ) return 'content';

  return 'content'; // default — media consumption is the most common unclassified category
}

// ── Suggest best chart type for this question's data ─────────
// Uses both the question semantics AND data shape to pick the right visual.
function suggestChart(
  rowCount: number,
  rows:     DataSlot['rows'],
  question: string = '',
): DataSlot['chartSuggestion'] {
  const q = question.toLowerCase();

  // ── Semantic overrides (question topic takes priority) ──────────────────

  // Purchase / conversion journey  → funnel (stages narrowing to outcome)
  if (/purchas|funnel|convert|journey|path.*buy|awareness.*intent|stage/i.test(q) && rowCount <= 8)
    return 'funnel';

  // Temporal / trend data → area (richer fill than bare line)
  if (/week|month|quarter|season|over time|trend|yearly|annual|growth|longitudinal/i.test(q))
    return 'area';

  // Multi-attribute profile / attitude / lifestyle → radar
  if (/attitude|value|lifestyle|personalit|psycho|dimension|profile|attribute|habit|charact/i.test(q)
      && rowCount >= 3 && rowCount <= 8)
    return 'radar';

  // Revenue / spend / budget component breakdown → waterfall
  if (/revenue|spend|budget|breakdown|bridge|contribut|cost.*break|decompos/i.test(q)
      && rowCount >= 3 && rowCount <= 10)
    return 'waterfall';

  // Distribution / frequency across ranges → histogram
  if (/distribut|frequenc|range|bucket|bracket|spread/i.test(q) && rowCount >= 4)
    return 'histogram';

  // ── Data-shape overrides ─────────────────────────────────────────────────

  // Very small set → doughnut (cleaner than pie for 3–5)
  if (rowCount <= 3) return 'pie';
  if (rowCount <= 5) return 'doughnut';

  // Good scatter signal: both audiencePct and index available on 4+ rows
  const hasGoodScatter = rows.filter(r => r.audiencePct > 0 && r.index > 80).length >= 4;
  if (hasGoodScatter && rowCount >= 6) return 'scatter';

  // Medium set → bar (vertical, clean)
  if (rowCount <= 7) return 'bar';

  // Large set with long category labels → horizontal bar
  return 'hbar';
}

// ── Build insight slots from raw rows ─────────────────────────
// Returns ALL slots (one per question group), sorted by Index signal strength.
// Caller decides how many to send per Gemini batch.
function buildInsightSlots(rows: any[]): DataSlot[] {
  // 1. Group by question
  const groups: Record<string, any[]> = {};
  for (const row of rows) {
    const q = col(row,
      'Short Label Question', 'short_label_question',
      'Question', 'question', 'time_bucket',
      'Category', 'Sheet',
    ) || 'General';
    if (!groups[q]) groups[q] = [];
    groups[q].push(row);
  }

  // 2. For each question compute rows sorted by Index (high signal first)
  const questions = Object.entries(groups).map(([question, qRows]) => {
    const parsed = qRows
      .map(r => ({
        attr:        col(r, 'Attributes', 'attributes', 'Attribute', 'audience', 'Label', 'Name'),
        audiencePct: num(r, 'Audience %', 'audience_pct', 'Audience%'),
        dataPct:     num(r, 'Data point %', 'data_point_pct', 'DataPoint%'),
        index:       num(r, 'Index', 'index_score'),
        universe:    num(r, 'Universe', 'universe'),
      }))
      .filter(r => r.attr && r.index > 0)
      .sort((a, b) => b.index - a.index);

    return {
      question,
      bucket: questionBucket(question),
      maxIndex: parsed[0]?.index ?? 0,
      // Send top 10 rows per slot (was 7) for richer Gemini context
      topRows: parsed.slice(0, 10),
      rowCount: parsed.length,
    };
  }).filter(q => q.topRows.length >= 2);

  // 3. Sort ALL questions by signal strength (maxIndex) — no bucket cap
  // Preserve at least 1 slot per bucket if available, then fill with highest-index
  const byBucket: Record<string, typeof questions> = {};
  for (const q of questions) {
    if (!byBucket[q.bucket]) byBucket[q.bucket] = [];
    byBucket[q.bucket].push(q);
  }

  // Guarantee minimum coverage: 2 per bucket (if available)
  const guaranteed: typeof questions = [];
  for (const bucket of ['content', 'commerce', 'communication', 'culture'] as const) {
    const sorted = (byBucket[bucket] ?? []).sort((a, b) => b.maxIndex - a.maxIndex);
    guaranteed.push(...sorted.slice(0, 2));
  }

  // Add remaining questions not already included, sorted by maxIndex
  const guaranteedKeys = new Set(guaranteed.map(q => q.question));
  const remaining = questions
    .filter(q => !guaranteedKeys.has(q.question))
    .sort((a, b) => b.maxIndex - a.maxIndex);

  // Return up to 20 slots total (covers all 19 GWI sheets + some overlap)
  return [...guaranteed, ...remaining].slice(0, 20).map(q => ({
    bucket: q.bucket,
    question: q.question,
    chartSuggestion: suggestChart(q.rowCount, q.topRows, q.question),
    rows: q.topRows,
  }));
}

// Split slots into batches of batchSize for parallel Gemini calls
function chunkSlots(slots: DataSlot[], batchSize: number): DataSlot[][] {
  const batches: DataSlot[][] = [];
  for (let i = 0; i < slots.length; i += batchSize) {
    batches.push(slots.slice(i, i + batchSize));
  }
  return batches;
}

// ── Pure-data fallback: no Gemini, grounded in actual slot numbers ────────────
// Matches the prototype card style exactly:
//   Title  → stat-led headline, plain number, active language
//   Obs    → 3 sentences: punchy finding · second signal · strategic so-what
//   Stat   → pull-quote, plain English, no raw "Index N"
//   Rec    → specific Indian platform + format + creative angle
// conviction = 70 (lower than Gemini's 88–90) signals auto-analysis to the UI.

function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

/** audience% → plain-English fraction  e.g. 48.6 → "nearly 1 in 2" */
function pctToWords(pct: number): string {
  if (pct >= 80) return 'more than 4 in 5';
  if (pct >= 70) return 'about 7 in 10';
  if (pct >= 60) return 'more than 3 in 5';
  if (pct >= 55) return 'more than half';
  if (pct >= 48) return 'nearly 1 in 2';
  if (pct >= 40) return 'about 2 in 5';
  if (pct >= 33) return 'about 1 in 3';
  if (pct >= 25) return 'about 1 in 4';
  if (pct >= 20) return 'about 1 in 5';
  if (pct >= 16) return 'roughly 1 in 6';
  if (pct >= 13) return 'roughly 1 in 7';
  if (pct >= 10) return 'about 1 in 10';
  return `${pct.toFixed(0)}%`;
}

/** GWI index → plain-English multiplier  e.g. 167 → "nearly 70% more likely than" */
function indexToWords(index: number): string {
  const m = index / 100;
  if (m >= 4.0) return `nearly ${Math.floor(m)} times more likely than`;
  if (m >= 3.0) return `more than three times as likely as`;
  if (m >= 2.5) return `more than twice as likely as`;
  if (m >= 2.0) return `twice as likely as`;
  if (m >= 1.75) return `nearly twice as likely as`;
  if (m >= 1.5)  return `one and a half times more likely than`;
  if (m >= 1.3)  return `about ${Math.round((m - 1) * 100)}% more likely than`;
  if (m >= 1.1)  return `around ${Math.round((m - 1) * 100)}% more likely than`;
  return `slightly more likely than`;
}

/**
 * Strip GWI attribute text into natural English:
 *   "I am using social media less than I used to" → "using social media less than before"
 *   "Challenging myself, (Important to me)"       → "challenging myself"
 *   "Other home/lifestyle interests"               → "home/lifestyle interests"
 */
function cleanAttrText(attr: string): string {
  return attr
    .replace(/,?\s*\([^)]*\)/g, '')   // remove "(Important to me)" etc.
    .replace(/^I am /i, '')            // "I am using…" → "using…"
    .replace(/^I /i,   '')             // "I prefer…"   → "prefer…"
    .replace(/^My /i,  '')             // "My income…"  → "income…"
    .replace(/^Other /i, '')           // "Other home…" → "home…"
    .replace(/ than I used to$/i, ' than before')
    .trim();
}

/**
 * Build a stat-led title matching the prototype style.
 * e.g. "29.5% of This Audience Are Using Social Media Less Than Before — a Shift Brands Need to Plan Around"
 * e.g. "Young Parents Make Up 4.1% of This Audience — More Than the National Average Suggests"
 */
function buildTitle(attr: string, pctNum: string | null, multFmt: string): string {
  const clean   = cleanAttrText(attr);
  const short   = clean.length > 48 ? clean.slice(0, 45) + '…' : clean;
  const wasIAm  = /^I am /i.test(attr);
  const wasVerb = /^I (am |)(using|watch|buy|prefer|trust|worry|think|feel|read|listen|spend|value|choos|believ|driv|own|follow|support|creat|shar|post|play|cook|exercis|travel)/i.test(attr);

  if (wasIAm || wasVerb) {
    return pctNum
      ? `${pctNum} of This Audience Are ${cap(short)} — a Signal Worth Building Into the Brief`
      : `A Key Segment of This Audience Is ${cap(short)} — Stronger Than the National Average Suggests`;
  }

  // Persona (title-case, ≤ 3 words, e.g. "Young Parent", "Social Media Scroller")
  const words = attr.trim().split(/\s+/);
  if (words.length <= 3 && /^[A-Z]/.test(words[0])) {
    return pctNum
      ? `${attr}s Make Up ${pctNum} of This Audience — Disproportionately High vs the National Average`
      : `${attr}s Are More Prevalent in This Audience Than Brands Typically Assume`;
  }

  // Topic / interest
  return pctNum
    ? `${pctNum} of This Audience Prioritise ${cap(short)} — ${multFmt} the National Average`
    : `${cap(short)} Is ${multFmt} More Common Here Than in the General Indian Population`;
}

/**
 * Write observation S1 — the punchy opening fact, active voice, no raw Index numbers.
 */
function buildS1(attr: string, pctNum: string | null, pctFrac: string | null, multFmt: string): string {
  const clean  = cleanAttrText(attr);
  const wasIAm = /^I am /i.test(attr);
  const wasVerb = /^I (am |)(using|watch|buy|prefer|trust|worry|think|feel|read|listen|spend|value|choos|believ|driv|own|follow|support|creat|shar|post|play|cook|exercis|travel)/i.test(attr);

  if ((wasIAm || wasVerb) && pctNum && pctFrac) {
    return `${pctNum} of this audience — ${pctFrac} — are ${clean}, a rate ${multFmt} the national average and a clear indicator of where this group's attention is heading.`;
  }
  if ((wasIAm || wasVerb) && pctFrac) {
    return `${cap(pctFrac)} of this audience are ${clean} — ${multFmt} the national average, and a pattern that runs consistently across this group.`;
  }
  if (pctNum && pctFrac) {
    return `${pctNum} of this audience — ${pctFrac} — prioritise ${clean}, placing this group ${multFmt} the national average and making it one of the strongest signals in this dataset.`;
  }
  if (pctFrac) {
    return `${cap(pctFrac)} of this audience lean strongly towards ${clean} — ${multFmt} the national average, and a signal that holds up across multiple data cuts.`;
  }
  return `${cap(clean)} is the leading signal in this category — ${multFmt} the national average, and consistently the top-ranked attribute in this audience profile.`;
}

/**
 * Write observation S2 — second different attribute, different angle, concrete numbers.
 */
function buildS2(attr1: string, attr2: string, pct2Raw: number, index2: number): string {
  if (attr2 === attr1) {
    return `This pattern holds consistently across multiple attributes in this category, suggesting a deliberate audience orientation rather than an isolated data point.`;
  }
  const clean2  = cleanAttrText(attr2);
  const wasIAm2 = /^I am /i.test(attr2);
  const wasVerb2 = /^I /i.test(attr2);
  const pct2Str = pct2Raw > 0 ? `${pct2Raw.toFixed(1)}%` : null;
  const mult2   = `${(index2 / 100).toFixed(1)}×`;

  if ((wasIAm2 || wasVerb2) && pct2Str) {
    return `The same audience also shows a strong lean towards ${clean2}: ${pct2Str} exhibit this behaviour (${mult2} the national rate), reinforcing a consistent picture of how this group thinks and acts.`;
  }
  if (pct2Str) {
    return `${cap(clean2)} is the next strongest signal at ${pct2Str} (${mult2} the national average) — confirming this is a consistent audience orientation, not a one-off finding.`;
  }
  return `${cap(clean2)} follows closely at ${mult2} the national average, confirming that this audience has a clear and consistent lean in this category.`;
}

/**
 * Write a platform-specific recommendation matching prototype style:
 * names a specific Indian platform, a specific format, and a specific creative angle.
 */
function buildRec(slot: DataSlot, topAttr: string, pctNum: string | null): string {
  const q    = slot.question.toLowerCase();
  const attr = cleanAttrText(topAttr).toLowerCase();

  if (/stream|ott|netflix|hotstar|prime|jio.*cinema|zee5/i.test(q + attr))
    return `Shift 60–65% of video budget to JioCinema and Hotstar pre-rolls — this audience spends a disproportionate amount of screen time inside these apps and will reward brands that show up in relevant, in-moment placements.`;

  if (/social media|using.*less|spend.*time.*social|worry.*social|instagram|facebook/i.test(attr + q))
    return `Build a "less is more" content strategy — fewer, higher-quality short-form videos on Instagram Reels and YouTube. This audience is already pulling back from volume content; brands that respect their attention will earn more of it.`;

  if (/device|smartphone|phone|laptop|tablet|gadget|smart/i.test(q + attr))
    return `Run YouTube bumper ads and connected TV pre-rolls on Hotstar that show technology fitting naturally into everyday Indian home life — utility-led creative outperforms aspirational messaging with this group by a significant margin.`;

  if (/purchas|buy|shop|price|store|retail|ecomm|discount|full.price/i.test(q + attr))
    return `Integrate Instagram Shopping tags and Flipkart in-app placements into the media plan. This audience researches heavily before buying — invest in retargeting sequences that bridge social discovery to purchase, and prioritise DTC trust signals over discount-led creative.`;

  if (/challeng|aspir|ambiti|goal|learn|grow|improv|achiev/i.test(attr))
    return `Run 15-second Instagram Reels and YouTube pre-rolls built around personal progress moments — real Indians setting and hitting goals, not aspirational models. This audience responds to creative that mirrors their own ambitions rather than selling a lifestyle.`;

  if (/family|household|children|parent|home|domestic/i.test(q + attr))
    return `Place CTV pre-rolls on Hotstar family content in the 7–10pm slot — this audience is most receptive during family viewing time. Creative should feature warm, realistic Indian family moments rather than idealised imagery.`;

  if (/employ|work|career|income|profession|job/i.test(q + attr))
    return `Target LinkedIn sponsored content and YouTube pre-rolls with career-aspiration messaging that acknowledges this audience's professional identity. They respond to brands that see them as capable and ambitious, not just consumers.`;

  if (/news|inform|read|current|aware/i.test(q + attr))
    return `Build content partnerships with news and editorial platforms — Times of India, Scroll, and YouTube news channels. This audience actively seeks information and will engage with brand stories that feel editorial and well-sourced rather than promotional.`;

  // Bucket-level defaults that still name specific platforms and actions
  if (slot.bucket === 'commerce')
    return `Allocate a meaningful share of commerce spend to Meesho and Flipkart in-app placements — this audience is purchase-ready but trust-sensitive. Lead creative with social proof and value clarity, not discount depth.`;
  if (slot.bucket === 'communication')
    return `Shift 40–50% of paid social spend to creator-led Instagram Reels and YouTube Shorts. This audience trusts peer recommendations over polished brand content — brief creators with the insight, not the script.`;
  if (slot.bucket === 'culture')
    return `Build regional-language creative for Moj and Josh in addition to Hindi-first platforms. This audience's cultural identity is a real strategic signal — campaigns that acknowledge it will outperform those that flatten it.`;

  // content default
  return `Prioritise short-form video on Instagram Reels and YouTube — 15-second formats that lead with the insight rather than the brand. This audience rewards creative that reflects their actual life, not a brand-polished version of it.`;
}

function generateFallbackCards(slots: DataSlot[], toolLabel: string): GeminiInsightCard[] {
  const cards: GeminiInsightCard[] = [];

  for (const slot of slots) {
    if (slot.rows.length < 2) continue;

    const topN   = slot.rows.slice(0, 6);
    const top    = topN[0];
    // Pick a genuinely different second attribute
    const second = topN.find(r => r.attr !== top.attr) ?? topN[1];

    // Plain-English values
    const pctRaw  = top.audiencePct > 0 ? top.audiencePct : top.dataPct;
    const hasPct  = pctRaw > 0;
    const pctNum  = hasPct ? `${pctRaw.toFixed(1)}%` : null;
    const pctFrac = hasPct ? pctToWords(pctRaw) : null;
    const multFmt = `${(top.index / 100).toFixed(1)}×`;

    // ── TITLE ────────────────────────────────────────────────────────────────
    const title = buildTitle(top.attr, pctNum, multFmt);

    // ── OBSERVATION ──────────────────────────────────────────────────────────
    const s1 = buildS1(top.attr, pctNum, pctFrac, multFmt);

    const s2pct = second.audiencePct > 0 ? second.audiencePct : second.dataPct;
    const s2    = buildS2(top.attr, second.attr, s2pct, second.index);

    const s3map: Record<string, string> = {
      content:       'For brands in this space, reflecting this behaviour in content strategy — not just targeting — will deliver meaningfully stronger engagement with this group.',
      commerce:      'Messaging that acknowledges how this audience actually makes purchase decisions will consistently outperform generic category creative.',
      communication: 'Media spend aligned to the platforms and formats this audience actively uses will deliver higher earned attention and more efficient CPMs.',
      culture:       'Campaigns that genuinely connect with these cultural values will feel authentic to this group — and they have a sharp radar for brands that do it well vs. brands that appropriate.',
    };
    const s3 = s3map[slot.bucket] ?? 'This is a clear strategic signal worth building into the next campaign brief.';

    const obs = `${s1} ${s2} ${s3}`;

    // ── STAT — pull-quote style, no raw Index numbers ─────────────────────
    const stat = hasPct
      ? `${pctNum} of this audience — ${pctFrac} — ${/^I (am |)/i.test(top.attr) ? 'are ' + cleanAttrText(top.attr) : 'prioritise ' + cleanAttrText(top.attr)} (${multFmt} the national average)`
      : `${cleanAttrText(top.attr)} is ${multFmt} more prevalent here than in the general Indian population — the strongest signal in this category`;

    // ── RECOMMENDATION ───────────────────────────────────────────────────────
    const rec = buildRec(slot, top.attr, pctNum);

    // ── CHART ────────────────────────────────────────────────────────────────
    const useAudiencePct = topN.some(r => r.audiencePct > 0);
    const chartValues    = topN.map(r => useAudiencePct ? r.audiencePct : r.index);
    const chartValues2   = slot.chartSuggestion === 'scatter' ? topN.map(r => r.index) : undefined;

    cards.push({
      title,
      bucket:      slot.bucket,
      type:        slot.chartSuggestion,
      conviction:  70,
      obs,
      stat,
      rec,
      toolLabel:   `${toolLabel} · Auto-Analysis`,
      chartLabels: topN.map(r => r.attr),
      chartValues,
      chartValues2,
    });
  }

  return cards;
}

// ── Timeout wrapper ────────────────────────────────────────────
// Races a promise against a hard deadline. When Gemini hangs past
// the deadline the batch is treated as failed so we fall through to
// OpenRouter before Vercel kills the whole function at 60 s.
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    ),
  ]);
}

// ── Route ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { rows, sheetName, fileNames } = await req.json();

    if (!Array.isArray(rows) || rows.length === 0)
      return NextResponse.json({ error: 'rows array required' }, { status: 400 });

    // BUG FIX: Do NOT exit here if GEMINI_API_KEY is missing.
    // Gemini functions throw internally when the key is absent, which is caught
    // by Promise.allSettled / try-catch — fallbacks (OpenRouter, auto-analysis)
    // then run as normal.  Returning 503 here would have killed every fallback.
    if (!process.env.GEMINI_API_KEY)
      console.warn('[analyze-data] GEMINI_API_KEY not set — Gemini will fail, OpenRouter + auto-analysis will handle it');

    const slots = buildInsightSlots(rows);
    const context = [fileNames?.join(' + ') || sheetName].filter(Boolean).join(' ');

    // GWI-shaped data → structured slot path (exact numbers, anti-hallucination)
    // Cap at 18 slots (3 batches of 6) — covers all key GWI questions while keeping
    // parallel API calls at ≤ 3, which fits within the free-tier 15 RPM rate limit.
    if (slots.length > 0) {
      const gwiContext = `${context} — India 18–64 Gen Pop`;
      const toolLabel  = fileNames?.[0]?.toLowerCase().includes('household') ? 'GWI HOUSEHOLD' : 'GWI';

      try {
        const BATCH_SIZE = 6;
        // Limit to 18 slots max → always exactly 3 parallel calls, never 4+
        const batches    = chunkSlots(slots.slice(0, 18), BATCH_SIZE);

        // Each batch has a 30 s hard deadline so Promise.allSettled() always
        // resolves within 30 s — leaving 25+ s for OpenRouter if needed.
        // Without this, a single hanging Gemini call causes a Vercel 504
        // before the fallback code ever runs.
        const batchResults = await Promise.allSettled(
          batches.map((batch, i) =>
            withTimeout(
              analyzeDataForPRISM(batch, gwiContext, toolLabel),
              30_000,
              `Gemini batch ${i + 1}/${batches.length}`,
            )
          )
        );

        // Merge successful results, log failures without crashing
        const insights = batchResults.flatMap((result, i) => {
          if (result.status === 'fulfilled') return result.value;
          console.warn(`[analyze-data] Batch ${i + 1}/${batches.length} failed:`, result.reason?.message);
          return [];
        });

        if (insights.length === 0) {
          console.warn('[analyze-data] All Gemini batches failed — trying OpenRouter fallback');

          // ── Tier 2: OpenRouter (free LLM models, same prompt) ──────────
          // BUG FIX: wrapped in withTimeout(20_000) so OpenRouter cannot hang
          // past 20 s — leaving ~10 s buffer for Tier 3 auto-analysis before
          // Vercel kills the function at 60 s.
          if (process.env.OPENROUTER_API_KEY) {
            try {
              const orCards = await withTimeout(
                analyzeWithOpenRouter(slots, gwiContext, toolLabel),
                20_000,
                'OpenRouter GWI',
              );
              if (orCards.length > 0) {
                console.log(`[analyze-data] OpenRouter returned ${orCards.length} cards`);
                return NextResponse.json({
                  insights:   orCards,
                  slots,
                  path:       'gwi-slots',
                  totalSlots: slots.length,
                  batches:    batches.length,
                  fallback:   'openrouter',
                });
              }
            } catch (orErr: any) {
              console.warn('[analyze-data] OpenRouter GWI fallback failed:', orErr.message);
            }
          } else {
            console.warn('[analyze-data] OPENROUTER_API_KEY not set — skipping OpenRouter fallback');
          }

          // ── Tier 3: Pure-data auto-analysis (no AI, grounded in slot numbers) ──
          console.warn('[analyze-data] Using pure-data auto-analysis as last resort');
          const fallbackCards = generateFallbackCards(slots, toolLabel);
          if (fallbackCards.length > 0) {
            return NextResponse.json({
              insights:   fallbackCards,
              slots,
              path:       'gwi-slots',
              totalSlots: slots.length,
              batches:    batches.length,
              fallback:   'auto',
            });
          }
          // Nothing worked and data has no index scores — genuine failure
          return NextResponse.json(
            { error: 'No insights could be generated — data may not contain index scores.', path: 'gwi-slots', slotCount: slots.length },
            { status: 422 },
          );
        }

        return NextResponse.json({ insights, slots, path: 'gwi-slots', totalSlots: slots.length, batches: batches.length });
      } catch (err: any) {
        return NextResponse.json(
          { error: `Gemini failed on GWI slots: ${err.message}`, path: 'gwi-slots', slotCount: slots.length },
          { status: 502 },
        );
      }
    }

    // Non-GWI data (Amazon, Helium10, sales, marketing, etc.)
    // → generic Gemini path with creative/media-pro prompt.
    // The rule engine is NOT a fallback any more — its language sounds
    // like a stock-market terminal, which is wrong for our audience.
    const firstName  = fileNames?.[0] ?? sheetName ?? 'data';
    const lower      = firstName.toLowerCase();
    // Detect tool type from filename OR from row column names
    const colKeys    = rows.length > 0 ? Object.keys(rows[0]).map(k => k.toLowerCase()) : [];
    const hasSocialCols = colKeys.some(k => k.includes('sentiment')) &&
                          (colKeys.some(k => k.includes('mediatype') || k.includes('platform')) ||
                           colKeys.some(k => k.includes('message')));
    const hasSocialFilename = /sentiment|shareofvoice|share.of.voice|social.listening|brandwatch|meltwater|talkwalker|konnect/i.test(lower);

    const toolLabel  = (hasSocialCols || hasSocialFilename)  ? 'SOCIAL_LISTENING'
                     : lower.includes('keyword')             ? 'KEYWORD_PLANNER'
                     : lower.includes('amazon')              ? 'AMAZON'
                     : lower.includes('helium')              ? 'HELIUM10'
                     : lower.includes('flipkart')            ? 'FLIPKART'
                     : lower.includes('meesho')              ? 'MEESHO'
                     : 'TABULAR';

    // ── Social Listening path — uses pre-aggregated sentiment/platform rows ──
    if (toolLabel === 'SOCIAL_LISTENING') {
      try {
        const insights = await withTimeout(
          analyzeSocialListeningForPRISM(rows, context, 'Social Listening'),
          40_000, 'Gemini social-listening',
        );
        if (insights.length > 0)
          return NextResponse.json({ insights, slots: [], path: 'social-listening' });
      } catch (err: any) {
        console.warn('[analyze-data] Social Listening Gemini failed:', err.message);
      }

      // BUG FIX: Previously passed [] as slots → prompt said "write 0 cards" → always failed.
      // Now uses analyzeSocialWithOpenRouter which builds a proper sentiment/platform prompt
      // from the actual pre-aggregated rows.  Also wrapped in withTimeout(15_000) so it
      // cannot hang past 15 s after the 40 s Gemini timeout (total ≤ 55 s < 60 s limit).
      if (process.env.OPENROUTER_API_KEY) {
        try {
          const orCards = await withTimeout(
            analyzeSocialWithOpenRouter(rows, context, 'Social Listening'),
            15_000,
            'OpenRouter social-listening',
          );
          if (orCards.length > 0)
            return NextResponse.json({ insights: orCards, slots: [], path: 'social-listening', fallback: 'openrouter' });
        } catch (orErr: any) {
          console.warn('[analyze-data] OpenRouter social fallback failed:', orErr.message);
        }
      }
      return NextResponse.json(
        { error: 'Could not generate insights for social listening data. Please try again.', path: 'social-listening' },
        { status: 422 },
      );
    }

    // ── Generic tabular path (Helium10, Keywords, Amazon, etc.) ──
    try {
      const insights = await withTimeout(
        analyzeGenericTabularForPRISM(rows, context, toolLabel),
        40_000, `Gemini ${toolLabel}`,
      );
      if (insights.length > 0)
        return NextResponse.json({ insights, slots: [], path: 'generic-tabular' });
    } catch (err: any) {
      console.warn('[analyze-data] Generic tabular Gemini failed:', err.message);
    }

    // BUG FIX: The old code called buildInsightSlots(rows) here a second time.
    // But we only reach this code because slots.length === 0 at line 444 — meaning
    // this data has no GWI-style Index column.  Calling buildInsightSlots again
    // on the same rows always returns 0, so the OpenRouter and auto-analysis
    // conditions (genericSlots.length > 0) were ALWAYS false — those tiers
    // never ran for Amazon, Helium10, keywords, or sales data.
    //
    // Fix: Use analyzeGenericWithOpenRouter which sends the raw rows (not slots)
    // directly to OpenRouter with the same creative/media-pro prompt Gemini uses.
    // This works for any tabular format regardless of column structure.

    // ── Tier 2: OpenRouter (raw rows, same generic-tabular prompt) ──────────
    // withTimeout(15_000): Gemini already used 40 s; 15 s leaves 5 s buffer
    // before Vercel's 60 s hard limit.  Total max: 40 + 15 = 55 s.
    if (process.env.OPENROUTER_API_KEY) {
      try {
        const orCards = await withTimeout(
          analyzeGenericWithOpenRouter(rows, context, toolLabel),
          15_000,
          `OpenRouter ${toolLabel}`,
        );
        if (orCards.length > 0)
          return NextResponse.json({ insights: orCards, slots: [], path: 'generic-tabular', fallback: 'openrouter' });
      } catch (orErr: any) {
        console.warn('[analyze-data] OpenRouter generic fallback failed:', orErr.message);
      }
    }

    // ── Tier 3: Pure-data auto-analysis — only possible if rows have Index-like columns ──
    // (e.g. Helium10 relevance scores, custom exports with index fields).
    // For Amazon BSR-only data this will produce 0 slots and gracefully fall through.
    const genericSlots = buildInsightSlots(rows);
    if (genericSlots.length > 0) {
      const autoCards = generateFallbackCards(genericSlots, toolLabel);
      if (autoCards.length > 0) {
        console.warn('[analyze-data] Using auto-analysis fallback for generic tabular data');
        return NextResponse.json({
          insights:  autoCards,
          slots:     genericSlots,
          path:      'generic-tabular',
          fallback:  'auto',
        });
      }
    }

    return NextResponse.json(
      { error: 'Could not generate insights. Please verify the data format and try again.', path: 'generic-tabular' },
      { status: 502 },
    );

  } catch (err: any) {
    console.error('[analyze-data]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
