/**
 * Tests for lib/insights/relabel.ts — per-brief audience label substitution.
 * Covers text substitution + edge cases (word boundaries, longest-first),
 * chart data walking, full card relabel.
 */
import { describe, it, expect } from 'vitest';
import { relabelText, relabelChartData, relabelCard, relabelAnalysisCharts } from '@/lib/insights/relabel';

describe('relabelText — basic substitution', () => {
  it('replaces a single audience label', () => {
    const text = 'Female 2 are 1.7× more likely to block ads.';
    const labels = { 'Female 2': 'Sargam | Females 25-34 | Suburban/Rural' };
    expect(relabelText(text, labels)).toBe(
      'Sargam | Females 25-34 | Suburban/Rural are 1.7× more likely to block ads.',
    );
  });

  it('replaces multiple labels', () => {
    const text = 'Female 2 lead Female by 14 pts on online shopping.';
    const labels = {
      'Female 2': 'Sargam | Suburban',
      'Female':   'Sargam | Urban',
    };
    expect(relabelText(text, labels)).toBe(
      'Sargam | Suburban lead Sargam | Urban by 14 pts on online shopping.',
    );
  });

  it('returns original text when labels is null/empty', () => {
    expect(relabelText('Female 2 leads', null)).toBe('Female 2 leads');
    expect(relabelText('Female 2 leads', {})).toBe('Female 2 leads');
    expect(relabelText('Female 2 leads', undefined)).toBe('Female 2 leads');
  });

  it('handles empty input', () => {
    expect(relabelText('', { 'X': 'Y' })).toBe('');
    expect(relabelText(null as any, { 'X': 'Y' })).toBe('');
  });
});

describe('relabelText — longest-first ordering (critical correctness)', () => {
  it('"Female 2" is replaced before "Female" — prevents partial match', () => {
    const text = 'Female 2 leads Female.';
    const labels = {
      'Female':   'Urban',
      'Female 2': 'Suburban',
    };
    // If "Female" runs first, "Female 2" becomes "Urban 2" — WRONG.
    // The longest-first sort ensures "Female 2" → "Suburban" runs first.
    expect(relabelText(text, labels)).toBe('Suburban leads Urban.');
  });

  it('handles three overlapping labels correctly', () => {
    const text = 'Female 3 vs Female 2 vs Female.';
    const labels = {
      'Female':   'A',
      'Female 2': 'B',
      'Female 3': 'C',
    };
    expect(relabelText(text, labels)).toBe('C vs B vs A.');
  });
});

describe('relabelText — word boundary safety', () => {
  it('"Female 2" does NOT match inside "Female 25-34"', () => {
    const text = 'Female 25-34 audience prefers premium.';
    const labels = { 'Female 2': 'WRONG_REPLACEMENT' };
    // The "Female 2" pattern should NOT match because there's a digit "5" right after.
    expect(relabelText(text, labels)).toBe('Female 25-34 audience prefers premium.');
  });

  it('"Female" matches at start, end, and between punctuation', () => {
    const labels = { 'Female': 'X' };
    expect(relabelText('Female leads.', labels)).toBe('X leads.');
    expect(relabelText('Leads: Female.', labels)).toBe('Leads: X.');
    expect(relabelText('Female. Female! Female?', labels)).toBe('X. X! X?');
  });

  it('"Female" does NOT match inside "Females"', () => {
    const labels = { 'Female': 'X' };
    // Female (no s) shouldn't replace inside "Females"
    expect(relabelText('Females are growing.', labels)).toBe('Females are growing.');
  });

  it('handles regex-special characters in keys safely', () => {
    const labels = { 'A (test)': 'X' };
    expect(relabelText('Group A (test) is up.', labels)).toBe('Group X is up.');
  });

  it('skips entries where replacement equals original (no-op)', () => {
    const text = 'Female 2 leads';
    const labels = { 'Female 2': 'Female 2' };
    expect(relabelText(text, labels)).toBe('Female 2 leads');
  });
});

describe('relabelChartData — walks structured data', () => {
  it('relabels top-level labels array', () => {
    const data = { labels: ['Female 2', 'Female', 'Total'] };
    const out = relabelChartData(data, { 'Female 2': 'Suburban', 'Female': 'Urban' });
    expect(out.labels).toEqual(['Suburban', 'Urban', 'Total']);
  });

  it('relabels datasets[].label', () => {
    const data = {
      labels: ['Q1', 'Q2'],
      datasets: [
        { label: 'Female 2', data: [10, 20] },
        { label: 'Female',   data: [8, 15] },
      ],
    };
    const out = relabelChartData(data, { 'Female 2': 'Suburban', 'Female': 'Urban' });
    expect(out.datasets[0].label).toBe('Suburban');
    expect(out.datasets[1].label).toBe('Urban');
  });

  it('does not mutate input', () => {
    const data = { labels: ['Female 2'] };
    const original = JSON.stringify(data);
    relabelChartData(data, { 'Female 2': 'X' });
    expect(JSON.stringify(data)).toBe(original);
  });

  it('passes through when labels is null/empty', () => {
    const data = { labels: ['Female 2'] };
    expect(relabelChartData(data, null)).toEqual(data);
    expect(relabelChartData(data, {})).toEqual(data);
  });
});

describe('relabelCard — full card walk', () => {
  it('relabels title + obs + stat + rec', () => {
    const card = {
      title: 'Female 2 win at online',
      obs:   'Female 2 are 46% vs Female 33%.',
      stat:  'Female 2: +13 pts',
      rec:   'Build creative for Female 2.',
    };
    const labels = { 'Female 2': 'Suburban', 'Female': 'Urban' };
    const out = relabelCard(card, labels);
    expect(out.title).toBe('Suburban win at online');
    expect(out.obs).toBe('Suburban are 46% vs Urban 33%.');
    expect(out.stat).toBe('Suburban: +13 pts');
    expect(out.rec).toBe('Build creative for Suburban.');
  });

  it('relabels card.computedChartData if present', () => {
    const card = {
      title: 'X',
      computedChartData: { labels: ['Female 2', 'Female'] },
    };
    const out = relabelCard(card, { 'Female 2': 'A', 'Female': 'B' });
    expect(out.computedChartData.labels).toEqual(['A', 'B']);
  });
});

describe('relabelAnalysisCharts — analysis-level walk', () => {
  it('relabels every card in results.charts', () => {
    const results = {
      charts: [
        { title: 'Female 2 wins',   obs: 'Female 2 at 46%' },
        { title: 'Female total',    obs: 'Female at 33%' },
      ],
    };
    const out = relabelAnalysisCharts(results, { 'Female 2': 'Suburban', 'Female': 'Urban' });
    expect(out.charts![0].title).toBe('Suburban wins');
    expect(out.charts![1].title).toBe('Urban total');
  });

  it('passes through when no labels', () => {
    const results = { charts: [{ title: 'Female 2' }] };
    expect(relabelAnalysisCharts(results, null)).toBe(results);
  });
});
