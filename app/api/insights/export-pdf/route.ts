/**
 * POST /api/insights/export-pdf
 * Exports all 4 insight buckets as a single combined PDF
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { getSession } from '@/lib/auth/server';
import { generateCombinedPDF, extractBucketData } from '@/lib/pdf/generator';

export const dynamic = 'force-dynamic';

interface ExportRequest {
  analysisId: string;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  try {
    const body: ExportRequest = await req.json();
    const { analysisId } = body;

    if (!analysisId) {
      return NextResponse.json({ error: 'analysisId required' }, { status: 400 });
    }

    // Fetch analysis with ownership check
    const { rows } = await db.query(
      `SELECT
        a.id, a.sheet_name, a.results_json, a.brief_id,
        b.brand, b.objective
      FROM analyses a
      LEFT JOIN briefs b ON a.brief_id = b.id
      WHERE a.id = $1 AND a.user_id = $2`,
      [analysisId, session.userId],
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'Analysis not found or not owned by user' },
        { status: 404 }
      );
    }

    const analysis = rows[0];
    const results = analysis.results_json || {};
    const briefName = analysis.brand || analysis.sheet_name || 'Analysis Report';
    const headline = results.meta?.headline || 'Insights Report';
    const date = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // Extract bucket data
    const bucketData = extractBucketData(results, briefName, headline, date);

    // Generate PDF
    console.log('Generating combined PDF...', { analysisId, briefName });
    const pdfBuffer = await generateCombinedPDF(bucketData);

    // Return PDF file
    const filename = `${briefName.replace(/\s+/g, '_')}_insights_${date.replace(/\s+/g, '_')}.pdf`;

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdfBuffer.length,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Error exporting PDF:', error);
    return NextResponse.json(
      { error: 'Failed to export PDF', details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * GET /api/insights/export-pdf?id=<analysisId>
 * Alternative GET endpoint for direct downloads
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  try {
    const analysisId = req.nextUrl.searchParams.get('id');

    if (!analysisId) {
      return NextResponse.json({ error: 'id parameter required' }, { status: 400 });
    }

    // Fetch analysis with ownership check
    const { rows } = await db.query(
      `SELECT
        a.id, a.sheet_name, a.results_json, a.brief_id,
        b.brand, b.objective
      FROM analyses a
      LEFT JOIN briefs b ON a.brief_id = b.id
      WHERE a.id = $1 AND a.user_id = $2`,
      [analysisId, session.userId],
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'Analysis not found or not owned by user' },
        { status: 404 }
      );
    }

    const analysis = rows[0];
    const results = analysis.results_json || {};
    const briefName = analysis.brand || analysis.sheet_name || 'Analysis Report';
    const headline = results.meta?.headline || 'Insights Report';
    const date = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // Extract bucket data
    const bucketData = extractBucketData(results, briefName, headline, date);

    // Generate PDF
    const pdfBuffer = await generateCombinedPDF(bucketData);

    // Return PDF file
    const filename = `${briefName.replace(/\s+/g, '_')}_insights_${date.replace(/\s+/g, '_')}.pdf`;

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdfBuffer.length,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Error exporting PDF:', error);
    return NextResponse.json(
      { error: 'Failed to export PDF', details: String(error) },
      { status: 500 }
    );
  }
}
