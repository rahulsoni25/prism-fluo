import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    // LEFT JOIN the linked brief so the insights page can show planned vs
    // actual SLA in the hero. The `brief` field is null when this analysis
    // wasn't created from a brief (e.g. an ad-hoc upload).
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
        WHERE a.id = $1`,
      [id]
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(rows[0]);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
