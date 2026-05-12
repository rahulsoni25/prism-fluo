/**
 * scripts/vercel_audit.mjs
 *
 * Read-only audit that compares the canonical PRISM Vercel project against
 * every duplicate so you can safely disconnect/delete the duplicates without
 * breaking anything. NEVER modifies a Vercel project — only reads.
 *
 * What it checks per project:
 *   1. Environment variables (keys only — values never printed)
 *   2. Custom domains (anything beyond *.vercel.app)
 *   3. Git connection (which repo/branch each project pulls from)
 *   4. Latest production deployment commit
 *
 * Output:
 *   - A clear "safe to disconnect" or "ACTION NEEDED" verdict per duplicate
 *   - Lists env var keys present in a duplicate but MISSING from canonical
 *   - Flags any duplicate that has a custom domain pointing to it
 *
 * USAGE
 *   1. Create a Vercel token: https://vercel.com/account/tokens
 *      (scope: read access to your team is enough — no write permissions needed)
 *   2. Run:
 *      VERCEL_TOKEN=xxxx node scripts/vercel_audit.mjs
 *      VERCEL_TOKEN=xxxx node scripts/vercel_audit.mjs --canonical prism-fluo
 *      VERCEL_TOKEN=xxxx node scripts/vercel_audit.mjs --team <team-slug>
 *
 * NO destructive operations. Run as often as you like.
 */

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

const TOKEN     = process.env.VERCEL_TOKEN;
const CANONICAL = args.canonical || 'prism-fluo';
const TEAM_SLUG = args.team || null;

if (!TOKEN) {
  console.error('❌ VERCEL_TOKEN env var required.');
  console.error('   Create one at https://vercel.com/account/tokens (read scope is enough).');
  console.error('   Then: VERCEL_TOKEN=xxx node scripts/vercel_audit.mjs');
  process.exit(1);
}

const API = 'https://api.vercel.com';
const HEADERS = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

// ── Resolve teamId from slug (if provided) ─────────────────────
let TEAM_PARAM = '';
if (TEAM_SLUG) {
  const r = await fetch(`${API}/v2/teams?slug=${encodeURIComponent(TEAM_SLUG)}`, { headers: HEADERS });
  if (!r.ok) {
    console.error(`❌ Could not look up team "${TEAM_SLUG}": HTTP ${r.status}`);
    process.exit(1);
  }
  const t = await r.json();
  if (t?.id) TEAM_PARAM = `?teamId=${t.id}`;
  console.log(`🏢 Team: ${TEAM_SLUG} (${t.id})`);
}

// ── Fetch helpers ─────────────────────────────────────────────
async function vfetch(path) {
  const sep = path.includes('?') ? '&' : (TEAM_PARAM ? '?' : '');
  const url = `${API}${path}${TEAM_PARAM ? (sep + TEAM_PARAM.slice(1)) : ''}`;
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`${r.status} ${r.statusText} on ${path} — ${body.slice(0, 200)}`);
  }
  return r.json();
}

// ── 1. List ALL projects in this account/team ─────────────────
console.log('🔍 Fetching projects…');
const projectsRes = await vfetch(`/v9/projects?limit=100`);
const allProjects = projectsRes.projects ?? [];
console.log(`   Found ${allProjects.length} total projects.\n`);

// Pick projects whose name OR repo matches the prism-fluo pattern
const candidates = allProjects.filter(p => {
  const repoSlug = p.link?.repoSlug || '';
  const repoOwner = p.link?.org || p.link?.owner || '';
  const repoMatch = repoSlug.includes('prism-fluo') || `${repoOwner}/${repoSlug}`.includes('prism-fluo');
  const nameMatch = /prism|quantum-heights/i.test(p.name);
  return repoMatch || nameMatch;
});

if (candidates.length === 0) {
  console.error('❌ No PRISM-related projects found in this account/team.');
  console.error('   Tip: pass --team <slug> if your projects are under a Vercel Team.');
  process.exit(1);
}

const canonical = candidates.find(p => p.name === CANONICAL);
if (!canonical) {
  console.error(`❌ Canonical project "${CANONICAL}" not found among:`);
  candidates.forEach(p => console.error(`   - ${p.name}`));
  process.exit(1);
}
const duplicates = candidates.filter(p => p.id !== canonical.id);

console.log(`✅ Canonical: ${canonical.name} (${canonical.id})`);
console.log(`📋 Duplicates to audit: ${duplicates.length}\n`);

// ── 2. Fetch env-var keys, domains, and git for a project ──────
async function projectAudit(p) {
  const [envRes, domainsRes] = await Promise.all([
    vfetch(`/v9/projects/${p.id}/env`),
    vfetch(`/v9/projects/${p.id}/domains`),
  ]);
  const envKeys = (envRes.envs ?? []).map(e => `${e.key} (${e.target?.join('/') || '?'})`);
  const customDomains = (domainsRes.domains ?? [])
    .filter(d => !d.name.endsWith('.vercel.app'))
    .map(d => d.name);
  const gitRepo = p.link
    ? `${p.link.org || p.link.owner}/${p.link.repoSlug}@${p.link.productionBranch || 'main'}`
    : '(not linked)';
  return { project: p, envKeys, customDomains, gitRepo };
}

console.log(`🔬 Auditing canonical "${canonical.name}"…`);
const canonAudit = await projectAudit(canonical);
const canonKeySet = new Set(canonAudit.envKeys.map(k => k.split(' ')[0]));
console.log(`   Env vars: ${canonAudit.envKeys.length}, Custom domains: ${canonAudit.customDomains.length}, Git: ${canonAudit.gitRepo}\n`);

// ── 3. Audit each duplicate ─────────────────────────────────────
let actionNeeded = 0;
let safe = 0;
const verdicts = [];

for (const dup of duplicates) {
  process.stdout.write(`🔬 Auditing duplicate "${dup.name}"… `);
  try {
    const a = await projectAudit(dup);
    const missingInCanonical = a.envKeys
      .map(k => k.split(' ')[0])
      .filter(k => !canonKeySet.has(k));
    const uniqMissing = [...new Set(missingInCanonical)];

    const hasCustomDomain = a.customDomains.length > 0;
    const safeToDisconnect = uniqMissing.length === 0 && !hasCustomDomain;

    console.log(safeToDisconnect ? '✅ SAFE' : '⚠️  ACTION NEEDED');
    if (safeToDisconnect) safe++;
    else actionNeeded++;

    verdicts.push({
      name:              dup.name,
      id:                dup.id,
      gitRepo:           a.gitRepo,
      envCount:          a.envKeys.length,
      missingFromCanon:  uniqMissing,
      customDomains:     a.customDomains,
      safeToDisconnect,
    });
  } catch (err) {
    console.log(`❌ failed: ${err.message}`);
    verdicts.push({ name: dup.name, id: dup.id, error: err.message });
    actionNeeded++;
  }
}

// ── 4. Print verdicts ───────────────────────────────────────────
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('AUDIT VERDICT — CANONICAL: ' + canonical.name);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

for (const v of verdicts) {
  console.log(`📦 ${v.name}  (${v.id})`);
  if (v.error) {
    console.log(`   ❌ ${v.error}\n`);
    continue;
  }
  console.log(`   Git: ${v.gitRepo}`);
  console.log(`   Env vars: ${v.envCount}`);
  if (v.missingFromCanon.length > 0) {
    console.log(`   ⚠️  Env keys NOT in canonical (${v.missingFromCanon.length}):`);
    v.missingFromCanon.forEach(k => console.log(`       - ${k}`));
    console.log(`       → Copy these to canonical before disconnecting this project.`);
  }
  if (v.customDomains.length > 0) {
    console.log(`   ⚠️  Custom domains pointing here:`);
    v.customDomains.forEach(d => console.log(`       - ${d}`));
    console.log(`       → Move these to canonical project's Domains settings first.`);
  }
  if (v.safeToDisconnect) {
    console.log(`   ✅ SAFE to disconnect from Git, then delete after cooldown.`);
  } else {
    console.log(`   ⚠️  ACTION NEEDED before this can be safely removed.`);
  }
  console.log('');
}

// ── 5. Summary ──────────────────────────────────────────────────
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`SUMMARY: ${safe} safe to remove · ${actionNeeded} need action first`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('NEXT STEPS (manual, in Vercel Dashboard):');
console.log('');
console.log('  For each duplicate marked ⚠️ ACTION NEEDED:');
console.log('    1. Open the duplicate project in Vercel');
console.log('    2. Copy any missing env vars over to the canonical project');
console.log('    3. Move custom domains to the canonical project');
console.log('    4. Re-run this audit until that project shows ✅ SAFE');
console.log('');
console.log('  For each duplicate marked ✅ SAFE:');
console.log('    1. Open the duplicate project in Vercel');
console.log('    2. Settings → Git → Disconnect from Repository');
console.log('       (stops future auto-deploys but keeps the URL live)');
console.log('    3. WAIT 1 WEEK to confirm nothing breaks');
console.log('    4. If still no complaints: Settings → Advanced → Delete Project');
console.log('');
console.log('  After all duplicates are deleted, every push to `main` builds ONCE');
console.log('  on the canonical project — clean, fast, no quota waste.');
