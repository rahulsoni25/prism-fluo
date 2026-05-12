/**
 * scripts/regenerate_all_analyses.mjs
 *
 * Batch-regenerates EVERY analysis in the database using the latest pipeline
 * (Insight Strategist blueprint + chart Rules A/B + bucket classifier fixes).
 *
 * Use this once after deploying blueprint changes to bring every pre-existing
 * analysis up to investor-facing quality — so any client opening an OLD link
 * sees insights produced by the new code, not the old auto-analysis output.
 *
 * Idempotent: re-running re-runs the pipeline against the same source rows
 * and overwrites results_json again. Safe to invoke after every prompt change.
 *
 * USAGE
 *   node scripts/regenerate_all_analyses.mjs --base-url https://prism-fluo.vercel.app
 *   node scripts/regenerate_all_analyses.mjs --base-url https://prism-fluo.vercel.app --user-id <UUID>
 *   node scripts/regenerate_all_analyses.mjs --base-url https://prism-fluo.vercel.app --dry-run
 *   node scripts/regenerate_all_analyses.mjs --base-url https://prism-fluo.vercel.app --limit 5
 *   node scripts/regenerate_all_analyses.mjs --base-url https://prism-fluo.vercel.app --since 2025-10-01
 *
 * REQUIRES
 *   DATABASE_URL  — Postgres connection string (Supabase pooler URL)
 *   --base-url    — deployed PRISM URL where /api/ai/analyze-data is reachable
 *
 * Calls the unauthenticated /api/ai/analyze-data endpoint with the original
 * upload's rows, then writes the new results_json directly via SQL. Bypasses
 * the regenerate endpoint's per-user auth check so it can sweep every analysis.
 */

import pkg from 'pg';
const { Client } = pkg;

// ── Arg parsing ─────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) {
      const key = cur.slice(2);
      const val = arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true';
      acc.push([key, val]);
    }
    return acc;
  }, []),
);

const BASE_URL = args['base-url'] || process.env.BASE_URL;
const USER_ID  = args['user-id'] || null;
const DRY_RUN  = args['dry-run'] === 'true';
const LIMIT    = args.limit ? parseInt(args.limit, 10) : null;
const SINCE    = args.since || null;

if (!BASE_URL) {
  console.error('❌ Missing --base-url (e.g. --base-url https://prism-fluo.vercel.app)');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL env var required');
  process.exit(1);
}

// ── Connect ─────────────────────────────────────────────────────
const db = new Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
console.log(`✅ Connected to DB. Base URL: ${BASE_URL}`);
if (DRY_RUN) console.log('🟡 DRY RUN — no DB writes will happen.\n');

// ── Pick analyses to regenerate ─────────────────────────────────
const whereClauses = ['a.upload_id IS NOT NULL'];
const params = [];
if (USER_ID) {
  params.push(USER_ID);
  whereClauses.push(`a.user_id = $${params.length}`);
}
if (SINCE) {
  params.push(SINCE);
  whereClauses.push(`a.created_at >= $${params.length}`);
}
const sql = `
  SELECT a.id, a.upload_id, a.sheet_name, a.filename, a.brief_id, a.created_at, a.user_id
  FROM analyses a
  WHERE ${whereClauses.join(' AND ')}
  ORDER BY a.created_at DESC
  ${LIMIT ? `LIMIT ${LIMIT}` : ''}
`;
const { rows: analyses } = await db.query(sql, params);
console.log(`📋 Found ${analyses.length} analyses to process.\n`);

// ── Helpers ─────────────────────────────────────────────────────
async function loadSourceRows(uploadId, sheetName) {
  // 1. GWI shape (preferred)
  const gwi = await db.query(
    `SELECT time_bucket, audience, audience_pct, data_point_pct, universe, index_score, responses
       FROM gwi_time_spent
      WHERE upload_id = $1 AND sheet_name = $2`,
    [uploadId, sheetName],
  );
  if (gwi.rows.length > 0) {
    return gwi.rows.map(r => ({
      'Short Label Question': r.time_bucket,
      'Attributes':           r.audience,
      'Audience %':           r.audience_pct,
      'Data point %':         r.data_point_pct,
      'Universe':             r.universe,
      'Index':                r.index_score,
      'Responses':            r.responses,
    }));
  }
  // 2. Generic tool_data fallback
  const tool = await db.query(
    `SELECT row_data FROM tool_data
       WHERE upload_id = $1 AND sheet_name = $2
       ORDER BY id ASC LIMIT 2000`,
    [uploadId, sheetName],
  );
  return tool.rows.map(r => r.row_data);
}

async function callAnalyzeData({ rows, sheetName, fileNames, briefId }) {
  const res = await fetch(`${BASE_URL}/api/ai/analyze-data`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ rows, sheetName, fileNames, briefId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

// Build the same charts shape `insightsToCharts` produces. Replicated here so
// the script has no Next.js / TS build dependency — the shape is small and
// the chart styling is controlled by the deployed lib at render time anyway.
function insightCardsToCharts(insights, prefix) {
  return insights.map((ins, i) => ({
    id:           `gemini_regen-${prefix}_${i}`,
    type:         ins.type || 'hbar',
    xCol:         'Attributes',
    yCol:         'Audience %',
    title:        ins.title,
    lbl:          ins.chartTitle || '',
    source:       ins.toolLabel || 'PRISM',
    conviction:   ins.conviction ?? 85,
    obs:          ins.obs ?? '',
    stat:         ins.stat ?? '',
    rec:          ins.rec ?? '',
    bucket:       ins.bucket || 'content',
    toolLabel:    ins.toolLabel || 'PRISM',
    chartLabels:  ins.chartLabels ?? [],
    chartValues:  ins.chartValues ?? [],
    chartValues2: ins.chartValues2,
    chartSeries:  ins.chartSeries,
    // Note: computedChartData is rebuilt on the server side via the regenerate
    // endpoint. This batch script writes raw chartLabels/chartValues — the
    // insights page also handles that shape via its existing renderer fallback.
  }));
}

// ── Process each analysis ────────────────────────────────────────
let okCount = 0, skipCount = 0, errCount = 0;
const errors = [];
const startedAt = Date.now();

for (let i = 0; i < analyses.length; i++) {
  const a = analyses[i];
  const tag = `[${i + 1}/${analyses.length}] ${a.id.slice(0, 8)} · ${a.sheet_name?.slice(0, 40) ?? '<no sheet>'}`;
  process.stdout.write(`${tag} → `);

  try {
    const sourceRows = await loadSourceRows(a.upload_id, a.sheet_name);
    if (!sourceRows || sourceRows.length === 0) {
      console.log('⏭  no source rows (purged?), skipping');
      skipCount++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`✓ would regenerate (${sourceRows.length} rows)`);
      okCount++;
      continue;
    }

    const ai = await callAnalyzeData({
      rows:      sourceRows,
      sheetName: a.sheet_name,
      fileNames: [a.filename],
      briefId:   a.brief_id,
    });

    if (!Array.isArray(ai.insights) || ai.insights.length === 0) {
      console.log(`⚠  pipeline returned no insights (${ai.error ?? 'no error msg'})`);
      errCount++;
      errors.push({ id: a.id, reason: 'no insights' });
      continue;
    }

    // Merge results back into existing results_json so we preserve any other
    // fields (scorecards, strategicBrief, anomalies, etc.) the upload page set.
    const { rows: existingRows } = await db.query(
      'SELECT results_json FROM analyses WHERE id = $1',
      [a.id],
    );
    const existing = existingRows[0]?.results_json ?? {};
    const updated = {
      ...existing,
      charts:   insightCardsToCharts(ai.insights, Date.now()),
      overview: ai.overview ?? null,
      meta: {
        ...(existing.meta ?? {}),
        domain:        existing.meta?.domain ?? 'GWI',
        title:         existing.meta?.title  ?? a.sheet_name,
        cls:           existing.meta?.cls    ?? 'content',
        regeneratedAt: new Date().toISOString(),
      },
    };

    await db.query(
      'UPDATE analyses SET results_json = $1::jsonb WHERE id = $2',
      [JSON.stringify(updated), a.id],
    );
    console.log(`✓ ${ai.insights.length} cards${ai.fallback ? ` (${ai.fallback})` : ''}${ai.overview?.headline ? ' + headline' : ''}`);
    okCount++;
  } catch (err) {
    console.log(`✗ ${err.message}`);
    errCount++;
    errors.push({ id: a.id, reason: err.message });
  }
}

// ── Summary ──────────────────────────────────────────────────────
const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log('\n──────────────────────────────────────────');
console.log(`✅ Regenerated: ${okCount}`);
console.log(`⏭  Skipped:    ${skipCount}`);
console.log(`❌ Failed:     ${errCount}`);
console.log(`⏱  Elapsed:    ${elapsedSec}s`);
if (errors.length > 0) {
  console.log('\nFailures:');
  errors.forEach(e => console.log(`  ${e.id} → ${e.reason}`));
}

await db.end();
process.exit(errCount > 0 ? 1 : 0);
