/**
 * /api/briefs
 * GET  — list all briefs
 * POST — create a new brief
 *
 * After creating a brief, invalidates the dashboard overview cache so the
 * next dashboard load reflects the new entry immediately.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { cache } from '@/lib/cache';
import { logger } from '@/lib/logger';
import { calculateSla } from '@/lib/sla.server';
import { getSession } from '@/lib/auth/server';

const VALID_STATUSES = ['draft', 'waiting_for_data', 'processing', 'ready'];
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PostgREST fallback — used when pg.Pool cannot reach the DB directly
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

async function insertBriefViaRest(payload) {
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/briefs`, {
      method: 'POST',
      headers: {
        'apikey':        SUPA_KEY,
        'Authorization': `Bearer ${SUPA_KEY}`,
        'Content-Type':  'application/json',
        'Prefer':        'return=representation',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) { const e = await res.text(); console.error('PostgREST brief insert failed:', e); return null; }
    const rows = await res.json();
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch (e) {
    console.error('PostgREST fetch error:', e.message);
    return null;
  }
}

async function listBriefsViaRest(userIds) {
  try {
    // userIds is an array; build an IN filter for PostgREST
    const validIds = userIds.filter(id => UUID_REGEX.test(id));
    let filter;
    if (validIds.length === 0) {
      filter = 'user_id=is.null';
    } else if (validIds.length === 1) {
      filter = `user_id=eq.${validIds[0]}`;
    } else {
      filter = `user_id=in.(${validIds.join(',')})`;
    }
    const res = await fetch(`${SUPA_URL}/rest/v1/briefs?${filter}&order=created_at.desc&limit=200`, {
      headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

/**
 * Resolve all known user IDs for a session.
 * Returns a deduplicated array of UUIDs ordered with the most canonical first:
 * 1. Email-resolved UUID from pg (authoritative DB row)
 * 2. Email-resolved UUID from PostgREST (fallback)
 * 3. Session userId (last resort — may be an email-hash fallback UUID)
 *
 * pg and PostgREST lookups run CONCURRENTLY to minimise latency.
 * Results are cached for 5 minutes so repeated requests within a session
 * hit the in-memory cache instead of making DB round-trips every time.
 */
async function resolveUserIds(session) {
  // ── Cache check ──────────────────────────────────────────────────────────
  const cacheKey = `resolve_user:${session.email ?? session.userId}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const ordered = [];   // canonical first
  const seen   = new Set();

  const push = (id) => {
    if (id && UUID_REGEX.test(id) && !seen.has(id)) { seen.add(id); ordered.push(id); }
  };

  // ── Run pg + PostgREST lookups in PARALLEL ───────────────────────────────
  const [pgResult, restResult] = await Promise.allSettled([
    session.email
      ? db.query('SELECT id FROM users WHERE email = $1 LIMIT 5', [session.email])
      : Promise.resolve({ rows: [] }),
    session.email
      ? fetch(
          `${SUPA_URL}/rest/v1/users?email=eq.${encodeURIComponent(session.email)}&select=id&limit=5`,
          { headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` } }
        ).then(r => r.ok ? r.json() : []).catch(() => [])
      : Promise.resolve([]),
  ]);

  // pg result wins on ordering (most canonical)
  if (pgResult.status === 'fulfilled') {
    pgResult.value?.rows?.forEach(r => push(r.id));
  }
  // PostgREST fills any gaps
  if (restResult.status === 'fulfilled' && Array.isArray(restResult.value)) {
    restResult.value.forEach(u => push(u.id));
  }

  // Session userId as final fallback (may be email-hash UUID)
  push(session.userId);

  // ── Cache for 5 minutes ──────────────────────────────────────────────────
  if (ordered.length > 0) cache.set(cacheKey, ordered, 300);

  return ordered;
}

/**
 * GET /api/briefs
 * Optional filters via query string:
 *   ?status=ready,processing      — comma-separated list
 *   ?brand=Nike                   — case-insensitive partial match
 *   ?from=2026-04-01              — created_at >= ISO date
 *   ?to=2026-04-30                — created_at <= ISO date
 */
export async function GET(request) {
  const t0 = Date.now();
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

    const url = new URL(request.url);

    // Resolve ALL known UUIDs for this user so briefs stored under any of them
    // (session fallback UUID or real UUID) are all returned.
    const userIds = await resolveUserIds(session);

    let where, args;
    if (userIds.length === 0) {
      where = ['(user_id IS NULL)'];
      args  = [];
    } else if (userIds.length === 1) {
      where = ['user_id = $1'];
      args  = [userIds[0]];
    } else {
      where = [`user_id = ANY($1::uuid[])`];
      args  = [userIds];
    }

    const status = url.searchParams.get('status');
    if (status) {
      const list = status.split(',').map(s => s.trim()).filter(s => VALID_STATUSES.includes(s));
      if (list.length > 0) {
        args.push(list);
        where.push(`status = ANY($${args.length}::text[])`);
      }
    }

    const brand = url.searchParams.get('brand');
    if (brand?.trim()) {
      args.push(`%${brand.trim()}%`);
      where.push(`brand ILIKE $${args.length}`);
    }

    const from = url.searchParams.get('from');
    if (from) { args.push(from); where.push(`created_at >= $${args.length}`); }

    const to = url.searchParams.get('to');
    if (to)   { args.push(to);   where.push(`created_at <= $${args.length}`); }

    const sql = `
      SELECT id, brand, category, objective, status, age_ranges, gender, market,
             analysis_id, created_at,
             sla_hours, sla_due_at, actual_completed_at
        FROM briefs
        WHERE ${where.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT 200`;

    const pgList = await logger.query('briefs:list', () => db.query(sql, args));
    let rows = pgList.rows;

    // If pg returned nothing (could be DB unreachable, not just empty table),
    // try PostgREST as a fallback so the UI always shows real data.
    if (rows.length === 0) {
      const restRows = await listBriefsViaRest(userIds);
      if (restRows && restRows.length > 0) rows = restRows;
    }

    logger.info('api:GET /api/briefs', { ms: Date.now() - t0, count: rows.length, resolvedIds: userIds.length });
    return NextResponse.json(rows, {
      headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' },
    });
  } catch (err) {
    logger.error('api:GET /api/briefs failed', { error: err.message });
    return NextResponse.json({ error: 'FETCH_FAILED', message: 'Failed to fetch briefs' }, { status: 500 });
  }
}

export async function POST(request) {
  const t0 = Date.now();
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

    const body = await request.json();
    const {
      brand, category, objective,
      age_ranges, gender, sec,
      market, geography,
      competitors, background,
      insight_buckets,
      status = 'waiting_for_data',  // default new brief: waiting for data upload
    } = body;

    if (!brand?.trim()) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'brand is required' },
        { status: 400 }
      );
    }

    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: `status must be one of ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    // Deterministic SLA — under-promise, over-deliver
    let slaHours = 24, slaDueAt = new Date(Date.now() + 24 * 3600000).toISOString();
    try {
      const slaResult = await calculateSla();
      if (slaResult?.slaHours) {
        slaHours = slaResult.slaHours;
        slaDueAt = slaResult.slaDueAt;
      }
    } catch (slaErr) {
      console.warn('⚠️ SLA calculation failed, using defaults', { error: slaErr.message });
      // Keep defaults
    }

    // Resolve the canonical user_id for this session.
    // Use the shared resolveUserIds helper (email-based lookup via pg then PostgREST).
    // Prefer the first resolved UUID, falling back to session.userId if none found.
    const resolvedIds = await resolveUserIds(session);
    const validUserId = resolvedIds.length > 0 ? resolvedIds[0] : null;

    // Try pg INSERT first, fall back to PostgREST if pg.Pool is broken
    const pgResult = await logger.query('briefs:create', () =>
      db.query(
        `INSERT INTO briefs
           (brand, category, objective, age_ranges, gender, sec, market, geography,
            competitors, background, insight_buckets, status, sla_hours, sla_due_at, user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING *`,
        [brand, category, objective, age_ranges, gender, sec, market, geography,
         competitors, background, insight_buckets, status, slaHours, slaDueAt, validUserId]
      )
    );

    let brief = pgResult.rows[0];

    // If pg failed or returned nothing, try PostgREST (works even when pg is unreachable)
    if (!brief) {
      logger.warn('api:POST /api/briefs - pg returned no data, trying PostgREST', { brand });
      brief = await insertBriefViaRest({
        brand, category, objective, age_ranges, gender, sec, market, geography,
        competitors, background, insight_buckets, status,
        sla_hours: slaHours, sla_due_at: slaDueAt, user_id: validUserId,
      });
    }

    if (!brief) throw new Error('Failed to create brief (both pg and PostgREST failed)');

    // Bust the per-user dashboard cache so the new brief appears immediately
    cache.del(`dashboard:overview:${session.userId}`);

    logger.info('api:POST /api/briefs', { ms: Date.now() - t0, id: brief.id, brand, slaHours, userId: session.userId });
    return NextResponse.json(brief, { status: 201 });

  } catch (err) {
    // Log the FULL error so we can debug
    console.error('❌ POST /api/briefs - FULL ERROR:', {
      message: err.message,
      code: err.code,
      detail: err.detail,
      constraint: err.constraint,
      stack: err.stack
    });
    logger.error('api:POST /api/briefs failed', { error: err.message, code: err.code, detail: err.detail });

    // Return more details in dev/debug
    return NextResponse.json({
      error: 'CREATE_FAILED',
      message: 'Failed to create brief',
      debug: {
        errorMessage: err.message,
        errorCode: err.code,
        errorDetail: err.detail
      }
    }, { status: 500 });
  }
}