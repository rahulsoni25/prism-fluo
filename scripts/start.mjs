/**
 * scripts/start.mjs
 * Single entry-point for Railway. Avoids relying on shell `&&` chaining,
 * which Railway's startCommand parser does NOT evaluate (it execs the
 * tokens directly, so `&&` is passed as an argv to node).
 *
 * Order of operations:
 *   1. Run DB schema init (idempotent). Failure exits non-zero — Railway
 *      will retry per restartPolicy.
 *   2. import('./server.js') — Next.js standalone server. Runs in this
 *      same process, so logs flow to the same stream and there's no
 *      child-process boundary to lose.
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

function runScript(name, { failOnError = true } = {}) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, name);
    console.log(`[startup] running ${name}…`);
    const child = spawn(process.execPath, [scriptPath], {
      stdio: 'inherit',
      env: process.env,
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else if (failOnError) reject(new Error(`${name} exited with code ${code}`));
      else { console.warn(`[startup] ${name} exited ${code} — continuing`); resolve(); }
    });
    child.on('error', (err) => {
      if (failOnError) reject(err);
      else { console.warn(`[startup] ${name} error: ${err.message} — continuing`); resolve(); }
    });
  });
}

async function main() {
  try {
    await runScript('init_db.mjs');
  } catch (err) {
    console.error('[startup] init_db failed:', err.message);
    process.exit(1);
  }

  // Demo data seed — idempotent, never fatal. Skipped automatically once
  // the briefs table has rows, or if SEED_DEMO=false.
  await runScript('seed_demo.mjs', { failOnError: false });

  console.log(`[startup] launching Next.js server on ${process.env.HOSTNAME ?? '0.0.0.0'}:${process.env.PORT ?? '3000'}`);

  // Standalone server.js sits next to this WORKDIR (/app/server.js).
  // Importing it executes the server in the current process — no child,
  // no extra port binding, logs go to the same stdout.
  const serverPath = path.join(__dirname, '..', 'server.js');
  await import(serverPath);
}

main().catch((err) => {
  console.error('[startup] fatal:', err);
  process.exit(1);
});
