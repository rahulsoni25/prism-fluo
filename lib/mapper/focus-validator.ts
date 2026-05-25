/**
 * lib/mapper/focus-validator.ts
 *
 * Validates user-written "focus questions" against the actual columns +
 * source types present in the brief's uploaded data. Surfaces which
 * questions ARE answerable from the data and which AREN'T — so the user
 * sees gaps before clicking Generate Insights.
 *
 * Two flavors of user input handled:
 *   1. Question-shaped sentences ("What are top trending searches in Tier 2?")
 *      → mechanically scored against column headers + tool types
 *   2. Analytical direction ("Think about defending share vs attacking")
 *      → passes through verbatim as "thinking framing" for Gemini
 *
 * The validator's output feeds:
 *   (a) the Data Mapper UI (per-question chips)
 *   (b) the Gemini analyzer prompt (priority list with honest data limits)
 */

import { db } from '@/lib/db/client';
import { logger } from '@/lib/logger';

export type FocusStatus = 'answerable' | 'partial' | 'unanswerable' | 'direction';

export interface FocusQuestion {
  /** Raw user text — one question or directive per row. */
  question: string;
  /** Validation verdict. 'direction' = analytical framing, no data validation. */
  status:   FocusStatus;
  /** Human-readable why — surfaced as a chip tooltip in the UI. */
  reason:   string;
  /** Specific column names / source types that support this question. */
  supportedBy?: string[];
}

let _schemaReady = false;

async function ensureSchema(): Promise<void> {
  if (_schemaReady) return;
  _schemaReady = true;
  try {
    await db.query(`
      ALTER TABLE briefs
        ADD COLUMN IF NOT EXISTS focus_questions          JSONB DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS focus_questions_raw      TEXT,
        ADD COLUMN IF NOT EXISTS focus_questions_validated_at TIMESTAMPTZ
    `);
  } catch (err: any) {
    logger.warn('focus:schema_init_failed', { error: err.message });
  }
}

// ── Keyword maps — phrase → data needed ─────────────────────────────────

/** Topic-area keywords that signal which data sources are needed to answer.
 *  Each entry: a pattern the user might write, and the source types /
 *  column tokens that should be present in the upload to answer it. */
const TOPIC_RULES: Array<{ pattern: RegExp; needs: { sourceTypes?: string[]; columns?: string[]; toolTypes?: string[] }; label: string }> = [
  // Pricing / commercial intent
  { pattern: /\b(price|pricing|cost|cpc|bid|sensitivity|elasticity|wtp|willingness to pay|discount|promo)\b/i,
    needs: { columns: ['cpc', 'bid_low', 'bid_high', 'price', 'bsr'] },
    label: 'pricing/cost data' },

  // Trending / temporal
  { pattern: /\b(trend|trending|growth|growing|rising|declin|seasonality|90.day|three.month|quarterly|yoy)\b/i,
    needs: { columns: ['three_month_change', 'yoy_change'] },
    label: 'trend columns (3-month / YoY change)' },

  // Search / keyword
  { pattern: /\b(search|searches|keyword|queries|seo|sem|intent|long.?tail|short.?tail)\b/i,
    needs: { sourceTypes: ['keywords'] },
    label: 'keyword/search data' },

  // Audience demographics
  { pattern: /\b(tier ?\d|metro|small town|rural|age group|18.?24|25.?34|35.?44|female|male|gender|sec|income)\b/i,
    needs: { sourceTypes: ['gwi'], columns: ['audience'] },
    label: 'audience segmentation (GWI)' },

  // Genre / interest / consumption
  { pattern: /\b(genre|topic|interest|tv shows?|music|streaming|hotstar|netflix|prime|reels|youtube|content (consum|prefer))\b/i,
    needs: { sourceTypes: ['gwi'] },
    label: 'GWI genre / interest / streaming questions' },

  // Social / sentiment / SOV
  { pattern: /\b(social|sentiment|share of voice|sov|conversation|mention|brandwatch|konnect|meltwater|talkwalker)\b/i,
    needs: { sourceTypes: ['social', 'konnect'] },
    label: 'social listening data' },

  // E-commerce / shelf
  { pattern: /\b(amazon|flipkart|meesho|bsr|review|rating|shelf|listing|helium ?10)\b/i,
    needs: { sourceTypes: ['helium10', 'amazon-sales'] },
    label: 'e-commerce / Helium10 data' },

  // Competitor analysis
  { pattern: /\b(competitor|competit|vs |against|rival|adversary|market share)\b/i,
    needs: { columns: ['brand'] },
    label: 'competitor breakdown (needs competitors named in brief OR brand column in data)' },

  // Trends.google
  { pattern: /\b(google trends|trending quer|search interest|breakout)\b/i,
    needs: { sourceTypes: ['trends'] },
    label: 'Google Trends data' },
];

/** Question-shaped opener words. If a line starts with one of these AND
 *  matches no topic rule, it's still a question (just generic). If a line
 *  doesn't start with any of these and reads like a statement, treat as
 *  analytical direction. */
const QUESTION_OPENERS = ['what', 'which', 'how', 'why', 'when', 'where', 'who', 'is ', 'are ', 'do ', 'does ', 'should ', 'can ', 'could ', 'would '];
const DIRECTION_OPENERS = ['think', 'consider', 'frame', 'approach', 'lens', 'focus on', 'priorit', 'remember', 'keep in mind'];

function isDirectionStatement(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  if (DIRECTION_OPENERS.some(d => t.startsWith(d))) return true;
  // Imperatives without question marks read as direction
  if (!t.includes('?') && !QUESTION_OPENERS.some(q => t.startsWith(q))) {
    // Heuristic: if it has an imperative verb at start, it's direction
    const firstWord = t.split(/\s+/)[0];
    if (['build', 'use', 'apply', 'frame', 'cover', 'emphasize', 'avoid', 'skip', 'highlight'].includes(firstWord)) return true;
  }
  return false;
}

// ── Inspect what data the brief has ─────────────────────────────────────

interface BriefDataContext {
  sourceTypes: Set<string>;
  toolTypes:   Set<string>;
  columns:     Set<string>;  // every column name across every uploaded sheet (best-effort)
  hasCompetitorsListed: boolean;
}

async function loadBriefDataContext(briefId: string): Promise<BriefDataContext> {
  const ctx: BriefDataContext = {
    sourceTypes: new Set(),
    toolTypes:   new Set(),
    columns:     new Set(),
    hasCompetitorsListed: false,
  };

  // 1. Brief metadata
  const briefRes = await db.query(
    'SELECT competitors FROM briefs WHERE id = $1',
    [briefId],
  ).catch(() => ({ rows: [] as any[] }));
  if (briefRes.rows.length > 0) {
    ctx.hasCompetitorsListed = !!String(briefRes.rows[0].competitors || '').trim();
  }

  // 2. Non-superseded uploads + their source types
  const upRes = await db.query(
    `SELECT id, source_type FROM uploads WHERE brief_id = $1 AND superseded_by IS NULL`,
    [briefId],
  ).catch(() => ({ rows: [] as any[] }));
  for (const u of upRes.rows) {
    if (u.source_type) ctx.sourceTypes.add(String(u.source_type));
  }
  const uploadIds = upRes.rows.map((r: any) => r.id);
  if (uploadIds.length === 0) return ctx;

  // 3. Tool types from tool_data
  const ttRes = await db.query(
    `SELECT DISTINCT tool_type FROM tool_data WHERE upload_id = ANY($1::uuid[])`,
    [uploadIds],
  ).catch(() => ({ rows: [] as any[] }));
  for (const r of ttRes.rows) if (r.tool_type) ctx.toolTypes.add(String(r.tool_type).toLowerCase());

  // 4. Columns — sample row_data keys from tool_data + known schema columns
  const colRes = await db.query(
    `SELECT row_data FROM tool_data WHERE upload_id = ANY($1::uuid[]) LIMIT 5`,
    [uploadIds],
  ).catch(() => ({ rows: [] as any[] }));
  for (const r of colRes.rows) {
    if (r.row_data && typeof r.row_data === 'object') {
      for (const k of Object.keys(r.row_data)) ctx.columns.add(k.toLowerCase());
    }
  }

  // 5. Add known schema columns from the dedicated tables we DO query
  if (ctx.toolTypes.has('keyword_plan')) {
    ['keyword', 'avg_monthly_searches', 'competition', 'bid_low', 'bid_high', 'three_month_change', 'yoy_change', 'brand']
      .forEach(c => ctx.columns.add(c));
  }
  if (ctx.toolTypes.has('gwi_time_spent')) {
    ['audience', 'audience_pct', 'data_point_pct', 'universe', 'index_score', 'question_type']
      .forEach(c => ctx.columns.add(c));
  }

  return ctx;
}

// ── Validator ───────────────────────────────────────────────────────────

/** Validate a single line of focus text against the data context. */
function validateOne(line: string, ctx: BriefDataContext): FocusQuestion {
  const trimmed = line.trim();
  if (!trimmed) {
    return { question: trimmed, status: 'unanswerable', reason: 'Empty line' };
  }

  // 1. Direction statements pass through — they don't need data validation
  if (isDirectionStatement(trimmed)) {
    return {
      question: trimmed,
      status:   'direction',
      reason:   'Analytical framing — passed to Gemini as thinking direction (no data validation needed).',
    };
  }

  // 2. Match topic rules
  const matched: typeof TOPIC_RULES = [];
  for (const rule of TOPIC_RULES) {
    if (rule.pattern.test(trimmed)) matched.push(rule);
  }

  if (matched.length === 0) {
    // No topic detected — treat as a generic question, passes through with low confidence
    return {
      question: trimmed,
      status:   'partial',
      reason:   "Couldn't tag this to a specific data type — Gemini will attempt but coverage is uncertain.",
    };
  }

  // 3. For each matched rule, check if the required data exists
  const missingLabels: string[] = [];
  const supportedBy: string[] = [];
  for (const rule of matched) {
    let satisfied = true;
    const need = rule.needs;

    if (need.sourceTypes && need.sourceTypes.length > 0) {
      const has = need.sourceTypes.some(s => ctx.sourceTypes.has(s));
      if (!has) satisfied = false;
      else supportedBy.push(...need.sourceTypes.filter(s => ctx.sourceTypes.has(s)));
    }
    if (need.toolTypes && need.toolTypes.length > 0) {
      const has = need.toolTypes.some(t => ctx.toolTypes.has(t));
      if (!has) satisfied = false;
      else supportedBy.push(...need.toolTypes.filter(t => ctx.toolTypes.has(t)));
    }
    if (need.columns && need.columns.length > 0) {
      const has = need.columns.some(c => ctx.columns.has(c));
      if (!has) satisfied = false;
      else supportedBy.push(...need.columns.filter(c => ctx.columns.has(c)));
    }

    if (!satisfied) missingLabels.push(rule.label);
  }

  if (missingLabels.length === 0) {
    return {
      question:    trimmed,
      status:      'answerable',
      reason:      `Data available: ${[...new Set(supportedBy)].slice(0, 5).join(', ')}.`,
      supportedBy: [...new Set(supportedBy)],
    };
  }

  if (supportedBy.length > 0) {
    return {
      question:    trimmed,
      status:      'partial',
      reason:      `Partially answerable — have ${[...new Set(supportedBy)].slice(0, 3).join(', ')}, missing ${missingLabels.slice(0, 2).join(' AND ')}.`,
      supportedBy: [...new Set(supportedBy)],
    };
  }

  return {
    question: trimmed,
    status:   'unanswerable',
    reason:   `Data needed but missing: ${missingLabels.join(' AND ')}. Upload matching data first.`,
  };
}

/**
 * Parse raw multi-line text into individual focus items + validate each.
 * Splits on newlines AND sentence terminators so "Q1? Q2." becomes two items.
 */
export async function validateFocusQuestions(
  briefId: string,
  rawText: string,
): Promise<FocusQuestion[]> {
  await ensureSchema();
  const lines = rawText
    .split(/[\n\r]+/)
    .flatMap(l => l.split(/(?<=\?)(?:\s+)(?=[A-Z])/))
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 10); // cap to 10 — more than that is noise

  if (lines.length === 0) return [];

  const ctx = await loadBriefDataContext(briefId);
  return lines.map(line => validateOne(line, ctx));
}

/** Persist the validated questions on the brief. */
export async function saveFocusQuestions(
  briefId: string,
  rawText: string,
  validated: FocusQuestion[],
): Promise<void> {
  await ensureSchema();
  await db.query(
    `UPDATE briefs
       SET focus_questions = $1::jsonb,
           focus_questions_raw = $2,
           focus_questions_validated_at = NOW()
     WHERE id = $3`,
    [JSON.stringify(validated), rawText, briefId],
  ).catch(err => logger.warn('focus:save_failed', { briefId, error: err.message }));
}

/** Load previously-saved focus questions for a brief. */
export async function loadFocusQuestions(briefId: string): Promise<{ raw: string; questions: FocusQuestion[] } | null> {
  await ensureSchema();
  const res = await db.query(
    'SELECT focus_questions, focus_questions_raw FROM briefs WHERE id = $1',
    [briefId],
  ).catch(() => ({ rows: [] as any[] }));
  if (res.rows.length === 0) return null;
  return {
    raw:       res.rows[0].focus_questions_raw || '',
    questions: res.rows[0].focus_questions || [],
  };
}
