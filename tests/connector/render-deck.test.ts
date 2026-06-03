/**
 * Tests for the connector deck → .pptx renderer. A .pptx is a ZIP (OOXML)
 * package, so a valid render starts with the ZIP magic bytes "PK".
 */
import { describe, it, expect } from 'vitest';
import { renderDeck, type DeckSpec } from '@/lib/connector/render-deck';

const sampleDeck: DeckSpec = {
  title: 'Acme Home & Garden — Google Ads Audit',
  slides: [
    { layout: 'cover', title: 'Acme — Google Ads Audit', subtitle: 'Spend USD 17831 · 540 conversions' },
    { layout: 'kpi', title: 'Account at a glance', kpis: [
      { label: 'Spend', value: 'USD 17831' },
      { label: 'Conversions', value: 540 },
      { label: 'Blended CPA', value: 'USD 33' },
      { label: 'Recoverable', value: 'USD 3760' },
    ] },
    { layout: 'bar-chart', title: 'Spend by campaign', chart: {
      type: 'bar', labels: ['Brand', 'Generic', 'Competitor'], series: [{ name: 'Spend', data: [2840, 9120, 4310] }],
    } },
    { layout: 'bullets', title: 'Recommendations', bullets: ['Pause over-CPA ad groups', 'Add negatives for wasted terms'] },
    { layout: 'table', title: 'Ad group detail', rows: [
      { name: 'Outdoor Sofas', spend: 2380, cpa: 132.22 },
      { name: 'Brand X', spend: 1310, cpa: null },
    ] },
    { layout: 'closing', title: 'Next steps', bullets: ['Recover ~USD 3760', 'Re-audit in 7 days'] },
  ],
};

describe('renderDeck', () => {
  it('produces a valid .pptx (ZIP/OOXML) buffer from a connector deck spec', async () => {
    const buf = await renderDeck(sampleDeck);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(1000);
    // ZIP magic bytes — every .pptx is a ZIP container.
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK');
  });

  it('handles an empty slides array by falling back to a cover slide', async () => {
    const buf = await renderDeck({ title: 'Empty', slides: [] });
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK');
  });

  it('renders every supported layout without throwing', async () => {
    const layouts: DeckSpec['slides'][number]['layout'][] = ['cover', 'kpi', 'bar-chart', 'bullets', 'table', 'closing'];
    for (const layout of layouts) {
      const buf = await renderDeck({ title: layout, slides: [{ layout, title: layout, bullets: ['x'], kpis: [{ label: 'a', value: 1 }], rows: [{ a: 1 }], chart: { type: 'bar', labels: ['a'], series: [{ name: 's', data: [1] }] } }] });
      expect(buf.length).toBeGreaterThan(500);
    }
  });
});
