/**
 * GET /api/presentations/[id]/preflight
 *
 * Health-checks a presentation before the user triggers the download.
 * The endpoint runs in two windows:
 *
 *   FAST PASS  (≤ 1 second budget)
 *     • Row exists in DB
 *     • pptx_data column is non-null AND non-empty
 *     • Buffer starts with the ZIP magic (PPTX is a zip)
 *     • Buffer size is sane (> 4 KB, < 100 MB)
 *     • brief_name + template_name are present (for the filename)
 *
 *   AUTO-HEAL PASS  (≤ 3 second budget — fires only if fast pass fails)
 *     • If row missing → return 404 immediately (can't heal)
 *     • If pptx_data null/empty → flag the presentation row
 *       status='failed' and tell the client to regenerate
 *     • If pptx_data corrupt (bad ZIP header) → ditto
 *     • If file size suspicious → re-read from DB once more (race-condition
 *       insurance against a half-written upload)
 *
 * Response shape:
 *   { ok: true, ready: true, sizeBytes, filename }
 *   { ok: true, ready: false, reason: 'regenerate-needed', detail: '…' }
 *   { ok: false, status: 404|500, error: '…' }
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { getSession } from '@/lib/auth/server';
import { dualAgentVerify } from '@/lib/presentations/dual-agent-verify';

export const dynamic = 'force-dynamic';
export const maxDuration = 10;

// PPTX is a ZIP — first 4 bytes are PK\x03\x04
const ZIP_MAGIC = Buffer.from([0x50, 0x4B, 0x03, 0x04]);
const MIN_BYTES =   4 * 1024;      // 4 KB
const MAX_BYTES = 100 * 1024 * 1024; // 100 MB

interface PreflightVerdict {
  ok:        boolean;
  ready:     boolean;
  sizeBytes?: number;
  filename?:  string;
  reason?:    string;
  detail?:    string;
  /** How long the check took (ms). For observability. */
  elapsedMs?: number;
  /** Which pass produced the verdict: 'fast' (< 1s) or 'heal' (1–3s). */
  pass?: 'fast' | 'heal';
}

function looksLikePptx(buf: Buffer): boolean {
  return buf.length >= 4 && buf.subarray(0, 4).equals(ZIP_MAGIC);
}

function buildFilename(brief: string, template: string): string {
  const safe = (s: string) => (s || 'untitled').replace(/[^\w\d\-_]+/g, '_').slice(0, 80);
  return `${safe(brief)}_${safe(template)}.pptx`;
}

async function loadRow(id: string, userId: string) {
  const { rows } = await db.query(
    `SELECT id, brief_name, template_name, status, analysis_id,
            (pptx_data IS NOT NULL) AS has_data,
            octet_length(pptx_data) AS size_bytes,
            substring(pptx_data FROM 1 FOR 4) AS header
       FROM presentations
      WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)`,
    [id, userId],
  );
  return rows[0] ?? null;
}

async function loadFullBytes(id: string, userId: string): Promise<{ buffer: Buffer; analysisId: string | null; templateName: string | null } | null> {
  const { rows } = await db.query(
    `SELECT pptx_data, analysis_id, template_name FROM presentations WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)`,
    [id, userId],
  );
  if (rows.length === 0 || !rows[0].pptx_data) return null;
  const buf = Buffer.isBuffer(rows[0].pptx_data) ? rows[0].pptx_data : Buffer.from(rows[0].pptx_data);
  return { buffer: buf, analysisId: rows[0].analysis_id ?? null, templateName: rows[0].template_name ?? null };
}

async function markFailed(id: string, reason: string) {
  try {
    await db.query(
      `UPDATE presentations SET status = 'failed', updated_at = NOW() WHERE id = $1`,
      [id],
    );
  } catch { /* swallow */ }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const t0 = Date.now();
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, status: 401, error: 'Unauthenticated' }, { status: 401 });
  }

  // ── FAST PASS — single DB read, budget < 1 second ─────────────
  const fast: PreflightVerdict = await (async () => {
    const row = await loadRow(id, session.userId);
    if (!row) return { ok: false, ready: false, reason: 'not-found', detail: 'Presentation not found or not owned by user.' };
    if (!row.has_data) return { ok: true, ready: false, reason: 'no-data', detail: 'pptx_data is null — presentation was never stored.' };
    if (!row.size_bytes || row.size_bytes < MIN_BYTES) return { ok: true, ready: false, reason: 'too-small', detail: `pptx_data is ${row.size_bytes} bytes — below the ${MIN_BYTES}-byte sanity floor.` };
    if (row.size_bytes > MAX_BYTES) return { ok: true, ready: false, reason: 'too-large', detail: `pptx_data is ${row.size_bytes} bytes — above the ${MAX_BYTES}-byte ceiling.` };

    const header: Buffer | null = row.header ? Buffer.from(row.header) : null;
    if (!header || !looksLikePptx(header)) {
      return { ok: true, ready: false, reason: 'bad-header', detail: 'pptx_data does not start with the ZIP magic — file is corrupt.' };
    }
    if (!row.brief_name || !row.template_name) {
      return { ok: true, ready: false, reason: 'missing-name', detail: 'brief_name or template_name is empty — needed for download filename.' };
    }
    return {
      ok: true, ready: true,
      sizeBytes: Number(row.size_bytes),
      filename: buildFilename(row.brief_name, row.template_name),
    };
  })();

  if (fast.ready) {
    // ── DUAL-AGENT VERIFICATION ───────────────────────────────────
    // Visual Inspector + Content Council both must report clean.
    // Runs in parallel — typical < 1 second extra.
    const full = await loadFullBytes(id, session.userId);
    if (full) {
      let verdict = await dualAgentVerify(full.buffer, full.analysisId, full.templateName);

      // ── AUTOMOUS AUTO-RECOVERY ────────────────────────────────────
      // If the verdict says auto-recover, we kick off a regenerate of
      // the linked analysis (which the upstream council feedback will
      // tighten) and re-verify ONCE. Total added budget: ≤ 6 seconds.
      // If still bad → fall through to block.
      if (verdict.action === 'auto-recover' && full.analysisId) {
        try {
          // Fire the analysis regenerate in-process. This re-runs Gemini
          // with the council's feedback already saved, which tightens
          // titles + obs/stat consistency on the next pass.
          const regenHost = req.headers.get('host') ?? 'localhost:3000';
          const regenProto = regenHost.startsWith('localhost') ? 'http' : 'https';
          const regenRes = await fetch(
            `${regenProto}://${regenHost}/api/analyses/${full.analysisId}/regenerate`,
            { method: 'POST', headers: { cookie: req.headers.get('cookie') || '' } },
          ).catch(() => null);

          // Re-read bytes (the regenerate doesn't directly affect the deck
          // — only the source analysis — so the deck PPTX is unchanged
          // here. The recovery for visual blockers is upstream: next
          // /generate call will use cleaner cards.) For now we just
          // re-verify the existing deck — if regen succeeded, content
          // council will re-run automatically and feed back.
          const full2 = await loadFullBytes(id, session.userId);
          if (full2) {
            verdict = await dualAgentVerify(full2.buffer, full2.analysisId, full2.templateName);
          }
        } catch (e) {
          // Recovery failed — verdict stays as auto-recover with reason
        }
      }
      // Aggregate visual issues by kind so admins see "12 font-too-small,
      // 8 text-overflow" instead of an opaque "126 majors" count
      const visualByKind: Record<string, { blocker: number; major: number; minor: number }> = {};
      for (const i of verdict.visual.issues) {
        if (!visualByKind[i.kind]) visualByKind[i.kind] = { blocker: 0, major: 0, minor: 0 };
        visualByKind[i.kind][i.severity]++;
      }

      if (!verdict.ready) {
        const blockers = [
          ...verdict.visual.issues.filter(i => i.severity === 'blocker').map(i => `[visual/${i.kind}${i.slide ? `:slide${i.slide}` : ''}] ${i.detail}`),
          ...(verdict.content?.cards ?? [])
            .flatMap(c => c.findings.filter(f => f.verdict === 'confirmed' && f.severity === 'blocker'))
            .map(f => `[content/${f.agent}/${f.field}] ${f.issue}`),
        ].slice(0, 8);

        // ASK action is also "not ready" but the UI treats it differently
        // — user can force-proceed with a single click.
        return NextResponse.json({
          ok: true, ready: false, pass: 'dual-agent',
          reason: verdict.action === 'ask' ? 'review-needed' : 'verification-failed',
          detail: verdict.reasoning,
          action:     verdict.action,
          confidence: verdict.confidence,
          dualAgent: {
            visualBlockers: verdict.visual.issues.filter(i => i.severity === 'blocker').length,
            visualMajors:   verdict.visual.issues.filter(i => i.severity === 'major').length,
            contentBlockers: verdict.content?.summary?.bySeverity?.blocker ?? 0,
            contentMajors:   verdict.content?.summary?.bySeverity?.major ?? 0,
            recoverableBlockers: verdict.recoverableBlockers,
            slideCount: verdict.visual.slideCount,
            chartCount: verdict.visual.chartCount,
            templateName: verdict.visual.templateName,
            templateMatched: verdict.visual.templateMatched,
            visualByKind,
            contentNote: verdict.contentNote,
            sample: blockers,
          },
          elapsedMs: Date.now() - t0,
        });
      }

      // Both agents clean → download allowed
      return NextResponse.json({
        ...fast,
        pass: 'fast+dual-agent',
        action:     verdict.action,
        confidence: verdict.confidence,
        reasoning:  verdict.reasoning,
        elapsedMs:  Date.now() - t0,
        dualAgent: {
          visualClean: true,
          contentClean: verdict.combinedBlockers === 0,
          slideCount: verdict.visual.slideCount,
          chartCount: verdict.visual.chartCount,
          visualMajors:  verdict.visual.issues.filter(i => i.severity === 'major').length,
          contentMajors: verdict.content?.summary?.bySeverity?.major ?? 0,
          contentNote: verdict.contentNote,
          inspectorElapsedMs: verdict.visual.elapsedMs,
          totalElapsedMs:     verdict.elapsedMs,
        },
      });
    }

    // If we couldn't load bytes (shouldn't happen — fast pass already
    // confirmed they exist) fall through to plain ready response.
    return NextResponse.json({ ...fast, pass: 'fast', elapsedMs: Date.now() - t0 });
  }
  if (fast.reason === 'not-found') {
    return NextResponse.json({ ...fast, pass: 'fast', elapsedMs: Date.now() - t0 }, { status: 404 });
  }

  // ── AUTO-HEAL PASS — up to 3 second additional budget ─────────
  // Currently we can't regenerate the PPTX server-side without re-running
  // /api/presentations/generate (a 30-60s pipeline), so the heal we offer
  // is: (a) one retry-after-100ms in case the row was still being written
  // when the user clicked, (b) a status flip + actionable instruction
  // for the client to call /generate.

  const healDeadline = t0 + 3000; // total budget 3s including fast pass

  // (a) Race-condition retry — wait 200ms then re-read once. If pptx_data
  // landed between the first read and now, we're saved.
  await new Promise(r => setTimeout(r, 200));
  if (Date.now() < healDeadline) {
    const row2 = await loadRow(id, session.userId);
    if (row2?.has_data && row2.size_bytes > MIN_BYTES) {
      const header2: Buffer | null = row2.header ? Buffer.from(row2.header) : null;
      if (header2 && looksLikePptx(header2)) {
        return NextResponse.json({
          ok: true, ready: true, pass: 'heal',
          sizeBytes: Number(row2.size_bytes),
          filename: buildFilename(row2.brief_name, row2.template_name),
          elapsedMs: Date.now() - t0,
          detail: 'Recovered on retry — initial read happened before write completed.',
        });
      }
    }
  }

  // (b) Still bad. Mark the row failed so the UI can offer Regenerate.
  await markFailed(id, fast.reason || 'unknown');
  return NextResponse.json({
    ok: true, ready: false, pass: 'heal',
    reason: 'regenerate-needed',
    detail: `${fast.detail} The presentation row has been marked failed. Call /api/presentations/generate to rebuild it.`,
    elapsedMs: Date.now() - t0,
  });
}
