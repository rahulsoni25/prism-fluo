/**
 * lib/mapper/data-completeness.ts
 *
 * Proactive gap analyzer — surfaces what's MISSING from the brief's
 * uploaded data so the user can fix it BEFORE clicking Generate. Different
 * from focus-validator (which checks user-written questions); this checks
 * SYSTEM-EXPECTED data types against what's uploaded.
 *
 * Output: ranked list of gaps with severity (HIGH / MEDIUM / LOW) and a
 * suggested fix per gap.
 */

import { db } from '@/lib/db/client';

export type GapSeverity = 'high' | 'medium' | 'low';

export interface DataGap {
  id:        string;          // stable id (e.g. 'no-social-data')
  title:     string;          // headline for UI
  severity:  GapSeverity;
  impacts:   string[];        // which nuggets / cards won't populate
  suggestion: string;         // what to upload
  /** If true, this gap directly blocks a specific feature shipped today. */
  blocksFeature?: string;
}

export interface DataCompletenessReport {
  briefId:       string;
  sourcesPresent: string[];   // distinct source types uploaded
  toolTypesPresent: string[]; // distinct tool types
  gaps:          DataGap[];   // ranked high → low
  score:         number;      // 0-100, share of "high-value" data types present
}

// ── Gap catalog — what we expect, why it matters ────────────────────────

interface GapRule {
  id:          string;
  title:       string;
  /** Returns true if this gap APPLIES (i.e. data is missing). */
  detect:      (ctx: ScanContext) => boolean;
  severity:    GapSeverity;
  impacts:     string[];
  suggestion:  string;
  blocksFeature?: string;
}

interface ScanContext {
  sourceTypes: Set<string>;
  toolTypes:   Set<string>;
  gwiQuestionTypes: Set<string>;  // tv_genres / content_topics / etc.
  hasKeywordTrendCols: boolean;
  briefHasCompetitors: boolean;
  briefHasObjective: boolean;
  briefAudienceText: string;
  // Audience-on-GWI match: extracted from GWI rows
  gwiAudiences: Set<string>;
}

const GAP_RULES: GapRule[] = [
  // ── HIGH ──
  {
    id:        'no-audience-data',
    title:     'No audience psychographics uploaded',
    detect:    ctx => !ctx.sourceTypes.has('gwi'),
    severity:  'high',
    impacts:   ['Market Pyramid context will use brief defaults only',
                'Audience Snapshot will be generic',
                'Cultural/identity insights will be thin'],
    suggestion:'Upload a GWI export (any question type — Time Spent, Interests, etc.) to ground audience cards in real survey data.',
  },
  {
    id:        'no-search-data',
    title:     'No search/keyword data uploaded',
    detect:    ctx => !ctx.sourceTypes.has('keywords'),
    severity:  'high',
    impacts:   ['Keyword Intent nugget will not populate',
                'No view of category demand or competitor SOV in search'],
    suggestion:'Upload a Google Keyword Planner export with the category + brand keywords for the brief.',
    blocksFeature: 'Keyword Intent nugget',
  },

  // ── MEDIUM ──
  {
    id:        'no-genre-data',
    title:     'No GWI genre / interest data',
    detect:    ctx => ctx.sourceTypes.has('gwi') &&
                     !ctx.gwiQuestionTypes.has('tv_genres') &&
                     !ctx.gwiQuestionTypes.has('content_topics') &&
                     !ctx.gwiQuestionTypes.has('music_genres') &&
                     !ctx.gwiQuestionTypes.has('streaming_services'),
    severity:  'medium',
    impacts:   ['Content Genres They Prefer nugget will stay empty'],
    suggestion:'In GWI, export "TV genres watched", "Personal interests", "Music genres", or "Streaming services used" — any one populates the genre nugget.',
    blocksFeature: 'Content Genres nugget',
  },
  {
    id:        'no-keyword-trend-cols',
    title:     'Keyword data missing trend columns',
    detect:    ctx => ctx.sourceTypes.has('keywords') && !ctx.hasKeywordTrendCols,
    severity:  'medium',
    impacts:   ['"Trending queries (last 90 days)" section in Keyword Intent will be empty'],
    suggestion:'Re-export from Google Keyword Planner with "Three month change" + "YoY change" columns selected.',
    blocksFeature: 'Trending Queries (last 90 days)',
  },
  {
    id:        'no-social-data',
    title:     'No social listening data',
    detect:    ctx => !ctx.sourceTypes.has('social') && !ctx.sourceTypes.has('konnect'),
    severity:  'medium',
    impacts:   ['Brand sentiment + share-of-voice cards will be weak or missing',
                'No view of organic conversation themes'],
    suggestion:'Upload a Konnect / Brandwatch / Meltwater export to add conversation + sentiment insights.',
  },
  {
    id:        'no-competitors-listed',
    title:     'No competitors named in brief',
    detect:    ctx => !ctx.briefHasCompetitors,
    severity:  'medium',
    impacts:   ['Brand-isolation agent can\'t allow competitor mentions in cards',
                'Competitor-steal opportunities won\'t surface',
                'Search SOV breakdown will be brand-only'],
    suggestion:'Add competitor names in the brief edit page (e.g. "Tide, Surf Excel, Wheel") so the analysis can frame against the right rivals.',
  },

  // ── LOW ──
  {
    id:        'no-amazon-data',
    title:     'No marketplace / Helium10 data',
    detect:    ctx => !ctx.sourceTypes.has('helium10') && !ctx.sourceTypes.has('amazon-sales'),
    severity:  'low',
    impacts:   ['No shelf-position cards', 'BSR / reviews not represented'],
    suggestion:'Upload a Helium10 export OR Amazon sales sheet if e-commerce shelf is in scope.',
  },
  {
    id:        'no-trends-data',
    title:     'No Google Trends data',
    detect:    ctx => !ctx.sourceTypes.has('trends'),
    severity:  'low',
    impacts:   ['Rising/declining queries from Trends won\'t triangulate with Keyword Planner'],
    suggestion:'Upload Google Trends CSV if you want a second signal on temporal demand shifts.',
  },
  {
    id:        'no-brief-objective',
    title:     'Brief objective is empty',
    detect:    ctx => !ctx.briefHasObjective,
    severity:  'low',
    impacts:   ['Cards lack a clear "what to do" frame; recs may be generic'],
    suggestion:'Set a clear objective on the brief (e.g. "Defend metro share against Ariel\'s premium push").',
  },
];

// ── Scanner ─────────────────────────────────────────────────────────────

async function loadScanContext(briefId: string): Promise<ScanContext> {
  const ctx: ScanContext = {
    sourceTypes: new Set(),
    toolTypes:   new Set(),
    gwiQuestionTypes: new Set(),
    hasKeywordTrendCols: false,
    briefHasCompetitors: false,
    briefHasObjective: false,
    briefAudienceText: '',
    gwiAudiences: new Set(),
  };

  // Brief metadata
  const briefRes = await db.query(
    `SELECT competitors, objective, gender, age_ranges, geography FROM briefs WHERE id = $1`,
    [briefId],
  ).catch(() => ({ rows: [] as any[] }));
  if (briefRes.rows[0]) {
    ctx.briefHasCompetitors = !!String(briefRes.rows[0].competitors || '').trim();
    ctx.briefHasObjective   = !!String(briefRes.rows[0].objective || '').trim();
    ctx.briefAudienceText   = [briefRes.rows[0].gender, briefRes.rows[0].age_ranges, briefRes.rows[0].geography]
      .filter(Boolean).join(' · ');
  }

  // Non-superseded uploads + source types
  const upRes = await db.query(
    `SELECT id, source_type FROM uploads WHERE brief_id = $1 AND superseded_by IS NULL`,
    [briefId],
  ).catch(() => ({ rows: [] as any[] }));
  for (const u of upRes.rows) {
    if (u.source_type) ctx.sourceTypes.add(String(u.source_type));
  }
  const uploadIds = upRes.rows.map((r: any) => r.id);

  if (uploadIds.length > 0) {
    // Tool types
    const ttRes = await db.query(
      `SELECT DISTINCT tool_type FROM tool_data WHERE upload_id = ANY($1::uuid[])`,
      [uploadIds],
    ).catch(() => ({ rows: [] as any[] }));
    for (const r of ttRes.rows) if (r.tool_type) ctx.toolTypes.add(String(r.tool_type).toLowerCase());

    // GWI question types (from gwi_time_spent.question_type)
    const qtRes = await db.query(
      `SELECT DISTINCT question_type FROM gwi_time_spent WHERE upload_id = ANY($1::uuid[]) AND question_type IS NOT NULL`,
      [uploadIds],
    ).catch(() => ({ rows: [] as any[] }));
    for (const r of qtRes.rows) if (r.question_type) ctx.gwiQuestionTypes.add(String(r.question_type));

    // GWI audiences (for audience-match gap)
    const audRes = await db.query(
      `SELECT DISTINCT audience FROM gwi_time_spent WHERE upload_id = ANY($1::uuid[]) AND audience IS NOT NULL`,
      [uploadIds],
    ).catch(() => ({ rows: [] as any[] }));
    for (const r of audRes.rows) if (r.audience) ctx.gwiAudiences.add(String(r.audience));

    // Keyword trend columns present?
    const tcRes = await db.query(
      `SELECT COUNT(*)::int AS n FROM keywords
        WHERE upload_id = ANY($1::uuid[])
          AND three_month_change IS NOT NULL`,
      [uploadIds],
    ).catch(() => ({ rows: [{ n: 0 }] }));
    ctx.hasKeywordTrendCols = (tcRes.rows[0]?.n ?? 0) > 0;
  }

  return ctx;
}

export async function analyzeDataCompleteness(briefId: string): Promise<DataCompletenessReport> {
  const ctx = await loadScanContext(briefId);

  const gaps: DataGap[] = [];
  for (const rule of GAP_RULES) {
    if (rule.detect(ctx)) {
      gaps.push({
        id:         rule.id,
        title:      rule.title,
        severity:   rule.severity,
        impacts:    rule.impacts,
        suggestion: rule.suggestion,
        blocksFeature: rule.blocksFeature,
      });
    }
  }

  // Sort: high → medium → low
  const sevRank: Record<GapSeverity, number> = { high: 0, medium: 1, low: 2 };
  gaps.sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);

  // Score: 100 = no gaps; deduct 20 per high, 10 per medium, 3 per low
  let score = 100;
  for (const g of gaps) {
    score -= g.severity === 'high' ? 20 : g.severity === 'medium' ? 10 : 3;
  }
  score = Math.max(0, score);

  return {
    briefId,
    sourcesPresent:   Array.from(ctx.sourceTypes).sort(),
    toolTypesPresent: Array.from(ctx.toolTypes).sort(),
    gaps,
    score,
  };
}
