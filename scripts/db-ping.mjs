import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Analysis details
const a = await pool.query(`
  SELECT id, sheet_name, filename, upload_id, brief_id, created_at,
    jsonb_array_length(results_json->'charts') AS cc,
    results_json->'meta'->>'domain' AS domain,
    results_json->'overview'->>'headline' AS headline
  FROM analyses WHERE id = '280d765b-9da3-4065-8242-d86d3fd35f31'
`);
console.log('=== ANALYSIS ===');
a.rows.forEach(r => {
  console.log(`  filename: ${r.filename}`);
  console.log(`  upload:   ${r.upload_id}`);
  console.log(`  brief:    ${r.brief_id?.slice(0,8) ?? '—'}`);
  console.log(`  charts:   ${r.cc}`);
  console.log(`  domain:   ${r.domain ?? '—'}`);
  console.log(`  headline: ${r.headline ?? '(none)'}`);
});

// Cards — bucket + layer breakdown
const cards = await pool.query(`
  SELECT
    jsonb_array_elements(results_json->'charts')->>'title'  AS title,
    jsonb_array_elements(results_json->'charts')->>'bucket' AS bucket,
    jsonb_array_elements(results_json->'charts')->>'layer'  AS layer
  FROM analyses WHERE id = '280d765b-9da3-4065-8242-d86d3fd35f31'
`);
console.log(`\n=== CARDS (${cards.rowCount}) ===`);
cards.rows.forEach((r, i) => console.log(`  ${i+1}. [${r.bucket?.padEnd(13)} L${r.layer ?? '?'}] ${r.title?.slice(0, 95)}`));

// Bucket + layer histograms
const buckets = await pool.query(`
  SELECT bucket, COUNT(*) AS n FROM (
    SELECT jsonb_array_elements(results_json->'charts')->>'bucket' AS bucket
    FROM analyses WHERE id = '280d765b-9da3-4065-8242-d86d3fd35f31'
  ) t GROUP BY bucket ORDER BY n DESC
`);
console.log('\n=== BUCKETS ===');
buckets.rows.forEach(r => console.log(`  ${r.bucket?.padEnd(15)} ${r.n}`));

const layers = await pool.query(`
  SELECT layer, COUNT(*) AS n FROM (
    SELECT jsonb_array_elements(results_json->'charts')->>'layer' AS layer
    FROM analyses WHERE id = '280d765b-9da3-4065-8242-d86d3fd35f31'
  ) t GROUP BY layer ORDER BY layer
`);
console.log('\n=== LAYERS (1-8 expected if keyword path fired) ===');
layers.rows.forEach(r => console.log(`  layer=${r.layer ?? '(none)'} count=${r.n}`));

await pool.end();
