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

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');

  if (!id) {
    return NextResponse.json(
      { error: 'MISSING_ID', message: 'Provide ?id=<jobId>' },
      { status: 400 }
    );
  }

  try {
    const { rows } = await logger.query('upload_status:get', () =>
      db.query(
        `SELECT id, upload_id, status, error_msg, sheet_count, created_at, updated_at
         FROM upload_jobs
         WHERE id = $1`,
        [id]
      )
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: 'NOT_FOUND', message: `Job ${id} not found` }, { status: 404 });
    }

    return NextResponse.json(rows[0]);

  } catch (err: any) {
    logger.error('api:upload-status failed', { error: err.message });
    return NextResponse.json({ error: 'FETCH_FAILED', message: err.message }, { status: 500 });
  }
}
