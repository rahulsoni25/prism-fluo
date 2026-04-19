import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';

export const GET = async (
  req: NextRequest,
  { params }: { params: Promise<{ uploadId: string; sheetName: string }> }
) => {
  const { uploadId, sheetName } = await params;

  try {
    // 1. Try GWI data
    const gwiRes = await db.query(
      'SELECT * FROM gwi_time_spent WHERE upload_id = $1 AND sheet_name = $2',
      [uploadId, sheetName]
    );

    if (gwiRes.rows.length > 0) {
      return NextResponse.json(gwiRes.rows);
    }

    // 2. Try Keyword data
    const kwRes = await db.query(
      'SELECT * FROM keywords WHERE upload_id = $1 AND sheet_name = $2 ORDER BY avg_monthly_searches DESC',
      [uploadId, sheetName]
    );

    return NextResponse.json(kwRes.rows);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
};
