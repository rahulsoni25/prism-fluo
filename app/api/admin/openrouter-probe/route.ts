/**
 * GET /api/admin/openrouter-probe
 *
 * Live end-to-end diagnostic for the OpenRouter integration. Runs 5 sequential
 * checks and reports exactly which one fails — so the admin knows whether
 * the problem is the env var, the key value, account permissions, model
 * availability, or network.
 *
 * The 5 steps in order:
 *   1. env-present     — OPENROUTER_API_KEY is set and non-empty
 *   2. env-shape       — key looks like `sk-or-…` and length ≥ 40 chars
 *   3. dns-reachable   — openrouter.ai resolves + responds to a HEAD ping
 *   4. auth-valid      — GET /api/v1/key returns 200 (proves key is valid)
 *   5. chat-works      — POST /api/v1/chat/completions with 1 token returns
 *                        text (proves the cascade has at least one live model)
 *
 * Each step returns ok/error/elapsedMs. Stops at first failure (no point
 * running step 4 if step 3 failed). Total budget < 8 seconds.
 *
 * Admin-only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { getSession } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

async function checkAdmin(userId: string): Promise<boolean> {
  try {
    const { rows } = await db.query('SELECT email, is_admin FROM users WHERE id = $1', [userId]);
    const u = rows[0]; if (!u) return false;
    if (u.is_admin === true) return true;
    const list = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    return list.includes((u.email ?? '').toLowerCase());
  } catch { return false; }
}

interface Step { name: string; ok: boolean; elapsedMs: number; detail?: string; remediation?: string }

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; elapsedMs: number }> {
  const t0 = Date.now();
  const result = await fn();
  return { result, elapsedMs: Date.now() - t0 };
}

export async function GET(_req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!(await checkAdmin(session.userId)))
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 });

  const steps: Step[] = [];

  // ── STEP 1 — env var present ──────────────────────────────────
  const key = process.env.OPENROUTER_API_KEY?.trim() || '';
  if (!key) {
    steps.push({
      name: 'env-present', ok: false, elapsedMs: 0,
      detail: 'OPENROUTER_API_KEY env var is not set, or is an empty string.',
      remediation: 'Vercel → Settings → Environment Variables → set OPENROUTER_API_KEY for Production + Preview, then REDEPLOY (env changes only take effect on new deployments).',
    });
    return NextResponse.json({ steps, healthy: false, verdict: 'env-missing' });
  }
  steps.push({ name: 'env-present', ok: true, elapsedMs: 0, detail: `Length: ${key.length} chars` });

  // ── STEP 2 — key shape ────────────────────────────────────────
  if (key.length < 40) {
    steps.push({
      name: 'env-shape', ok: false, elapsedMs: 0,
      detail: `Key is ${key.length} chars — OpenRouter keys are ~70+. The value was likely truncated or saved as ""/" ".`,
      remediation: 'Re-paste the full key (sk-or-v1-…). Do NOT wrap it in quotes. Don\'t include trailing spaces or newlines.',
    });
    return NextResponse.json({ steps, healthy: false, verdict: 'env-malformed' });
  }
  if (key.startsWith('"') || key.startsWith("'")) {
    steps.push({
      name: 'env-shape', ok: false, elapsedMs: 0,
      detail: `Key starts with a quote character — Vercel stored it as a literal "${key.slice(0, 6)}..." instead of unwrapping. OpenRouter will reject this.`,
      remediation: 'Re-edit on Vercel WITHOUT wrapping quotes. Just paste the raw value.',
    });
    return NextResponse.json({ steps, healthy: false, verdict: 'env-quoted' });
  }
  if (!/^sk-or-/.test(key)) {
    steps.push({
      name: 'env-shape', ok: false, elapsedMs: 0,
      detail: `Key doesn't start with sk-or-. OpenRouter keys are sk-or-v1-… — you may have pasted an OpenAI or different provider's key.`,
      remediation: 'Generate a new key at https://openrouter.ai/keys (must start with sk-or-).',
    });
    return NextResponse.json({ steps, healthy: false, verdict: 'env-wrong-provider' });
  }
  steps.push({ name: 'env-shape', ok: true, elapsedMs: 0, detail: `Starts with sk-or-, length ${key.length}` });

  // ── STEP 3 — DNS / TLS / connectivity ────────────────────────
  try {
    const { result, elapsedMs } = await timed(() =>
      fetch(OPENROUTER_BASE + '/models', { method: 'HEAD' }).then(r => r.status)
    );
    if (result >= 500) {
      steps.push({
        name: 'dns-reachable', ok: false, elapsedMs,
        detail: `openrouter.ai returned ${result} on HEAD — provider may be down.`,
        remediation: 'Check status at https://status.openrouter.ai. Wait + retry; not a config issue on your side.',
      });
      return NextResponse.json({ steps, healthy: false, verdict: 'provider-down' });
    }
    steps.push({ name: 'dns-reachable', ok: true, elapsedMs, detail: `HEAD /models returned HTTP ${result}` });
  } catch (err: any) {
    steps.push({
      name: 'dns-reachable', ok: false, elapsedMs: 0,
      detail: `Network error reaching openrouter.ai: ${err.message}`,
      remediation: 'Check Vercel function region / outbound network. May be a serverless cold-start firewall issue — usually transient.',
    });
    return NextResponse.json({ steps, healthy: false, verdict: 'network-error' });
  }

  // ── STEP 4 — key validity via /key endpoint ──────────────────
  try {
    const { result, elapsedMs } = await timed(async () => {
      const r = await fetch(OPENROUTER_BASE + '/key', {
        headers: { Authorization: `Bearer ${key}` },
      });
      return { status: r.status, text: await r.text().catch(() => '') };
    });
    if (result.status === 401 || result.status === 403) {
      steps.push({
        name: 'auth-valid', ok: false, elapsedMs,
        detail: `Auth failed — ${result.status}. Body: ${result.text.slice(0, 200)}`,
        remediation: 'Key is invalid, revoked, or for a different account. Create a fresh key at https://openrouter.ai/keys.',
      });
      return NextResponse.json({ steps, healthy: false, verdict: 'auth-failed' });
    }
    if (result.status === 402) {
      steps.push({
        name: 'auth-valid', ok: false, elapsedMs,
        detail: `Payment required (HTTP 402). Body: ${result.text.slice(0, 200)}`,
        remediation: 'Free credits exhausted or paid balance depleted. Top up at https://openrouter.ai/credits.',
      });
      return NextResponse.json({ steps, healthy: false, verdict: 'credits-exhausted' });
    }
    if (result.status === 429) {
      steps.push({
        name: 'auth-valid', ok: false, elapsedMs,
        detail: `Rate-limited (HTTP 429) on key endpoint itself — unusual.`,
        remediation: 'Wait ~60 seconds and retry. If persistent, you may be hammering the API from another integration.',
      });
      return NextResponse.json({ steps, healthy: false, verdict: 'rate-limited' });
    }
    if (result.status !== 200) {
      steps.push({
        name: 'auth-valid', ok: false, elapsedMs,
        detail: `Unexpected HTTP ${result.status}. Body: ${result.text.slice(0, 200)}`,
        remediation: 'Check OpenRouter status. May be a temporary upstream issue.',
      });
      return NextResponse.json({ steps, healthy: false, verdict: 'unknown-error' });
    }
    let parsed: any = {};
    try { parsed = JSON.parse(result.text); } catch {}
    const keyInfo = parsed?.data ?? {};
    steps.push({
      name: 'auth-valid', ok: true, elapsedMs,
      detail: `Key valid. Label: "${keyInfo.label || '(unset)'}" · Limit: $${keyInfo.limit ?? '∞'} · Usage: $${(keyInfo.usage ?? 0).toFixed(4)}`,
    });
  } catch (err: any) {
    steps.push({
      name: 'auth-valid', ok: false, elapsedMs: 0,
      detail: `Threw: ${err.message}`,
      remediation: 'Likely transient. Retry.',
    });
    return NextResponse.json({ steps, healthy: false, verdict: 'network-error' });
  }

  // ── STEP 5 — actual chat completion ──────────────────────────
  try {
    const { result, elapsedMs } = await timed(async () => {
      const r = await fetch(OPENROUTER_BASE + '/chat/completions', {
        method: 'POST',
        headers: {
          Authorization:  `Bearer ${key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://prism-fluo.vercel.app',
          'X-Title':      'PRISM',
        },
        body: JSON.stringify({
          model:       'openai/gpt-oss-20b:free',
          messages:    [{ role: 'user', content: 'Reply with: ok' }],
          temperature: 0,
          max_tokens:  5,
        }),
      });
      return { status: r.status, text: await r.text().catch(() => '') };
    });
    if (result.status !== 200) {
      steps.push({
        name: 'chat-works', ok: false, elapsedMs,
        detail: `Chat completion returned HTTP ${result.status}. Body: ${result.text.slice(0, 300)}`,
        remediation: result.status === 404
          ? 'Test model ID not available — provider may have deprecated it. Code-level fix.'
          : 'Auth passed but chat failed — likely temporary model availability issue. Try again in a minute.',
      });
      return NextResponse.json({ steps, healthy: false, verdict: 'chat-failed' });
    }
    let parsed: any = {}; try { parsed = JSON.parse(result.text); } catch {}
    const reply = parsed?.choices?.[0]?.message?.content || '';
    steps.push({
      name: 'chat-works', ok: true, elapsedMs,
      detail: `Got a reply (${reply.length} chars): "${reply.slice(0, 40)}"`,
    });
  } catch (err: any) {
    steps.push({
      name: 'chat-works', ok: false, elapsedMs: 0,
      detail: `Threw: ${err.message}`,
    });
    return NextResponse.json({ steps, healthy: false, verdict: 'chat-failed' });
  }

  return NextResponse.json({ steps, healthy: true, verdict: 'all-systems-go' });
}
