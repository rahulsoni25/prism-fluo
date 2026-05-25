/**
 * Tests for the InsightQuality agent — the 7th member of the verification
 * council. Covers all 7 rules + happy path + helpers.
 */
import { describe, it, expect } from 'vitest';
import { checkInsightQuality } from '@/lib/ai/verify/insight-quality';
import type { CardInput } from '@/lib/ai/verify/types';

function card(overrides: Partial<CardInput> & { conviction?: number }): CardInput {
  return {
    index: 0,
    title: '',
    obs:   '',
    stat:  '',
    rec:   '',
    bucket: 'content',
    ...overrides,
  } as any;
}

describe('Rule 1 — datapoint density (no number in obs+stat)', () => {
  it('flags MAJOR when obs has no number AND stat has no number', () => {
    const f = checkInsightQuality(card({
      obs:  'The audience values trust and authenticity.',
      stat: 'meaningful signal',
    }));
    expect(f.some(x => x.rule === 'no-datapoint' && x.severity === 'major')).toBe(true);
  });

  it('passes when obs has a number', () => {
    const f = checkInsightQuality(card({
      obs:  '47% of Female 2 prefer premium detergent vs 33% total.',
      stat: '+14 pts gap',
    }));
    expect(f.some(x => x.rule === 'no-datapoint')).toBe(false);
  });

  it('passes when stat has a number even if obs is text-only', () => {
    const f = checkInsightQuality(card({
      obs:  'Premium positioning resonates with this segment.',
      stat: '47%',
    }));
    expect(f.some(x => x.rule === 'no-datapoint')).toBe(false);
  });
});

describe('Rule 2 — action-verb opener for rec', () => {
  it('flags when rec opens with "Continue"', () => {
    const f = checkInsightQuality(card({
      rec: 'Continue monitoring this trend across quarters.',
    }));
    expect(f.some(x => x.rule === 'no-action-verb')).toBe(true);
  });

  it('flags when rec opens with "Consider"', () => {
    const f = checkInsightQuality(card({
      rec: 'Consider exploring video formats.',
    }));
    expect(f.some(x => x.rule === 'no-action-verb')).toBe(true);
  });

  it('passes when rec opens with "Build"', () => {
    const f = checkInsightQuality(card({
      rec: 'Build a 9-second product card sized for the Blinkit grid.',
    }));
    expect(f.some(x => x.rule === 'no-action-verb')).toBe(false);
  });

  it('passes when rec uses labeled directives with imperatives (CREATIVE: Build…)', () => {
    const f = checkInsightQuality(card({
      rec: 'CREATIVE: Build a 9-sec Reels cut. MEDIA: Shift 30% of YouTube spend to Reels.',
    }));
    expect(f.some(x => x.rule === 'no-action-verb')).toBe(false);
  });

  it('flags labeled directive with non-imperative ("CREATIVE: Continue…")', () => {
    const f = checkInsightQuality(card({
      rec: 'CREATIVE: Continue testing creative angles. MEDIA: Shift budget.',
    }));
    expect(f.some(x => x.rule === 'no-action-verb')).toBe(true);
  });
});

describe('Rule 3 — concrete-specific in rec', () => {
  it('flags when rec has no platform/format/timeframe', () => {
    const f = checkInsightQuality(card({
      rec: 'Build creative around the audience and target their needs.',
    }));
    expect(f.some(x => x.rule === 'no-concrete-noun')).toBe(true);
  });

  it('passes when rec names a platform', () => {
    const f = checkInsightQuality(card({
      rec: 'Build a 9-sec Reels cut for festive launch.',
    }));
    expect(f.some(x => x.rule === 'no-concrete-noun')).toBe(false);
  });

  it('passes when rec names a timeframe', () => {
    const f = checkInsightQuality(card({
      rec: 'Test creative variants over the next 30 days.',
    }));
    expect(f.some(x => x.rule === 'no-concrete-noun')).toBe(false);
  });
});

describe('Rule 4 — dead opener in obs', () => {
  it.each([
    'The data shows that the audience prefers premium.',
    'This demonstrates a strong commerce signal.',
    'It is important to note that engagement is up.',
    'Interestingly, the segment over-indexes.',
    'The audience demonstrates significantly higher engagement.',
    'Notably, the trend is accelerating.',
  ])('flags dead opener: %s', (deadObs) => {
    const f = checkInsightQuality(card({ obs: `${deadObs} 47% pts gap.` }));
    expect(f.some(x => x.rule === 'dead-opener')).toBe(true);
  });

  it('passes when obs opens with a number or vivid scene', () => {
    const f = checkInsightQuality(card({
      obs: '47% of Female 2 abandon cart on Blinkit by minute 4 — and the choice is over by then.',
    }));
    expect(f.some(x => x.rule === 'dead-opener')).toBe(false);
  });
});

describe('Rule 5 — bare stat without context', () => {
  it('flags bare "47%" stat without comparator in obs', () => {
    const f = checkInsightQuality(card({
      obs:  '47% of users prefer this format.',  // no "vs" / "compared" / "average"
      stat: '47%',
    }));
    expect(f.some(x => x.rule === 'no-stat-context')).toBe(true);
  });

  it('passes when obs explains the comparator', () => {
    const f = checkInsightQuality(card({
      obs:  '47% of users prefer this vs 33% category average — a 14-point lead.',
      stat: '47%',
    }));
    expect(f.some(x => x.rule === 'no-stat-context')).toBe(false);
  });
});

describe('Rule 6 — conviction inflation', () => {
  it('flags conviction 90 on card with no numbers', () => {
    const f = checkInsightQuality(card({
      conviction: 90,
      obs:  'The audience values trust.',
      stat: 'strong signal',
    }));
    expect(f.some(x => x.rule === 'conviction-inflated')).toBe(true);
  });

  it('passes conviction 90 when obs has hard numbers', () => {
    const f = checkInsightQuality(card({
      conviction: 90,
      obs:  '47% conversion uplift vs 12% baseline — 3.9× the category norm.',
      stat: '47%',
    }));
    expect(f.some(x => x.rule === 'conviction-inflated')).toBe(false);
  });

  it('does not flag low conviction with no numbers', () => {
    const f = checkInsightQuality(card({
      conviction: 60,
      obs:  'The audience values trust.',
    }));
    expect(f.some(x => x.rule === 'conviction-inflated')).toBe(false);
  });
});

describe('Rule 7 — tension hinge in title', () => {
  it('flags title with no hinge or image', () => {
    const f = checkInsightQuality(card({
      title: 'Female Audience Shows Strong Performance',
    }));
    expect(f.some(x => x.rule === 'no-tension-hinge')).toBe(true);
  });

  it('passes title with "but" hinge', () => {
    const f = checkInsightQuality(card({
      title: 'Buys New Tech Early — But Blocks Every Ad She Sees',
    }));
    expect(f.some(x => x.rule === 'no-tension-hinge')).toBe(false);
  });

  it('passes title with vivid time/place image', () => {
    const f = checkInsightQuality(card({
      title: 'Reels at 11pm Beat Prime-Time TV Two-to-One',
    }));
    expect(f.some(x => x.rule === 'no-tension-hinge')).toBe(false);
  });

  it('does not flag very short titles', () => {
    const f = checkInsightQuality(card({ title: 'Buyers' }));
    expect(f.some(x => x.rule === 'no-tension-hinge')).toBe(false);
  });
});

describe('Happy path — strategist-quality card produces zero findings', () => {
  it('passes a fully-formed card', () => {
    const f = checkInsightQuality(card({
      conviction: 88,
      title:  "She's Already on Blinkit by the Time Your Cricket Ad Loads",
      obs:    '46% of Female 2 buy detergent online vs 33% Female total — a 13-point gap that the brand cedes to private labels in 4 seconds.',
      stat:   '46% online · +13 pts',
      rec:    'CREATIVE: Build a 9-second Blinkit product card. MEDIA: Shift 30% of YouTube spend to Reels for festive Q3.',
    }));
    expect(f).toHaveLength(0);
  });
});
