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

function runInit() {
  return new Promise((resolve, reject) => {
    const initPath = path.join(__dirname, 'init_db.mjs');
    console.log('[startup] running init_db…');
    const child = spawn(process.execPath, [initPath], {
      stdio: 'inherit',
      env: process.env,
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`init_db exited with code ${code}`));
    });
    child.on('error', reject);
  });
}

async function main() {
  try {
    await runInit();
  } catch (err) {
    console.error('[startup] init_db failed:', err.message);
    process.exit(1);
  }

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
