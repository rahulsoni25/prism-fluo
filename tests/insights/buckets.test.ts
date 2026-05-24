/**
 * Tests for the 4Cs roll-up in lib/insights/buckets.js. Verifies that:
 *   • Every granular bucket maps to exactly one parent
 *   • assignChartsToParentBuckets() preserves card.granularBucket so the
 *     UI's sub-pill can still show precision
 *   • Unknown buckets fall back gracefully (don't crash, no card dropped)
 *   • Legacy 9-bucket exports (BUCKET_META, BUCKET_TABS, assignChartsToBuckets)
 *     are still present (so a future revert / power-user override works)
 */
import { describe, it, expect } from 'vitest';
import {
  granularToParent,
  GRANULAR_TO_PARENT,
  PARENT_BUCKETS,
  PARENT_BUCKET_META,
  PARENT_BUCKET_TABS,
  assignChartsToParentBuckets,
  // legacy exports MUST still exist
  BUCKET_META,
  BUCKET_TABS,
  assignChartsToBuckets,
} from '@/lib/insights/buckets';

describe('4Cs roll-up — granularToParent', () => {
  const expected: Record<string, string> = {
    content:       'content',
    commerce:      'commerce',
    channel:       'commerce',
    pricing:       'commerce',
    search:        'commerce',
    communication: 'communication',
    creative:      'communication',
    culture:       'culture',
    media:         'culture',
  };

  it.each(Object.entries(expected))('%s → %s', (granular, parent) => {
    expect(granularToParent(granular as any)).toBe(parent);
  });

  it('unknown bucket falls back to content (no crash)', () => {
    expect(granularToParent('nonexistent' as any)).toBe('content');
    expect(granularToParent('' as any)).toBe('content');
    expect(granularToParent(undefined as any)).toBe('content');
  });

  it('every granular maps to one of the 4 parents', () => {
    for (const parent of Object.values(GRANULAR_TO_PARENT)) {
      expect(PARENT_BUCKETS).toContain(parent);
    }
  });
});

describe('4Cs roll-up — registry integrity', () => {
  it('exactly 4 parent buckets', () => {
    expect(PARENT_BUCKETS).toHaveLength(4);
    expect(PARENT_BUCKETS).toEqual(['content', 'commerce', 'communication', 'culture']);
  });

  it('every parent has meta + tab entries', () => {
    for (const p of PARENT_BUCKETS) {
      expect(PARENT_BUCKET_META[p]).toBeDefined();
      expect(PARENT_BUCKET_META[p].label).toBeTruthy();
      expect(PARENT_BUCKET_META[p].blurb).toBeTruthy();
      expect(PARENT_BUCKET_TABS.some(t => t.key === p)).toBe(true);
    }
  });

  it('legacy 9-bucket exports are preserved for future "promote granular to its own tab" path', () => {
    expect(BUCKET_META).toBeDefined();
    expect(BUCKET_META.search).toBeDefined();
    expect(BUCKET_META.creative).toBeDefined();
    expect(BUCKET_META.media).toBeDefined();
    expect(BUCKET_META.channel).toBeDefined();
    expect(BUCKET_META.pricing).toBeDefined();
    expect(BUCKET_TABS.length).toBe(9);
    expect(typeof assignChartsToBuckets).toBe('function');
  });
});

describe('4Cs roll-up — assignChartsToParentBuckets', () => {
  const charts = [
    { id: 'a', title: 'Search demand',     bucket: 'search'        },
    { id: 'b', title: 'Aesthetic',         bucket: 'creative'      },
    { id: 'c', title: 'Followed accounts', bucket: 'media'         },
    { id: 'd', title: 'Distribution',      bucket: 'channel'       },
    { id: 'e', title: 'Buy patterns',      bucket: 'commerce'      },
    { id: 'f', title: 'Price sensitivity', bucket: 'pricing'       },
    { id: 'g', title: 'Topic interests',   bucket: 'content'       },
    { id: 'h', title: 'Tone of voice',     bucket: 'communication' },
    { id: 'i', title: 'Identity values',   bucket: 'culture'       },
  ];

  it('routes every granular bucket to its parent + preserves granular field', () => {
    const out = assignChartsToParentBuckets(charts, 'content');
    expect(out.commerce.map(c => c.id).sort()).toEqual(['a', 'd', 'e', 'f']);
    expect(out.communication.map(c => c.id).sort()).toEqual(['b', 'h']);
    expect(out.culture.map(c => c.id).sort()).toEqual(['c', 'i']);
    expect(out.content.map(c => c.id).sort()).toEqual(['g']);
    // Every card should have granularBucket set on it
    for (const parent of PARENT_BUCKETS) {
      for (const c of out[parent]) {
        expect(c.granularBucket).toBeDefined();
        expect(GRANULAR_TO_PARENT[c.granularBucket]).toBe(parent);
      }
    }
  });

  it('falls back to primaryBucket when a chart has no bucket field', () => {
    const out = assignChartsToParentBuckets([{ id: 'x', title: 'Untagged' } as any], 'culture');
    expect(out.culture.map(c => c.id)).toEqual(['x']);
    expect(out.culture[0].granularBucket).toBe('culture');
  });

  it('falls back to content when neither chart bucket nor primary is valid', () => {
    const out = assignChartsToParentBuckets([{ id: 'x', title: 'Untagged' } as any], 'bogus' as any);
    expect(out.content.map(c => c.id)).toEqual(['x']);
  });

  it('returns all 4 parent keys even when some are empty', () => {
    const out = assignChartsToParentBuckets([{ id: 'a', bucket: 'commerce' } as any], 'content');
    expect(Object.keys(out).sort()).toEqual(['commerce', 'communication', 'content', 'culture']);
    expect(out.content).toEqual([]);
    expect(out.communication).toEqual([]);
    expect(out.culture).toEqual([]);
  });

  it('no card is dropped from input', () => {
    const out = assignChartsToParentBuckets(charts, 'content');
    const total = Object.values(out).reduce((s, arr) => s + arr.length, 0);
    expect(total).toBe(charts.length);
  });
});
