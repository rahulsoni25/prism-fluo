/**
 * GET /api/briefs/[id]/files
 *
 * Returns all uploads attached to a specific brief, with metadata about
 * sheets and data points. Used by SourceFilesPanel on the insights page
 * to show which files contributed to the analysis.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { logger } from '@/lib/logger';
import { getSession } from '@/lib/auth/server';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const t0 = Date.now();
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

    const briefId = params.id;
    if (!briefId) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'briefId is required' },
        { status: 400 }
      );
    }

    // Fetch all uploads for this brief with ownership check
    // Count the number of sheets by grouping on sheet_name (represents distinct data sources)
    const { rows } = await logger.query('briefs:files:list', () =>
      db.query(`
        SELECT
          u.id,
          u.filename,
          u.created_at,
          u.sla_hours,
          u.sla_due_at,
          COUNT(DISTINCT t.sheet_name) as sheet_count
        FROM uploads u
        LEFT JOIN tool_data t ON u.id = t.upload_id
        WHERE u.brief_id = $1 AND u.user_id = $2
        GROUP BY u.id, u.filename, u.created_at, u.sla_hours, u.sla_due_at
        ORDER BY u.created_at DESC
        LIMIT 50
      `, [briefId, session.userId])
    );

    logger.info('api:GET /api/briefs/[id]/files', { ms: Date.now() - t0, briefId, count: rows.length, userId: session.userId });
    return NextResponse.json(rows);

  } catch (err: any) {
    logger.error('api:GET /api/briefs/[id]/files failed', { error: err.message });
    return NextResponse.json(
      { error: 'FETCH_FAILED', message: 'Failed to fetch brief files' },
      { status: 500 }
    );
  }
}
