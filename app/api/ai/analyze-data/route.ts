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
import { analyzeDataForPRISM, analyzeGenericTabularForPRISM } from '@/lib/ai/gemini';
import type { DataSlot } from '@/lib/ai/gemini';

// Vercel Hobby plan default timeout is 10 s — Gemini 2.5 routinely takes 15-40 s.
// Setting maxDuration = 60 (the Hobby-plan maximum) prevents premature timeouts.
export const maxDuration = 60;

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
// Returns ALL slots (one per question group), sorted by Index signal strength.
// Caller decides how many to send per Gemini batch.
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

  // 2. For each question compute rows sorted by Index (high signal first)
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
      // Send top 10 rows per slot (was 7) for richer Gemini context
      topRows: parsed.slice(0, 10),
      rowCount: parsed.length,
    };
  }).filter(q => q.topRows.length >= 2);

  // 3. Sort ALL questions by signal strength (maxIndex) — no bucket cap
  // Preserve at least 1 slot per bucket if available, then fill with highest-index
  const byBucket: Record<string, typeof questions> = {};
  for (const q of questions) {
    if (!byBucket[q.bucket]) byBucket[q.bucket] = [];
    byBucket[q.bucket].push(q);
  }

  // Guarantee minimum coverage: 2 per bucket (if available)
  const guaranteed: typeof questions = [];
  for (const bucket of ['content', 'commerce', 'communication', 'culture'] as const) {
    const sorted = (byBucket[bucket] ?? []).sort((a, b) => b.maxIndex - a.maxIndex);
    guaranteed.push(...sorted.slice(0, 2));
  }

  // Add remaining questions not already included, sorted by maxIndex
  const guaranteedKeys = new Set(guaranteed.map(q => q.question));
  const remaining = questions
    .filter(q => !guaranteedKeys.has(q.question))
    .sort((a, b) => b.maxIndex - a.maxIndex);

  // Return up to 20 slots total (covers all 19 GWI sheets + some overlap)
  return [...guaranteed, ...remaining].slice(0, 20).map(q => ({
    bucket: q.bucket,
    question: q.question,
    chartSuggestion: suggestChart(q.rowCount, q.topRows),
    rows: q.topRows,
  }));
}

// Split slots into batches of batchSize for parallel Gemini calls
function chunkSlots(slots: DataSlot[], batchSize: number): DataSlot[][] {
  const batches: DataSlot[][] = [];
  for (let i = 0; i < slots.length; i += batchSize) {
    batches.push(slots.slice(i, i + batchSize));
  }
  return batches;
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
    const context = [fileNames?.join(' + ') || sheetName].filter(Boolean).join(' ');

    // GWI-shaped data → structured slot path (exact numbers, anti-hallucination)
    // For large GWI files (19 sheets), batch into groups of 6 and run in parallel
    // so we get full coverage without hitting the 60s Vercel timeout.
    if (slots.length > 0) {
      const gwiContext = `${context} — India 18–64 Gen Pop`;
      const toolLabel  = fileNames?.[0]?.toLowerCase().includes('household') ? 'GWI HOUSEHOLD' : 'GWI';

      try {
        // Batch size of 6: ~6 cards per call, 3 parallel calls for 18 slots
        const BATCH_SIZE = 6;
        const batches    = chunkSlots(slots, BATCH_SIZE);

        // Run all batches in parallel — each resolves independently
        const batchResults = await Promise.allSettled(
          batches.map(batch => analyzeDataForPRISM(batch, gwiContext, toolLabel))
        );

        // Merge successful results, log failures without crashing
        const insights = batchResults.flatMap((result, i) => {
          if (result.status === 'fulfilled') return result.value;
          console.warn(`[analyze-data] Batch ${i + 1}/${batches.length} failed:`, result.reason?.message);
          return [];
        });

        if (insights.length === 0) {
          return NextResponse.json(
            { error: 'All Gemini batches returned empty. Model may be overloaded — try again.', path: 'gwi-slots', slotCount: slots.length },
            { status: 422 },
          );
        }

        return NextResponse.json({ insights, slots, path: 'gwi-slots', totalSlots: slots.length, batches: batches.length });
      } catch (err: any) {
        return NextResponse.json(
          { error: `Gemini failed on GWI slots: ${err.message}`, path: 'gwi-slots', slotCount: slots.length },
          { status: 502 },
        );
      }
    }

    // Non-GWI data (Amazon, Helium10, sales, marketing, etc.)
    // → generic Gemini path with creative/media-pro prompt.
    // The rule engine is NOT a fallback any more — its language sounds
    // like a stock-market terminal, which is wrong for our audience.
    const firstName  = fileNames?.[0] ?? sheetName ?? 'data';
    const lower      = firstName.toLowerCase();
    const toolLabel  = lower.includes('amazon')   ? 'AMAZON'
                     : lower.includes('helium')   ? 'HELIUM10'
                     : lower.includes('flipkart') ? 'FLIPKART'
                     : lower.includes('meesho')   ? 'MEESHO'
                     : 'TABULAR';

    try {
      const insights = await analyzeGenericTabularForPRISM(rows, context, toolLabel);
      if (insights.length === 0) {
        return NextResponse.json(
          { error: 'Gemini returned no insights for this dataset (empty array). The dataset may be too small or the model is overloaded.', path: 'generic-tabular' },
          { status: 422 },
        );
      }
      return NextResponse.json({ insights, slots: [], path: 'generic-tabular' });
    } catch (err: any) {
      return NextResponse.json(
        { error: `Gemini call failed: ${err.message}`, path: 'generic-tabular' },
        { status: 502 },
      );
    }

  } catch (err: any) {
    console.error('[analyze-data]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
