/**
 * Tests for lib/uploads/source-type.ts — source classification + supersede rule
 * used by the brief-merge (Tier 2) behavior.
 */
import { describe, it, expect } from 'vitest';
import { classifySourceType, shouldSupersede, SOURCE_TYPE_LABEL } from '@/lib/uploads/source-type';

describe('classifySourceType — via tool_type set', () => {
  it.each([
    [['gwi_time_spent'],   'gwi.xlsx',                'gwi'],
    [['keyword_plan'],     'kw.csv',                  'keywords'],
    [['helium10'],         'h10.xlsx',                'helium10'],
    [['google_trends'],    'trends.csv',              'trends'],
    [['konnect'],          'konnect.xlsx',            'konnect'],
    [['social_listening'], 'brandwatch.xlsx',         'social'],
    [['amazon_sales'],     'amz.xlsx',                'amazon-sales'],
    [['generic_table'],    'data.xlsx',               'generic-tabular'],
  ])('toolTypes %o + %s → %s', (toolTypes, filename, expected) => {
    expect(classifySourceType({ toolTypes, filename })).toBe(expected);
  });
});

describe('classifySourceType — extension fallback (PDF / PPTX)', () => {
  it('PDF extension wins regardless of toolTypes', () => {
    expect(classifySourceType({ toolTypes: ['generic_table'], filename: 'whitepaper.pdf' })).toBe('pdf');
    expect(classifySourceType({ filename: 'report.pdf' })).toBe('pdf');
  });
  it('PPTX/PPT extension wins regardless of toolTypes', () => {
    expect(classifySourceType({ toolTypes: ['generic_table'], filename: 'deck.pptx' })).toBe('pptx');
    expect(classifySourceType({ filename: 'old.ppt' })).toBe('pptx');
  });
});

describe('classifySourceType — filename fallback when tool_type empty', () => {
  it.each([
    ['gwi_export_q4.xlsx',          'gwi'],
    ['Keyword_Planner_Stats.csv',   'keywords'],
    ['keyword_stats_2026.csv',      'keywords'],
    ['helium10_data.xlsx',          'helium10'],
    ['h10_export.xlsx',             'helium10'],
    ['google_trends_brand.csv',     'trends'],
    ['trends_query_export.csv',     'trends'],
    ['konnect_insights.xlsx',       'konnect'],
    ['brandwatch_q1.xlsx',          'social'],
    ['meltwater_export.csv',        'social'],
  ])('%s → %s', (filename, expected) => {
    expect(classifySourceType({ toolTypes: [], filename })).toBe(expected);
  });

  it('unknown filenames fall back to "unknown"', () => {
    expect(classifySourceType({ toolTypes: [], filename: 'random.xlsx' })).toBe('unknown');
    expect(classifySourceType({ filename: 'foo.bar' })).toBe('unknown');
  });
});

describe('shouldSupersede — same-type rule', () => {
  it('same canonical type → supersede', () => {
    expect(shouldSupersede('gwi', 'gwi')).toBe(true);
    expect(shouldSupersede('keywords', 'keywords')).toBe(true);
    expect(shouldSupersede('helium10', 'helium10')).toBe(true);
  });

  it('different canonical types → do NOT supersede', () => {
    expect(shouldSupersede('gwi', 'keywords')).toBe(false);
    expect(shouldSupersede('keywords', 'helium10')).toBe(false);
    expect(shouldSupersede('pdf', 'gwi')).toBe(false);
    expect(shouldSupersede('pptx', 'pdf')).toBe(false);
  });

  it('unknown never supersedes anything', () => {
    expect(shouldSupersede('unknown', 'gwi')).toBe(false);
    expect(shouldSupersede('gwi', 'unknown')).toBe(false);
    expect(shouldSupersede('unknown', 'unknown')).toBe(false);
  });
});

describe('SOURCE_TYPE_LABEL — display strings', () => {
  it('every SourceType has a non-empty label', () => {
    for (const k of Object.keys(SOURCE_TYPE_LABEL)) {
      expect(SOURCE_TYPE_LABEL[k as keyof typeof SOURCE_TYPE_LABEL].length).toBeGreaterThan(0);
    }
  });

  it('labels for the most-uploaded types are user-friendly (not the raw key)', () => {
    expect(SOURCE_TYPE_LABEL.gwi).toMatch(/GWI/);
    expect(SOURCE_TYPE_LABEL.keywords).toMatch(/Keyword/);
    expect(SOURCE_TYPE_LABEL.helium10).toMatch(/Helium10/);
  });
});
