/**
 * Tests for the ProofReader agent.
 * Covers rule-based catches (jargon, title length, brand consistency,
 * recommendation specificity, currency style, observation length) + a
 * minimal "card is clean" baseline.
 */

import { describe, it, expect } from 'vitest';
import { proofreadCard, proofreaderConfirms } from '@/lib/ai/verify/proofreader';
import type { CardInput, Finding } from '@/lib/ai/verify/types';

const cleanCard: CardInput = {
  index: 0,
  title: 'Sargam Detergent Wins on Trust',
  obs:   'Sabina prefers brands with consistent fragrance over price savings.',
  stat:  '67% of homemakers cite fragrance as a top driver.',
  rec:   'Run a 15-second Reel on Instagram showing the unboxing fragrance moment.',
};

describe('proofreader — clean baseline', () => {
  it('finds nothing on a well-formed card', async () => {
    const findings = await proofreadCard(cleanCard, 'Sargam');
    expect(findings).toEqual([]);
  });
});

describe('proofreader — title checks', () => {
  it('flags truncated title (trailing "Not Just")', async () => {
    const f = await proofreadCard({ ...cleanCard, title: 'White School Uniforms Are Not Just' }, 'Sargam');
    expect(f.some(x => x.kind === undefined ? false : true)).toBeDefined();
    const blocker = f.find(x => x.severity === 'blocker');
    expect(blocker?.issue).toMatch(/truncated/i);
  });

  it('flags overly long title (15+ words)', async () => {
    const f = await proofreadCard({
      ...cleanCard,
      title: 'A really very long title that goes on and on and on with too many words for a headline',
    }, 'Sargam');
    expect(f.some(x => x.issue.includes('words'))).toBe(true);
  });

  it('flags lowercase-only title', async () => {
    const f = await proofreadCard({ ...cleanCard, title: 'sargam detergent wins on trust' }, 'Sargam');
    expect(f.some(x => x.issue.includes('lowercase'))).toBe(true);
  });

  it('flags brand stem with wrong capitalisation as blocker', async () => {
    const f = await proofreadCard({ ...cleanCard, title: 'sargam wins on trust mid-tier' }, 'Sargam');
    const brandBlocker = f.find(x => x.severity === 'blocker' && x.issue.toLowerCase().includes('capitalised'));
    expect(brandBlocker).toBeDefined();
  });
});

describe('proofreader — jargon ban-list', () => {
  it.each([
    ['leverage', 'leverage our brand presence'],
    ['synergy', 'create synergy across platforms'],
    ['holistic', 'a holistic view of the audience'],
    ['unlock', 'unlock new consumer segments'],
    ['ecosystem', 'in the digital ecosystem'],
    ['paradigm', 'shift the paradigm'],
  ])('flags banned word "%s" in observation', async (word, text) => {
    const f = await proofreadCard({ ...cleanCard, obs: text }, 'Sargam');
    expect(f.some(x => x.issue.toLowerCase().includes(word))).toBe(true);
  });
});

describe('proofreader — recommendation specificity', () => {
  it('flags rec with no platform AND no format', async () => {
    const f = await proofreadCard({
      ...cleanCard,
      rec: 'Create good content for the target audience.',
    }, 'Sargam');
    const rec = f.find(x => x.field === 'rec' && x.issue.includes('platform'));
    expect(rec).toBeDefined();
  });

  it('passes rec with a platform name', async () => {
    const f = await proofreadCard({
      ...cleanCard,
      rec: 'Run a campaign on YouTube targeting tier-2 mothers.',
    }, 'Sargam');
    expect(f.some(x => x.field === 'rec' && x.issue.includes('platform'))).toBe(false);
  });
});

describe('proofreader — currency style', () => {
  it('flags mixed ₹ and Rs.', async () => {
    const f = await proofreadCard({
      ...cleanCard,
      stat: 'Category is ₹45,000 Cr but the audience reach is Rs. 12 Cr',
    }, 'Sargam');
    expect(f.some(x => x.issue.includes('₹'))).toBe(true);
  });

  it('flags missing space before Cr', async () => {
    const f = await proofreadCard({
      ...cleanCard,
      stat: 'Total addressable: ₹12.7Cr per year',
    }, 'Sargam');
    expect(f.some(x => x.issue.includes('Cr'))).toBe(true);
  });
});

describe('proofreader — observation length', () => {
  it('flags observation with 4+ sentences', async () => {
    const f = await proofreadCard({
      ...cleanCard,
      obs: 'Sabina is busy. She has two kids. Her income is limited. She values fragrance and price equally.',
    }, 'Sargam');
    expect(f.some(x => x.issue.includes('sentences'))).toBe(true);
  });
});

describe('proofreader — cross-confirm', () => {
  it('confirms a jargon finding from another agent', () => {
    const otherFinding: Finding = {
      agent: 'fact-analyzer', field: 'obs', severity: 'major',
      issue: 'jargon: leverage', evidence: 'leverage',
    };
    const card: CardInput = { ...cleanCard, obs: 'we should leverage the data' };
    expect(proofreaderConfirms(otherFinding, card)).toBe(true);
  });

  it('confirms blocker findings on principle', () => {
    const otherFinding: Finding = {
      agent: 'fact-analyzer', field: 'obs', severity: 'blocker', issue: 'something bad',
    };
    expect(proofreaderConfirms(otherFinding, cleanCard)).toBe(true);
  });
});
