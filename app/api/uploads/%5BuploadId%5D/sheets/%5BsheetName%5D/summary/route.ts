import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';

export const GET = async (
  req: NextRequest,
  { params }: { params: { uploadId: string; sheetName: string } }
) => {
  const { uploadId, sheetName } = params;

  try {
    // For GWI: Top indexed buckets
    const gwiRes = await db.query(
      'SELECT time_bucket, audience, index_score FROM gwi_time_spent WHERE upload_id = $1 AND sheet_name = $2 AND index_score > 120 ORDER BY index_score DESC LIMIT 5',
      [uploadId, sheetName]
    );

    // For Keywords: Summary stats
    const kwRes = await db.query(
      `SELECT 
        COUNT(*) as total_keywords,
        SUM(avg_monthly_searches) as total_volume,
        COUNT(*) FILTER (WHERE tier = 'Primary') as primary_count
       FROM keywords WHERE upload_id = $1 AND sheet_name = $2`,
      [uploadId, sheetName]
    );

    return NextResponse.json({
      gwiHighlights: gwiRes.rows,
      keywordStats: kwRes.rows[0]
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
};
