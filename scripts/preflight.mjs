/**
 * scripts/preflight.mjs
 *
 * Local mirror of the GitHub Actions preflight job.
 * Run before pushing to main:   npm run preflight
 *
 * Steps:
 *   1. docker build -t prism-fluo:local .
 *   2. ensure local Postgres is up (docker compose up -d postgres)
 *   3. docker run the image with DATABASE_URL pointing at it
 *   4. poll /api/health until 200 or timeout (90s)
 *   5. tear down on success or failure
 *
 * Exits non-zero on any failure so you can chain it before `git push`.
 */

import { spawn, spawnSync } from 'node:child_process';

const IMAGE = 'prism-fluo:local';
const CONTAINER = 'prism-preflight';
const PORT = 3100; // avoid clashing with `next dev` on 3000

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.status !== 0) {
    console.error(`✗ ${cmd} ${args.join(' ')} → exit ${r.status}`);
    process.exit(r.status ?? 1);
  }
}

function tryRun(cmd, args) {
  spawnSync(cmd, args, { stdio: 'ignore' });
}

async function waitForHealth(url, attempts = 30, intervalMs = 3000) {
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const body = await res.json();
        console.log(`✓ ${url} → 200`, body);
        return true;
      }
      console.log(`attempt ${i}/${attempts}: HTTP ${res.status}`);
    } catch (err) {
      console.log(`attempt ${i}/${attempts}: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

async function main() {
  console.log('▶ preflight: building Docker image…');
  run('docker', ['build', '-t', IMAGE, '.']);

  console.log('▶ preflight: starting Postgres (docker compose)…');
  run('docker', ['compose', 'up', '-d', 'postgres']);

  // Cleanup any stale container from a previous run
  tryRun('docker', ['rm', '-f', CONTAINER]);

  console.log('▶ preflight: running container…');
  run('docker', [
    'run', '-d', '--name', CONTAINER,
    '-p', `${PORT}:3000`,
    '-e', 'NODE_ENV=production',
    '-e', 'PORT=3000',
    '-e', 'HOSTNAME=0.0.0.0',
    '-e', 'DATABASE_URL=postgres://prism:prism@host.docker.internal:5432/prism',
    '-e', 'GEMINI_API_KEY=preflight-placeholder',
    IMAGE,
  ]);

  console.log(`▶ preflight: polling http://localhost:${PORT}/api/health …`);
  const healthy = await waitForHealth(`http://localhost:${PORT}/api/health`);

  if (!healthy) {
    console.error('✗ preflight FAILED — /api/health never returned 200');
    console.error('--- container logs ---');
    spawnSync('docker', ['logs', CONTAINER], { stdio: 'inherit' });
    tryRun('docker', ['rm', '-f', CONTAINER]);
    process.exit(1);
  }

  console.log('✓ preflight PASSED');
  tryRun('docker', ['rm', '-f', CONTAINER]);
}

main().catch((err) => {
  console.error('✗ preflight crashed:', err);
  tryRun('docker', ['rm', '-f', CONTAINER]);
  process.exit(1);
});
