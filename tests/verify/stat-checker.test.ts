import { describe, it, expect } from 'vitest';
import { checkCardStats } from '@/lib/ai/verify/stat-checker';
import type { CardInput } from '@/lib/ai/verify/types';

const baseCard: CardInput = { index: 0, title: 'X', obs: '', stat: '', rec: '' };

describe('stat-checker — number traceability', () => {
  it('passes when stat number matches chart data', () => {
    const card: CardInput = {
      ...baseCard,
      stat: '67% of women prefer fragrance',
      computedChartData: { datasets: [{ data: [67, 33] }] },
    };
    expect(checkCardStats(card)).toEqual([]);
  });

  it('flags stat number that does not trace to chart data', () => {
    const card: CardInput = {
      ...baseCard,
      stat: '99% prefer fragrance',
      computedChartData: { datasets: [{ data: [67, 33] }] },
    };
    const findings = checkCardStats(card);
    expect(findings.some(f => f.issue.includes("doesn't trace"))).toBe(true);
  });

  it('allows close-enough match (5% tolerance)', () => {
    const card: CardInput = {
      ...baseCard,
      stat: '68% prefer fragrance',
      computedChartData: { datasets: [{ data: [67, 33] }] },
    };
    expect(checkCardStats(card)).toEqual([]);
  });

  it('allows percent-vs-decimal slack (24 vs 0.24)', () => {
    const card: CardInput = {
      ...baseCard,
      stat: '24% growth',
      computedChartData: { datasets: [{ data: [0.24] }] },
    };
    expect(checkCardStats(card)).toEqual([]);
  });
});

describe('stat-checker — superlatives + percentages', () => {
  it('flags superlative without a supporting number', () => {
    const card: CardInput = { ...baseCard, obs: 'YouTube is the biggest platform for this audience.' };
    expect(checkCardStats(card).some(f => f.issue.includes('superlative'))).toBe(true);
  });

  it('flags 200% without a baseline reference', () => {
    const card: CardInput = { ...baseCard, stat: '+200% surge' };
    expect(checkCardStats(card).some(f => f.issue.includes('baseline'))).toBe(true);
  });

  it('accepts 200% when baseline is given', () => {
    const card: CardInput = { ...baseCard, obs: 'Searches grew +200% from 2024 baseline.', stat: '+200%' };
    expect(checkCardStats(card).find(f => f.issue.includes('baseline'))).toBeUndefined();
  });
});
