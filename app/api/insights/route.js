import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { getSession } from '@/lib/auth/server';

/**
 * GET /api/insights
 * Returns the list of saved analyses for the current user only.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

    const { rows } = await db.query(
      `SELECT id, upload_id, sheet_name, filename,
              results_json->'meta' AS meta,
              created_at
         FROM analyses
        WHERE user_id = $1
        ORDER BY created_at DESC`,
      [session.userId],
    );
    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
