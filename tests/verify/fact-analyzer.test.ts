import { describe, it, expect } from 'vitest';
import { checkCardFacts } from '@/lib/ai/verify/fact-analyzer';
import type { CardInput } from '@/lib/ai/verify/types';

const baseCard: CardInput = { index: 0, title: 'X', obs: '', stat: '', rec: '' };

describe('fact-analyzer — tool scope', () => {
  it('flags a KEYWORD_PLANNER card making in-store claims', () => {
    const card: CardInput = {
      ...baseCard,
      toolLabel: 'KEYWORD_PLANNER',
      obs: 'Improve in-store visibility through shelf placement.',
    };
    const f = checkCardFacts(card, 'Sargam');
    expect(f.some(x => x.issue.includes('in-store') || x.issue.includes('cannot legitimately'))).toBe(true);
  });

  it('passes a KEYWORD_PLANNER card with on-topic claim', () => {
    const card: CardInput = {
      ...baseCard,
      toolLabel: 'KEYWORD_PLANNER',
      obs: 'Search volume for "fragrance detergent" is rising 24% YoY.',
    };
    expect(checkCardFacts(card, 'Sargam')).toEqual([]);
  });
});

describe('fact-analyzer — self-contradiction', () => {
  it('flags obs and stat in opposite directions', () => {
    const card: CardInput = {
      ...baseCard,
      obs: 'Sales are rising fast across the segment.',
      stat: 'Down 18% YoY',
    };
    const f = checkCardFacts(card, null);
    expect(f.some(x => x.issue.includes('opposite directions'))).toBe(true);
  });

  it('does not flag aligned direction', () => {
    const card: CardInput = {
      ...baseCard,
      obs: 'Sales are rising fast across the segment.',
      stat: '+18% YoY rise',
    };
    expect(checkCardFacts(card, null).find(x => x.issue.includes('opposite'))).toBeUndefined();
  });
});

describe('fact-analyzer — quoted keyword check', () => {
  it('flags quoted term not in chart labels', () => {
    const card: CardInput = {
      ...baseCard,
      obs: 'Term "ghost-detergent" leads the cluster.',
      computedChartData: { labels: ['tide', 'rin', 'surf'] },
    };
    const f = checkCardFacts(card, null);
    expect(f.some(x => x.evidence === 'ghost-detergent')).toBe(true);
  });

  it('accepts quoted term that appears in labels', () => {
    const card: CardInput = {
      ...baseCard,
      obs: 'Term "tide" leads.',
      computedChartData: { labels: ['tide washing powder', 'rin'] },
    };
    expect(checkCardFacts(card, null).find(x => x.evidence === 'tide')).toBeUndefined();
  });
});
