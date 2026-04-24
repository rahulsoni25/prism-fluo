/**
 * POST /api/ai/analyze-data
 *
 * Pre-processes raw rows into structured insight slots (exact data per slot),
 * then asks Gemini 2.5 to write narrative around those exact numbers only.
 *
 * Body:  { rows: object[], sheetName: string, fileNames?: string[] }
 * Reply: { insights: GeminiInsightCard[], slots: DataSlot[] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { analyzeDataForPRISM } from '@/lib/ai/gemini';
import type { DataSlot } from '@/lib/ai/gemini';

// ── Column aliases ────────────────────────────────────────────
function col(row: any, ...keys: string[]): string {
  for (const k of keys) if (row[k] != null && row[k] !== '') return String(row[k]);
  return '';
}
function num(row: any, ...keys: string[]): number {
  for (const k of keys) { const v = parseFloat(String(row[k] ?? '')); if (!isNaN(v)) return v; }
  return 0;
}

// ── Question → PRISM bucket ───────────────────────────────────
function questionBucket(q: string): DataSlot['bucket'] {
  const t = q.toLowerCase();
  if (/device|owned media|content format|streaming|screen time/.test(t))           return 'content';
  if (/paid media|advert|discover|brand relation|advocacy|earned|brand qual|brand action|word.of.mouth/.test(t)) return 'communication';
  if (/purchase|buy|shop|price|retailer|sale|eco|product research|income|mortgage|grocer|familiarity|purchase driver|in.store|online.*brand/.test(t)) return 'commerce';
  if (/employ|household|children|vehicle|living arrangement|pet|lifestyle|family|grandchild|age.*child|properties owned|number.*child/.test(t)) return 'culture';
  return 'content';
}

// ── Suggest best chart type for this question's data ─────────
function suggestChart(rowCount: number, rows: DataSlot['rows']): DataSlot['chartSuggestion'] {
  if (rowCount <= 4) return 'pie';
  // If there are at least 4 rows with both audiencePct and index, scatter is great
  const hasGoodScatter = rows.filter(r => r.audiencePct > 0 && r.index > 80).length >= 4;
  if (hasGoodScatter && rowCount >= 6) return 'scatter';
  if (rowCount <= 7) return 'bar';
  return 'hbar';
}

// ── Build insight slots from raw rows ─────────────────────────
function buildInsightSlots(rows: any[]): DataSlot[] {
  // 1. Group by question
  const groups: Record<string, any[]> = {};
  for (const row of rows) {
    const q = col(row,
      'Short Label Question', 'short_label_question',
      'Question', 'question', 'time_bucket',
      'Category', 'Sheet',
    ) || 'General';
    if (!groups[q]) groups[q] = [];
    groups[q].push(row);
  }

  // 2. For each question compute top rows by Index
  const questions = Object.entries(groups).map(([question, qRows]) => {
    const parsed = qRows
      .map(r => ({
        attr:        col(r, 'Attributes', 'attributes', 'Attribute', 'audience', 'Label', 'Name'),
        audiencePct: num(r, 'Audience %', 'audience_pct', 'Audience%'),
        dataPct:     num(r, 'Data point %', 'data_point_pct', 'DataPoint%'),
        index:       num(r, 'Index', 'index_score'),
        universe:    num(r, 'Universe', 'universe'),
      }))
      .filter(r => r.attr && r.index > 0)
      .sort((a, b) => b.index - a.index);

    return {
      question,
      bucket: questionBucket(question),
      maxIndex: parsed[0]?.index ?? 0,
      topRows: parsed.slice(0, 7),
      rowCount: parsed.length,
    };
  }).filter(q => q.topRows.length >= 2);

  // 3. Pick top 2 per bucket by maxIndex
  const byBucket: Record<string, typeof questions> = {};
  for (const q of questions) {
    if (!byBucket[q.bucket]) byBucket[q.bucket] = [];
    byBucket[q.bucket].push(q);
  }

  const slots: DataSlot[] = [];
  for (const bucket of ['content', 'commerce', 'communication', 'culture'] as const) {
    const best = (byBucket[bucket] ?? [])
      .sort((a, b) => b.maxIndex - a.maxIndex)
      .slice(0, 2);

    for (const q of best) {
      slots.push({
        bucket,
        question: q.question,
        chartSuggestion: suggestChart(q.rowCount, q.topRows),
        rows: q.topRows,
      });
    }
  }

  return slots;
}

// ── Route ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { rows, sheetName, fileNames } = await req.json();

    if (!Array.isArray(rows) || rows.length === 0)
      return NextResponse.json({ error: 'rows array required' }, { status: 400 });

    if (!process.env.GEMINI_API_KEY)
      return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 503 });

    const slots = buildInsightSlots(rows);
    if (slots.length === 0)
      return NextResponse.json({ error: 'No parseable data rows found' }, { status: 422 });

    const context   = [fileNames?.join(' + ') || sheetName, '— India 18–64 Gen Pop'].filter(Boolean).join(' ');
    const toolLabel = fileNames?.[0]?.toLowerCase().includes('household') ? 'GWI HOUSEHOLD' : 'GWI';

    const insights = await analyzeDataForPRISM(slots, context, toolLabel);
    return NextResponse.json({ insights, slots });

  } catch (err: any) {
    console.error('[analyze-data]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
