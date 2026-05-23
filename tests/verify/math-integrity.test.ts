import { describe, it, expect } from 'vitest';
import { rederiveTam, checkAnalysisMath, checkCardMath } from '@/lib/ai/verify/math-integrity';
import type { CardInput } from '@/lib/ai/verify/types';

describe('math-integrity — TAM re-derivation', () => {
  it('handles Sargam brief (Female · 18-24 + 25-34 · Metro+T1+T2) ≈ 41M', () => {
    const { tam } = rederiveTam({
      gender: 'Female',
      age_ranges: '18–24, 25–34',
      geography: 'Metro Cities, Tier 1, Tier 2',
    });
    expect(tam / 1e6).toBeGreaterThan(38);
    expect(tam / 1e6).toBeLessThan(45);
  });

  it('handles male audience correctly', () => {
    const { tam } = rederiveTam({
      gender: 'Male',
      age_ranges: '25-34',
      geography: 'Metro',
    });
    // 1.45B × 0.514 (male) × 0.172 (25-34) × 0.67 × 0.86 × 0.10 (metro) ≈ 7.4M
    expect(tam / 1e6).toBeGreaterThan(6);
    expect(tam / 1e6).toBeLessThan(9);
  });

  it('no filter shrinkage when only India is set', () => {
    const { tam } = rederiveTam({});
    // Just online × mobile filter on 1.45B
    expect(tam / 1e6).toBeGreaterThan(800);
    expect(tam / 1e6).toBeLessThan(900);
  });

  it('normalises en-dash in age_ranges', () => {
    const a = rederiveTam({ gender: 'Female', age_ranges: '18-24', geography: 'Metro' });
    const b = rederiveTam({ gender: 'Female', age_ranges: '18–24', geography: 'Metro' });
    expect(Math.round(a.tam)).toBe(Math.round(b.tam));
  });

  it('matches geography keys even with whitespace', () => {
    const a = rederiveTam({ gender: 'Female', age_ranges: '25-34', geography: 'Tier1' });
    const b = rederiveTam({ gender: 'Female', age_ranges: '25-34', geography: 'Tier 1' });
    expect(Math.round(a.tam)).toBe(Math.round(b.tam));
  });
});

describe('math-integrity — analysis-level TAM check', () => {
  it('flags a card claiming wildly wrong TAM', () => {
    const cards: CardInput[] = [
      { index: 0, title: '', obs: '85M addressable audience in our reach', stat: '', rec: '' },
    ];
    const f = checkAnalysisMath({
      gender: 'Female', age_ranges: '18-24, 25-34', geography: 'Metro+T1+T2',
    }, cards);
    expect(f.some(x => x.severity === 'blocker' && x.issue.includes('off'))).toBe(true);
  });

  it('passes a card with TAM close to re-derived value', () => {
    const cards: CardInput[] = [
      { index: 0, title: '', obs: '41M addressable audience reachable', stat: '', rec: '' },
    ];
    const f = checkAnalysisMath({
      gender: 'Female', age_ranges: '18-24, 25-34', geography: 'Metro Cities, Tier 1, Tier 2',
    }, cards);
    expect(f.find(x => x.issue.includes('off'))).toBeUndefined();
  });
});

describe('math-integrity — currency conversion', () => {
  it('flags impossible USD-INR conversion', () => {
    const card: CardInput = {
      index: 0, title: 'X',
      obs: 'Category is $5B all-India',
      stat: '₹500 Cr per year',
      rec: '',
    };
    const f = checkCardMath(card);
    expect(f.some(x => x.issue.includes('Currency conversion'))).toBe(true);
  });

  it('passes sensible USD-INR conversion', () => {
    const card: CardInput = {
      index: 0, title: 'X',
      obs: 'Category is $5B all-India',
      stat: '₹43,000 Cr per year',
      rec: '',
    };
    expect(checkCardMath(card).find(x => x.issue.includes('Currency'))).toBeUndefined();
  });
});
