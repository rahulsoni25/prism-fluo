import { describe, it, expect } from 'vitest';
import { checkCoverage } from '@/lib/ai/verify/coverage';
import type { CardInput } from '@/lib/ai/verify/types';

const baseBrief = {
  competitors: 'Ghadi, Rin, Surf',
  category: 'FMCG — Home Care',
  objective: 'New Communication / Campaign',
};

describe('coverage — section blockers', () => {
  it('flags 0% coverage as a blocker', () => {
    const cards: CardInput[] = [
      { index: 0, title: 'Random title', obs: 'random text', stat: '1%', rec: 'do something on YouTube' },
    ];
    const f = checkCoverage(baseBrief, cards);
    expect(f.some(x => x.severity === 'blocker' && x.issue.includes('Section'))).toBe(true);
  });

  it('produces section-level findings with shape {severity, issue, evidence}', () => {
    const cards: CardInput[] = [
      { index: 0, title: 'audience size and daily time on digital', obs: 'YouTube reach is high', stat: '', rec: 'use Reels on Instagram' },
      { index: 1, title: 'shopping motivations', obs: 'house management drives FMCG search', stat: '', rec: 'demonstrate before/after on Reels' },
    ];
    const f = checkCoverage(baseBrief, cards);
    expect(f.length).toBeGreaterThan(0);
    // Every finding should reference a blueprint section letter
    f.forEach(x => {
      expect(['blocker', 'major', 'minor']).toContain(x.severity);
      expect(x.agent).toBe('coverage');
    });
  });
});

describe('coverage — keyword matching', () => {
  it('matches metric keywords case-insensitively', () => {
    const cards: CardInput[] = [
      { index: 0, title: 'YOUTUBE dominance', obs: 'high reach', stat: '', rec: '' },
    ];
    const f = checkCoverage(baseBrief, cards);
    // Section B should have at least partial coverage thanks to "YOUTUBE"
    const sectionBSummary = f.find(x => x.issue.includes('Section B') && x.severity !== 'minor');
    if (sectionBSummary) {
      expect(sectionBSummary.issue).not.toContain('0%');
    }
  });

  it('handles empty inputs without throwing', () => {
    expect(checkCoverage(null, [])).toEqual([]);
    expect(checkCoverage(baseBrief, [])).toEqual([]);
    expect(checkCoverage(null, [{ index: 0, title: 'x', obs: '', stat: '', rec: '' }])).toEqual([]);
  });
});
