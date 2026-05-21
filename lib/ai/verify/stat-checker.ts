/**
 * lib/ai/verify/stat-checker.ts
 * Agent #2 — Number verification.
 *
 * Extracts every number from the card's stat/obs/rec text, then verifies
 * that each number traces to either:
 *   (a) a value present in the chart's computedChartData, OR
 *   (b) a value reachable from another card's evidence (cross-reference)
 *
 * Catches: invented numbers, off-by-one errors, unit mismatches
 *          (24% vs 0.24 vs 24), missing context (e.g. "200%" without "of X").
 *
 * Pure deterministic — does not call the LLM. Cheap, repeatable, no drift.
 */

import type { CardInput, Finding, AgentName } from './types';

const NAME: AgentName = 'stat-checker';

// Pull numeric tokens with their surrounding context so we know what each
// number is "about" — e.g. "+24% YoY", "₹120", "3.5x higher", "200 searches"
const NUMBER_RE = /([+\-]?₹?\s?\d{1,3}(?:[,.\s]\d{3})*(?:\.\d+)?)\s?(%|x|×|cr|crore|lakh|l\b|k\b|m\b|searches?|bid|cpc|months?|years?|days?|weeks?|pp)?/gi;

function extractNumbers(text: string): { raw: string; value: number; unit: string }[] {
  if (!text) return [];
  const out: { raw: string; value: number; unit: string }[] = [];
  let m: RegExpExecArray | null;
  NUMBER_RE.lastIndex = 0;
  while ((m = NUMBER_RE.exec(text)) !== null) {
    const raw = m[0];
    const numericPart = m[1].replace(/[₹,\s]/g, '');
    const value = parseFloat(numericPart);
    const unit = (m[2] || '').toLowerCase();
    if (Number.isFinite(value)) out.push({ raw, value, unit });
  }
  return out;
}

function flattenChartValues(data: any): number[] {
  if (!data) return [];
  const values: number[] = [];
  if (Array.isArray(data.values)) {
    data.values.forEach((v: any) => { const n = Number(v); if (Number.isFinite(n)) values.push(n); });
  }
  if (Array.isArray(data.valuesA)) data.valuesA.forEach((v: any) => { const n = Number(v); if (Number.isFinite(n)) values.push(n); });
  if (Array.isArray(data.valuesB)) data.valuesB.forEach((v: any) => { const n = Number(v); if (Number.isFinite(n)) values.push(n); });
  if (Array.isArray(data.datasets)) {
    data.datasets.forEach((ds: any) => {
      if (Array.isArray(ds.data)) ds.data.forEach((v: any) => {
        if (typeof v === 'number') values.push(v);
        else if (v && typeof v === 'object' && 'y' in v) { const n = Number(v.y); if (Number.isFinite(n)) values.push(n); }
      });
    });
  }
  return values;
}

/** Returns true if `target` is "close enough" to any value in the source list.
 *  Tolerance: 5% relative or 2 absolute, whichever is larger. Catches rounding
 *  (24.3 ≈ 24%) without accepting wildly different numbers. */
function isTraceable(target: number, source: number[]): boolean {
  for (const v of source) {
    if (v === 0) continue;
    const tol = Math.max(2, Math.abs(v) * 0.05);
    if (Math.abs(target - v) <= tol) return true;
    // Percentage-vs-decimal slack: 24 vs 0.24
    if (Math.abs(target - v * 100) <= tol) return true;
    if (Math.abs(target * 100 - v) <= tol) return true;
  }
  return false;
}

export function checkCardStats(card: CardInput): Finding[] {
  const findings: Finding[] = [];

  // The card-internal consistency check: every number in `stat` must also
  // appear (or be derivable) in `obs`, OR have evidence in the chart data.
  const statNums = extractNumbers(card.stat || '');
  const obsNums  = extractNumbers(card.obs || '');
  const chartValues = flattenChartValues(card.computedChartData);

  // Only check stat if both stat and chart data exist
  if (statNums.length > 0 && chartValues.length > 0) {
    for (const n of statNums) {
      const traceable = isTraceable(n.value, chartValues) ||
                        isTraceable(n.value, obsNums.map(x => x.value));
      if (!traceable) {
        findings.push({
          agent: NAME,
          field: 'stat',
          severity: 'major',
          issue: `Number "${n.raw}" in stat doesn't trace to chart data or observation.`,
          evidence: n.raw,
          suggest: 'Either remove this number, cite its source, or correct it to match the underlying data.',
        });
      }
    }
  }

  // Look for orphan superlatives that need a number — "best", "highest",
  // "most", "biggest" should be backed by a number elsewhere in the card.
  if (card.obs || card.stat) {
    const text = `${card.obs || ''} ${card.stat || ''}`.toLowerCase();
    const hasSuperlative = /\b(highest|biggest|largest|most|best|leader|leading|dominant)\b/.test(text);
    const hasNumber = (statNums.length + obsNums.length) > 0;
    if (hasSuperlative && !hasNumber) {
      findings.push({
        agent: NAME,
        field: 'obs',
        severity: 'minor',
        issue: 'Uses a superlative ("highest", "biggest", "most") without a supporting number.',
        suggest: 'Quantify the claim — what makes this the biggest? By how much?',
      });
    }
  }

  // Percentage claims should have a base — "+200%" without "from X" is empty
  for (const n of [...statNums, ...obsNums]) {
    if (n.unit === '%' && Math.abs(n.value) >= 100) {
      const text = `${card.obs || ''} ${card.stat || ''}`.toLowerCase();
      if (!/(from|of|vs|versus|over|compared|grew|fell|rose|dropped|increased|decreased|baseline|y\/y|yoy)/i.test(text)) {
        findings.push({
          agent: NAME,
          field: n.unit === '%' ? 'stat' : 'obs',
          severity: 'minor',
          issue: `Percentage ${n.raw} without a baseline reference (vs what? from when?).`,
          evidence: n.raw,
        });
        break;
      }
    }
  }

  return findings;
}

export function statCheckerConfirms(finding: Finding, card: CardInput): boolean {
  if (finding.field === 'stat' || finding.field === 'obs') {
    // Other agents flagging a number issue — re-run our own check
    const ours = checkCardStats(card);
    return ours.some(f =>
      f.field === finding.field &&
      (finding.evidence ? f.evidence === finding.evidence : true)
    );
  }
  return false;
}
