import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { gwiDefaultChartSpecs } from '@/lib/gwi/charts';
import { keywordDefaultChartSpecs } from '@/lib/keywords/charts';
import type { SheetMeta } from '@/types/dataset';

export const GET = async (
  req: NextRequest,
  { params }: { params: { uploadId: string } }
) => {
  const { uploadId } = params;

  try {
    // 1. Fetch GWI Leads
    const gwiRes = await db.query(
      'SELECT DISTINCT sheet_name, question_name, question_message FROM gwi_time_spent WHERE upload_id = $1',
      [uploadId]
    );
    
    // 2. Fetch Keyword Leads
    const kwRes = await db.query(
      'SELECT DISTINCT sheet_name FROM keywords WHERE upload_id = $1',
      [uploadId]
    );

    const sheets: SheetMeta[] = [];

    gwiRes.rows.forEach(r => {
      sheets.push({
        sheetName: r.sheet_name,
        type: 'gwi_time_spent',
        question: r.question_name,
        description: r.question_message,
        chartSpecs: gwiDefaultChartSpecs(r.question_name)
      });
    });

    kwRes.rows.forEach(r => {
      sheets.push({
        sheetName: r.sheet_name,
        type: 'keyword_plan',
        chartSpecs: keywordDefaultChartSpecs()
      });
    });

    return NextResponse.json({ uploadId, sheets });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
};
