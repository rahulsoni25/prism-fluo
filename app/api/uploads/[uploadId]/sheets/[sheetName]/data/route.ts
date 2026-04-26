import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { getSession, uploadBelongsToUser } from '@/lib/auth/server';

export const GET = async (
  req: NextRequest,
  { params }: { params: Promise<{ uploadId: string; sheetName: string }> }
) => {
  const { uploadId, sheetName } = await params;

  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    if (!(await uploadBelongsToUser(uploadId, session.userId))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    // 1. Try GWI data — only analytics columns (no internal id/upload_id/sheet_name)
    const gwiRes = await db.query(
      `SELECT time_bucket, audience, audience_pct, data_point_pct, universe, index_score, responses
       FROM gwi_time_spent WHERE upload_id = $1 AND sheet_name = $2`,
      [uploadId, sheetName]
    );

    if (gwiRes.rows.length > 0) {
      return NextResponse.json(gwiRes.rows);
    }

    // 2. Try Keyword data — only analytics columns
    const kwRes = await db.query(
      `SELECT keyword, avg_monthly_searches, competition, competition_indexed,
              bid_low, bid_high, tier, brand, categories, is_price_intent
       FROM keywords WHERE upload_id = $1 AND sheet_name = $2 ORDER BY avg_monthly_searches DESC`,
      [uploadId, sheetName]
    );
    if (kwRes.rows.length > 0) {
      return NextResponse.json(kwRes.rows);
    }

    // 3. Try generic tool_data (Helium10, Google Trends, Konnect, PDF, etc.)
    const toolRes = await db.query(
      `SELECT row_data FROM tool_data
       WHERE upload_id = $1 AND sheet_name = $2
       ORDER BY id ASC LIMIT 2000`,
      [uploadId, sheetName]
    );
    if (toolRes.rows.length > 0) {
      return NextResponse.json(toolRes.rows.map((r: any) => r.row_data));
    }

    return NextResponse.json([]);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
};
