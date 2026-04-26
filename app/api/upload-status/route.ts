/**
 * GET /api/upload-status?id=<jobId>
 *
 * Allows the frontend to poll for the status of an upload job.
 * The upload_jobs table is populated by handleUpload().
 *
 * Response:
 *   { id, status: 'processing'|'done'|'error', sheetCount, errorMsg, createdAt, updatedAt }
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { logger } from '@/lib/logger';
import { getSession } from '@/lib/auth/server';

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');

  if (!id) {
    return NextResponse.json(
      { error: 'MISSING_ID', message: 'Provide ?id=<jobId>' },
      { status: 400 }
    );
  }

  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

    // Owner check via the upload row — never reveal jobs for other users'
    // uploads. Legacy rows with NULL user_id (predate multi-tenant
    // migration) are visible to any signed-in user.
    const { rows } = await logger.query('upload_status:get', () =>
      db.query(
        `SELECT j.id, j.upload_id, j.status, j.error_msg, j.sheet_count,
                j.created_at, j.updated_at, u.user_id
           FROM upload_jobs j
           LEFT JOIN uploads u ON u.id = j.upload_id
          WHERE j.id = $1`,
        [id]
      )
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: 'NOT_FOUND', message: `Job ${id} not found` }, { status: 404 });
    }

    const row = rows[0];
    if (row.user_id && row.user_id !== session.userId) {
      // Indistinguishable from "not found" — never reveal cross-tenant rows.
      return NextResponse.json({ error: 'NOT_FOUND', message: `Job ${id} not found` }, { status: 404 });
    }

    // Strip the owner column from the response payload.
    const { user_id, ...payload } = row;
    return NextResponse.json(payload);

  } catch (err: any) {
    logger.error('api:upload-status failed', { error: err.message });
    return NextResponse.json({ error: 'FETCH_FAILED', message: err.message }, { status: 500 });
  }
}
