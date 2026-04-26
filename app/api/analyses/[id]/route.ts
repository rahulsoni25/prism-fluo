import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { getSession } from '@/lib/auth/server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

    // Owner check is part of the WHERE — 404 on missing or mis-owned, never
    // reveals existence of someone else's analysis.
    const { rows } = await db.query(
      `SELECT a.*,
              CASE
                WHEN b.id IS NULL THEN NULL
                ELSE jsonb_build_object(
                  'id',                  b.id,
                  'brand',               b.brand,
                  'status',              b.status,
                  'created_at',          b.created_at,
                  'sla_hours',           b.sla_hours,
                  'sla_due_at',          b.sla_due_at,
                  'actual_completed_at', b.actual_completed_at
                )
              END AS brief
         FROM analyses a
         LEFT JOIN briefs b ON b.id = a.brief_id
        WHERE a.id = $1 AND a.user_id = $2`,
      [id, session.userId]
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(rows[0]);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
