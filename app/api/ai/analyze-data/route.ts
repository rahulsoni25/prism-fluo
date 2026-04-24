/**
 * POST /api/ai/analyze-data
 *
 * Accepts raw tabular rows from any uploaded file, builds a structured
 * data summary, and asks Gemini 2.5 Flash to generate 8 PRISM insight
 * cards (2 per bucket: content / commerce / communication / culture).
 *
 * Body: { rows: object[], sheetName: string, fileNames?: string[] }
 * Response: { insights: GeminiInsightCard[] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { analyzeDataForPRISM } from '@/lib/ai/gemini';

// ── Column aliases (GWI raw vs stored in tool_data) ──────────
function col(row: any, ...keys: string[]): string {
  for (const k of keys) {
    if (row[k] != null && row[k] !== '') return String(row[k]);
  }
  return '';
}

function num(row: any, ...keys: string[]): number {
  for (const k of keys) {
    const v = parseFloat(String(row[k] ?? ''));
    if (!isNaN(v)) return v;
  }
  return 0;
}

// ── Build a compact text summary Gemini can reason over ───────
function buildDataSummary(rows: any[]): string {
  // Group rows by their question / Short Label Question
  const groups: Record<string, any[]> = {};

  for (const row of rows) {
    const q =
      col(row,
        'Short Label Question', 'short_label_question', 'Question',
        'question', 'Category', 'category', 'Sheet',
      ) || 'General';

    if (!groups[q]) groups[q] = [];
    groups[q].push(row);
  }

  const lines: string[] = [];

  for (const [question, qRows] of Object.entries(groups)) {
    // Sort by Index descending to surface highest-signal rows first
    const sorted = qRows
      .map(r => ({
        attr:      col(r, 'Attributes', 'attributes', 'Attribute', 'Label', 'label', 'Name', 'name'),
        audiencePct: num(r, 'Audience %', 'audience_pct', 'audience_%', 'Audience%'),
        dataPct:     num(r, 'Data point %', 'data_point_pct', 'DataPoint%', 'data_pct'),
        index:       num(r, 'Index', 'index_score', 'Index Score'),
        universe:    num(r, 'Universe', 'universe'),
        responses:   num(r, 'Responses', 'responses'),
      }))
      .filter(r => r.attr && r.index > 0)
      .sort((a, b) => b.index - a.index)
      .slice(0, 10); // top 10 per question is enough context

    if (sorted.length === 0) continue;

    lines.push(`\nQUESTION: ${question}`);
    sorted.forEach(r => {
      lines.push(
        `  • ${r.attr}: Audience ${r.audiencePct.toFixed(1)}%, Index ${r.index.toFixed(0)}` +
        (r.universe > 0 ? `, Universe ${(r.universe / 1e6).toFixed(1)}M` : ''),
      );
    });
  }

  return lines.join('\n');
}

// ── Route handler ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { rows, sheetName, fileNames } = await req.json();

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'rows array is required' }, { status: 400 });
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 503 });
    }

    const context    = [fileNames?.join(' + ') || sheetName, '— India 18-64 Gen Pop'].filter(Boolean).join(' ');
    const toolLabel  = fileNames?.[0]?.toLowerCase().includes('household') ? 'GWI HOUSEHOLD' : 'GWI';
    const dataSummary = buildDataSummary(rows);

    if (!dataSummary.trim()) {
      return NextResponse.json({ error: 'No parseable data rows found' }, { status: 422 });
    }

    const insights = await analyzeDataForPRISM(dataSummary, context, toolLabel);

    return NextResponse.json({ insights });
  } catch (err: any) {
    console.error('[analyze-data]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
