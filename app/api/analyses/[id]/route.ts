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
      // FALLBACK: If DB is down in dev, return a mock Nike analysis for dummy IDs
      if (id.startsWith('dummy-') && process.env.NODE_ENV !== 'production') {
        const { ID: MOCK_INSIGHTS } = require('@/lib/data');
        return NextResponse.json({
          id,
          upload_id: 'dummy-upload-1',
          sheet_name: 'Strategic Brand Audit',
          filename: 'nike_india_audit.xlsx',
          created_at: new Date(Date.now() - 3600000).toISOString(),
          results_json: {
            meta: { domain: 'Commerce', title: 'Nike India Strategic Insights' },
            charts: [
              ...MOCK_INSIGHTS.content.map((c: any) => ({ ...c, bucket: 'content' })),
              ...MOCK_INSIGHTS.commerce.map((c: any) => ({ ...c, bucket: 'commerce' })),
              ...MOCK_INSIGHTS.communication.map((c: any) => ({ ...c, bucket: 'communication' })),
              ...MOCK_INSIGHTS.culture.map((c: any) => ({ ...c, bucket: 'culture' })),
            ].map((c: any, i: number) => ({
              ...c,
              type: c.chartType || (c.isHeatmap ? 'heatmap' : 'bar'),
              computedChartData: c.chartData,
            }))
          },
          brief: {
            id: 'dummy-brief-1',
            brand: 'Nike India',
            status: 'ready',
            sla_hours: 6,
            sla_due_at: new Date(Date.now() + 14400000).toISOString(),
          }
        });
      }
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(rows[0]);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
