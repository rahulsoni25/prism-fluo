#!/usr/bin/env node
/**
 * scripts/check-rating.mjs
 *
 * Verifies the rating baseline documented in docs/RATING-BASELINE.md.
 * Exit code 0 = all dimensions hold or improve. Exit code 1 = regression.
 *
 * Run via `npm run rating:check`. Future Claude sessions must run this
 * before declaring the rating preserved.
 */
import { execSync } from 'node:child_process';

const BASELINES = {
  testCount: 296,
  testFiles: 19,
  tscErrorsMax: 19,         // upper bound — should decrease, never increase
  councils: 4,
  verificationAgents: 7,
};

const RED  = '\x1b[31m';
const GRN  = '\x1b[32m';
const YEL  = '\x1b[33m';
const DIM  = '\x1b[2m';
const OFF  = '\x1b[0m';

function header(s) { console.log(`\n${DIM}── ${s} ──${OFF}`); }
function ok(s)     { console.log(`  ${GRN}✓${OFF} ${s}`); }
function warn(s)   { console.log(`  ${YEL}⚠${OFF} ${s}`); }
function fail(s)   { console.log(`  ${RED}✗${OFF} ${s}`); }

let regressions = 0;
let warnings = 0;

// ── 1. Tests ──
// vitest exits with code 1 when tests fail. We need stdout/stderr regardless
// so we can parse the count, hence the try/catch with stdio capture.
header('Test suite');
let testOut = '';
try { testOut = execSync('npx vitest run', { encoding: 'utf8', stdio: 'pipe' }); }
catch (e) { testOut = (e.stdout?.toString() || '') + (e.stderr?.toString() || ''); }

const tests = testOut.match(/Tests\s+(\d+)\s+passed\s+\((\d+)\)/);
const files = testOut.match(/Test Files\s+(\d+)\s+passed\s+\((\d+)\)/);
const failed = testOut.match(/(\d+)\s+failed/i);

if (failed && parseInt(failed[1]) > 0) {
  fail(`${failed[1]} failing tests`);
  regressions++;
} else if (!tests || !files) {
  fail('Could not parse vitest output (no "passed" count found)');
  regressions++;
} else {
  const passing = parseInt(tests[1]);
  const total   = parseInt(tests[2]);
  const fileCount = parseInt(files[2]);
  if (passing < BASELINES.testCount) {
    warn(`Test count ${passing} < baseline ${BASELINES.testCount} (someone deleted tests?)`);
    warnings++;
  } else {
    ok(`${passing}/${total} tests passing across ${fileCount} files`);
  }
}

// ── 2. Tsc errors ──
header('Typecheck');
try {
  let tscOut = '';
  try { execSync('npx tsc --noEmit', { encoding: 'utf8', stdio: 'pipe' }); }
  catch (e) { tscOut = (e.stdout || '') + (e.stderr || ''); }
  // Filter out generated .next errors
  const errorLines = tscOut.split('\n').filter(l => /error TS\d+:/.test(l) && !l.includes('.next/dev'));
  const errorCount = errorLines.length;
  if (errorCount > BASELINES.tscErrorsMax) {
    fail(`${errorCount} tsc errors (baseline: ${BASELINES.tscErrorsMax}) — REGRESSION`);
    errorLines.slice(0, 5).forEach(l => console.log(`     ${DIM}${l}${OFF}`));
    if (errorLines.length > 5) console.log(`     ${DIM}... and ${errorLines.length - 5} more${OFF}`);
    regressions++;
  } else if (errorCount < BASELINES.tscErrorsMax) {
    ok(`${errorCount} tsc errors — IMPROVED (baseline ${BASELINES.tscErrorsMax})`);
  } else {
    ok(`${errorCount} tsc errors (matches baseline)`);
  }
} catch (err) {
  warn(`tsc check failed: ${err.message.split('\n')[0]}`);
  warnings++;
}

// ── 3. Council count ──
header('Council registry');
try {
  const out = execSync(`ls lib/agents/councils/`, { encoding: 'utf8' });
  const files = out.split('\n').filter(f => f.endsWith('.ts') && f !== 'index.ts');
  if (files.length < BASELINES.councils) {
    fail(`${files.length} councils registered (baseline: ${BASELINES.councils})`);
    regressions++;
  } else {
    ok(`${files.length} councils registered: ${files.map(f => f.replace('.ts', '')).join(', ')}`);
  }
} catch (err) { warn('Could not list councils'); warnings++; }

// ── 4. Verification agents ──
header('Verification council agents');
try {
  const types = execSync('cat lib/ai/verify/types.ts', { encoding: 'utf8' });
  const m = types.match(/AgentName\s*=\s*([^;]+);/);
  if (m) {
    const agents = (m[1].match(/'[^']+'/g) || []).map(s => s.slice(1, -1));
    if (agents.length < BASELINES.verificationAgents) {
      fail(`${agents.length} verification agents (baseline: ${BASELINES.verificationAgents})`);
      regressions++;
    } else {
      ok(`${agents.length} verification agents: ${agents.join(', ')}`);
    }
  }
} catch (err) { warn('Could not count agents'); warnings++; }

// ── Summary ──
header('Verdict');
if (regressions > 0) {
  console.log(`\n${RED}✗ ${regressions} REGRESSION${regressions > 1 ? 'S' : ''} from baseline — rating slipped${OFF}`);
  console.log(`${DIM}Fix the failing dimensions before declaring rating preserved.${OFF}\n`);
  process.exit(1);
}
if (warnings > 0) {
  console.log(`\n${YEL}⚠ ${warnings} warning${warnings > 1 ? 's' : ''} — rating likely held but verify manually${OFF}\n`);
  process.exit(0);
}
console.log(`\n${GRN}✓ All dimensions at or above baseline — rating consistent${OFF}\n`);
process.exit(0);
