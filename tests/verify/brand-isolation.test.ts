/**
 * Tests for the BrandIsolation agent — catches foreign brand leaks +
 * placeholder leaks before they ship to clients.
 *
 * This is the "client-credibility" guard. Tests cover all 5 rules:
 *   - foreign-brand-leak (blocker)
 *   - placeholder-leak   (blocker)
 *   - brand-never-mentioned (major)
 *   - brand-mention-thin (minor)
 *   - happy path (zero findings when output is clean + brand-grounded)
 */
import { describe, it, expect } from 'vitest';
import { checkBrandIsolation } from '@/lib/ai/verify/brand-isolation';
import type { CardInput } from '@/lib/ai/verify/types';

function card(overrides: Partial<CardInput> & { index?: number }): CardInput {
  return {
    index: overrides.index ?? 0,
    title: overrides.title ?? '',
    obs:   overrides.obs   ?? '',
    stat:  overrides.stat  ?? '',
    rec:   overrides.rec   ?? '',
    bucket: 'content',
  } as any;
}

describe('foreign-brand-leak rule', () => {
  it('flags BLOCKER when a foreign brand appears for a different brief', () => {
    const r = checkBrandIsolation({
      cards: [card({
        title: 'Headline about category',
        obs:   'Ghadi Detergent Female 2 spend 14 hrs on YouTube.',
        rec:   'Build creative around the audience.',
      })],
      briefBrand:       'Sargam Detergent',
      briefCompetitors: 'Surf Excel, Tide',  // Ghadi NOT listed
    });
    const leak = r.findings.find(f => f.rule === 'foreign-brand-leak');
    expect(leak).toBeDefined();
    expect(leak!.severity).toBe('blocker');
    expect(leak!.issue).toContain('ghadi');
    expect(r.foreignLeaks).toContain('ghadi');
  });

  it('allows the brief\'s OWN brand wherever it appears', () => {
    const r = checkBrandIsolation({
      cards: [card({
        title: 'Sargam Detergent reaches new high',
        obs:   'Sargam Detergent Female 2 demonstrate intent.',
        rec:   'Push Sargam Detergent creative on Reels.',
      })],
      briefBrand:       'Sargam Detergent',
      briefCompetitors: null,
    });
    const leaks = r.findings.filter(f => f.rule === 'foreign-brand-leak');
    expect(leaks).toHaveLength(0);
  });

  it('allows competitors when listed in brief.competitors', () => {
    const r = checkBrandIsolation({
      cards: [card({
        title: 'Sargam vs Ariel',
        obs:   'Sargam Detergent trails Ariel by 4 pts on consideration.',
        rec:   'Close the gap on Ariel.',
      })],
      briefBrand:       'Sargam Detergent',
      briefCompetitors: 'Ariel, Surf Excel, Tide',
    });
    const leaks = r.findings.filter(f => f.rule === 'foreign-brand-leak');
    expect(leaks).toHaveLength(0);
  });

  it('flags multiple foreign brand leaks across cards', () => {
    const r = checkBrandIsolation({
      cards: [
        card({ index: 0, obs: 'Ghadi is the leader.' }),
        card({ index: 1, rec: 'Position against Surf Excel.' }),
      ],
      briefBrand:       'Sargam Detergent',
      briefCompetitors: 'Tide',
    });
    expect(r.foreignLeaks.length).toBeGreaterThanOrEqual(2);
    expect(r.foreignLeaks).toContain('ghadi');
    expect(r.foreignLeaks).toContain('surf excel');
  });
});

describe('placeholder-leak rule', () => {
  it('flags BLOCKER when "BrandX" appears verbatim', () => {
    const r = checkBrandIsolation({
      cards: [card({
        obs: 'BrandX Female 2 spend more on YouTube than peers.',
      })],
      briefBrand: 'Sargam Detergent',
      briefCompetitors: null,
    });
    const ph = r.findings.find(f => f.rule === 'placeholder-leak');
    expect(ph).toBeDefined();
    expect(ph!.severity).toBe('blocker');
    expect(r.placeholderLeaks).toContain('brandx');
  });

  it('flags template placeholders like ${brand}', () => {
    const r = checkBrandIsolation({
      cards: [card({ rec: 'Push ${brand} creative on Reels.' })],
      briefBrand: 'Sargam Detergent',
      briefCompetitors: null,
    });
    expect(r.placeholderLeaks.length).toBeGreaterThan(0);
  });
});

describe('brand-never-mentioned rule', () => {
  it('flags MAJOR when no card mentions the brief brand', () => {
    const r = checkBrandIsolation({
      cards: [
        card({ obs: 'The category is fragmented.' }),
        card({ rec: 'Build creative on Reels.' }),
      ],
      briefBrand:       'Sargam Detergent',
      briefCompetitors: null,
    });
    const f = r.findings.find(x => x.rule === 'brand-never-mentioned');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('major');
  });

  it('does NOT fire when even one card mentions the brand', () => {
    const r = checkBrandIsolation({
      cards: [
        card({ obs: 'The category is fragmented.' }),
        card({ rec: 'Sargam Detergent should target younger audiences.' }),
      ],
      briefBrand:       'Sargam Detergent',
      briefCompetitors: null,
    });
    const f = r.findings.find(x => x.rule === 'brand-never-mentioned');
    expect(f).toBeUndefined();
  });
});

describe('brand-mention-thin rule', () => {
  it('flags MINOR when brand appears in <25% of a multi-card analysis', () => {
    const r = checkBrandIsolation({
      cards: [
        card({ index: 0, obs: 'Sargam Detergent wins.' }),
        ...Array.from({ length: 7 }, (_, i) => card({ index: i + 1, obs: 'Category trend.' })),
      ],
      briefBrand:       'Sargam Detergent',
      briefCompetitors: null,
    });
    const f = r.findings.find(x => x.rule === 'brand-mention-thin');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('minor');
  });

  it('does NOT fire when brand mentioned on ≥25% of cards', () => {
    const r = checkBrandIsolation({
      cards: Array.from({ length: 8 }, (_, i) =>
        card({ index: i, obs: i < 4 ? 'Sargam Detergent wins.' : 'Category trend.' }),
      ),
      briefBrand:       'Sargam Detergent',
      briefCompetitors: null,
    });
    const f = r.findings.find(x => x.rule === 'brand-mention-thin');
    expect(f).toBeUndefined();
  });
});

describe('happy path — clean analysis', () => {
  it('zero findings when brand is named on most cards and no foreign brands appear', () => {
    const r = checkBrandIsolation({
      cards: [
        card({ obs: 'Sargam Detergent metro audience leans premium.' }),
        card({ obs: 'Sargam Detergent SOV ahead of Tide in Mumbai.' }),
        card({ rec: 'Sargam Detergent should double down on Reels.' }),
        card({ obs: 'Sargam Detergent is best for Tier 1 cities.' }),
      ],
      briefBrand:       'Sargam Detergent',
      briefCompetitors: 'Tide, Wheel',
    });
    expect(r.findings).toHaveLength(0);
    expect(r.cardsCitingBrand).toBe(4);
    expect(r.foreignLeaks).toHaveLength(0);
    expect(r.placeholderLeaks).toHaveLength(0);
  });

  it('handles null brief.brand gracefully (no crashes, but flags weak)', () => {
    const r = checkBrandIsolation({
      cards: [card({ obs: 'Category is growing.' })],
      briefBrand: null,
      briefCompetitors: null,
    });
    // No brief.brand → can't enforce brand-mentioned rule; should not crash
    expect(r.findings).toBeDefined();
    expect(r.foreignLeaks).toHaveLength(0);
  });
});
