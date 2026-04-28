/**
 * GET /api/presentations
 *
 * Returns list of presentations created by the current user
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { getSession } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  try {
    const { rows } = await db.query(
      `SELECT
        id, analysis_id, template_id, template_name, brief_name,
        headline, gamma_url, status, created_at
       FROM presentations
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [session.userId],
    );

    return NextResponse.json({
      success: true,
      count: rows.length,
      presentations: rows,
    }, { status: 200 });

  } catch (error) {
    console.error('Error fetching presentations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch presentations' },
      { status: 500 }
    );
  }
}
