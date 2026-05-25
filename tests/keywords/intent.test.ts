/**
 * Tests for lib/keywords/intent.ts — keyword intent classifier.
 * Covers all 4 intent types + brand-led priority + word-boundary safety.
 */
import { describe, it, expect } from 'vitest';
import { classifyIntent } from '@/lib/keywords/intent';

describe('brand-led intent — brief brand wins over everything', () => {
  it.each([
    ['sargam detergent',                'brand-led'],
    ['buy sargam detergent online',     'brand-led'],   // beats transactional
    ['how to use sargam detergent',     'brand-led'],   // beats informational
    ['sargam vs tide',                  'brand-led'],
  ])('"%s" → %s', (kw, expected) => {
    expect(classifyIntent({
      keyword: kw,
      briefBrand: 'Sargam Detergent',
      briefCompetitors: 'Tide',
    })).toBe(expected);
  });

  it('uses competitor list for brand-led match', () => {
    expect(classifyIntent({
      keyword: 'ariel detergent powder',
      briefBrand: 'Sargam Detergent',
      briefCompetitors: 'Ariel, Tide, Surf Excel',
    })).toBe('brand-led');
  });

  it('multi-word brand "surf excel" matches with flexible whitespace', () => {
    expect(classifyIntent({
      keyword: 'surf  excel matic',  // double space
      briefBrand: 'Sargam',
      briefCompetitors: 'Surf Excel',
    })).toBe('brand-led');
  });

  it('does NOT match brand inside an unrelated word (word-boundary safety)', () => {
    // "ariel" should not match "material" or "varietal"
    const r1 = classifyIntent({
      keyword: 'material safety data sheet',
      briefBrand: 'Sargam',
      briefCompetitors: 'Ariel',
    });
    expect(r1).not.toBe('brand-led');
  });
});

describe('transactional intent', () => {
  it.each([
    'buy detergent online',
    'detergent price comparison',
    'cheapest washing powder',
    'best detergent under 200',
    'detergent reviews 2026',
    'amazon detergent deals',
    'detergent near me',
    'home delivery detergent',
  ])('"%s" → transactional', (kw) => {
    expect(classifyIntent({ keyword: kw, briefBrand: 'Sargam', briefCompetitors: null })).toBe('transactional');
  });
});

describe('informational intent', () => {
  it.each([
    'how to remove stains from clothes',
    'what is enzyme detergent',
    'which detergent is best for white clothes',
    'why does detergent foam',
    'guide to laundry care',
    'tips for washing colored clothes',
    'detergent vs soap',
    'difference between liquid and powder detergent',
  ])('"%s" → informational', (kw) => {
    expect(classifyIntent({ keyword: kw, briefBrand: 'Sargam', briefCompetitors: null })).toBe('informational');
  });
});

describe('category intent (fallback)', () => {
  it.each([
    'detergent',
    'washing powder',
    'liquid detergent matic',
    'fabric softener',
  ])('"%s" → category', (kw) => {
    expect(classifyIntent({ keyword: kw, briefBrand: 'Sargam', briefCompetitors: null })).toBe('category');
  });
});

describe('edge cases', () => {
  it('empty keyword → category', () => {
    expect(classifyIntent({ keyword: '', briefBrand: 'X', briefCompetitors: null })).toBe('category');
  });

  it('null brief brand still classifies based on other signals', () => {
    expect(classifyIntent({ keyword: 'buy detergent', briefBrand: null, briefCompetitors: null })).toBe('transactional');
  });

  it('handles brief.brand with extra whitespace', () => {
    expect(classifyIntent({
      keyword: 'sargam detergent review',
      briefBrand: '  Sargam Detergent  ',
      briefCompetitors: null,
    })).toBe('brand-led');
  });
});

describe('priority — brand-led wins over transactional + informational', () => {
  it('"buy sargam" → brand-led (not transactional)', () => {
    expect(classifyIntent({
      keyword: 'buy sargam detergent',
      briefBrand: 'Sargam',
      briefCompetitors: null,
    })).toBe('brand-led');
  });

  it('"how to use sargam" → brand-led (not informational)', () => {
    expect(classifyIntent({
      keyword: 'how to use sargam detergent',
      briefBrand: 'Sargam',
      briefCompetitors: null,
    })).toBe('brand-led');
  });
});
