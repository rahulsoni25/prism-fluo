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
  // spec-aligned per-variable engine (Option B)
  classifyByVariable,
  resolveCardBucket,
  // legacy exports MUST still exist
  BUCKET_META,
  BUCKET_TABS,
  DOMAIN_TO_BUCKET,
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

describe('per-variable classifier (Option B — spec-aligned)', () => {
  // Search-vs-Any rule cases
  it.each([
    ['Search volume jumped 32% YoY',                  'search'],
    ['Monthly searches for "running shoes" hit 450K', 'search'],
    ['Top keyword gap: "trail running"',              'search'],
    ['Google Trends shows rising query for X',        'search'],
    ['SEO ranking position dropped to 7',             'search'],
    ['Query intent split: 80% commercial',            'search'],
  ])('SEARCH variable: %s → search', (title, expected) => {
    expect(classifyByVariable({ title } as any)).toBe(expected);
  });

  // Culture-vs-Media tiebreaker
  it.each([
    ['Accounts followed by audience: avg 142',          'media'],
    ['Time spent on Instagram: 78 min/day',             'media'],
    ['OTT streaming hours per week: 14',                'media'],
    ['Podcast listening accounts followed',             'media'],
    ['Devices used per household: 3.2',                 'media'],
  ])('MEDIA variable: %s → media', (title) => {
    expect(classifyByVariable({ title } as any)).toBe('media');
  });

  // Identity-axis cases stay culture
  it.each([
    ['Sustainability values index: 72',                 'culture'],
    ['Demographics: 18-24 female metro',                'culture'],
    ['Lifestyle attitudes toward fitness',              'culture'],
  ])('CULTURE variable: %s → culture', (title) => {
    expect(classifyByVariable({ title } as any)).toBe('culture');
  });

  // Communication axis
  it.each([
    ['Brand awareness lifted 8 points',                 'communication'],
    ['Review sentiment trended negative in Q2',         'communication'],
    ['Ad recall scored 64%',                            'communication'],
    ['Net Promoter Score (NPS) declined',               'communication'],
  ])('COMMUNICATION variable: %s → communication', (title) => {
    expect(classifyByVariable({ title } as any)).toBe('communication');
  });

  // Commerce axis
  it.each([
    ['BSR rank improved to #142',                       'commerce'],
    ['Conversion rate hit 4.2%',                        'commerce'],
    ['Cart abandonment 68%',                            'commerce'],
    ['Competitor steal opportunity: 1.2M units',        'commerce'],
  ])('COMMERCE variable: %s → commerce', (title) => {
    expect(classifyByVariable({ title } as any)).toBe('commerce');
  });

  // Pricing axis (narrow — only true price-value variables)
  it.each([
    ['Price sensitivity index for 18-24',               'pricing'],
    ['Willingness to pay above ₹599',                   'pricing'],
    ['Discount response curve',                         'pricing'],
  ])('PRICING variable: %s → pricing', (title) => {
    expect(classifyByVariable({ title } as any)).toBe('pricing');
  });

  it('returns null when no rule matches', () => {
    expect(classifyByVariable({ title: 'Random thing nobody mentioned' } as any)).toBeNull();
    expect(classifyByVariable({} as any)).toBeNull();
    expect(classifyByVariable(null as any)).toBeNull();
  });

  it('inspects toolLabel + stat in addition to title', () => {
    const c = { title: 'Sportswear scene', toolLabel: 'GWI accounts followed', stat: '14 follows/week' };
    expect(classifyByVariable(c as any)).toBe('media');
  });
});

describe('resolveCardBucket priority chain', () => {
  it('explicit chart.bucket wins over rule-based classification', () => {
    const c = { bucket: 'culture', title: 'Search volume by brand' };
    expect(resolveCardBucket(c, 'keywords')).toBe('culture');
  });

  it('falls through to classifyByVariable when bucket is missing', () => {
    const c = { title: 'Monthly search volume for X' };
    expect(resolveCardBucket(c, 'keywords')).toBe('search');
  });

  it('falls through to domain when variable rules return null', () => {
    const c = { title: 'Some untaggable analysis card' };
    expect(resolveCardBucket(c, 'gwi')).toBe('culture');
    expect(resolveCardBucket(c, 'keywords')).toBe('search');  // spec-fixed domain default
    expect(resolveCardBucket(c, 'trends')).toBe('search');    // spec-fixed domain default
  });

  it('defaults to content when nothing matches', () => {
    expect(resolveCardBucket({ title: 'Untaggable' }, 'unknown-domain')).toBe('content');
  });

  it('rejects invalid bucket and falls through to next step', () => {
    const c = { bucket: 'bogus', title: 'Monthly search volume' };
    expect(resolveCardBucket(c, 'keywords')).toBe('search');  // classifyByVariable saves it
  });
});

describe('spec-aligned DOMAIN_TO_BUCKET — regression guards', () => {
  it('keywords domain defaults to search (was commerce — spec violation fixed)', () => {
    expect(DOMAIN_TO_BUCKET.keywords).toBe('search');
  });

  it('trends domain defaults to search (was culture — spec violation fixed)', () => {
    expect(DOMAIN_TO_BUCKET.trends).toBe('search');
  });

  it('search & seo domain defaults to search (was commerce)', () => {
    expect(DOMAIN_TO_BUCKET['search & seo']).toBe('search');
  });

  it('gwi still defaults to culture (refined per-card by classifyByVariable)', () => {
    expect(DOMAIN_TO_BUCKET.gwi).toBe('culture');
  });
});

describe('assignChartsToParentBuckets — Option B end-to-end', () => {
  it('a keyword-style card with no explicit bucket lands in Commerce tab (via search→commerce rollup)', () => {
    const charts = [{ title: 'Monthly search volume for "running shoes" hit 450K' }];
    const out = assignChartsToParentBuckets(charts as any, 'culture'); // wrong domain hint
    expect(out.commerce.length).toBe(1);     // search rolled up into Commerce parent
    expect(out.commerce[0].granularBucket).toBe('search');
    expect(out.culture.length).toBe(0);
  });

  it('an accounts-followed card lands in Culture tab (via media→culture rollup) even when tagged "culture"', () => {
    const charts = [{ bucket: 'culture', title: 'Accounts followed by audience: avg 142' }];
    const out = assignChartsToParentBuckets(charts as any, 'gwi');
    // bucket field takes priority over classifier — so it stays culture
    expect(out.culture.length).toBe(1);
    expect(out.culture[0].granularBucket).toBe('culture');
  });
});
