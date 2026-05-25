/**
 * Tests for the focus-question parser + validator helpers (the pure logic
 * pieces — the DB-touching parts are exercised by integration).
 */
import { describe, it, expect, vi } from 'vitest';

// Mock the db module before importing the validator
vi.mock('@/lib/db/client', () => ({
  db: {
    query: vi.fn().mockResolvedValue({ rows: [] }),
  },
}));

import { validateFocusQuestions } from '@/lib/mapper/focus-validator';

describe('focus question parsing — line splitting', () => {
  it('splits multi-line input into separate questions', async () => {
    const r = await validateFocusQuestions('any-id', `
      What are top trending searches in Tier 2?
      Think about defending vs attacking.
      Which competitors gained ground in 90 days?
    `);
    expect(r.length).toBe(3);
  });

  it('caps at 10 questions', async () => {
    const text = Array.from({ length: 15 }, (_, i) => `Question ${i + 1}?`).join('\n');
    const r = await validateFocusQuestions('any-id', text);
    expect(r.length).toBeLessThanOrEqual(10);
  });

  it('returns empty array for empty input', async () => {
    expect(await validateFocusQuestions('any-id', '')).toEqual([]);
    expect(await validateFocusQuestions('any-id', '   ')).toEqual([]);
  });
});

describe('focus question classification — direction vs question', () => {
  it('detects "Think about X" as direction (no data validation)', async () => {
    const r = await validateFocusQuestions('any-id', 'Think about defending share vs attacking.');
    expect(r[0].status).toBe('direction');
  });

  it('detects "Consider X" as direction', async () => {
    const r = await validateFocusQuestions('any-id', 'Consider how Tier 2 audiences differ from metro.');
    expect(r[0].status).toBe('direction');
  });

  it('detects "Frame conclusions around X" as direction', async () => {
    const r = await validateFocusQuestions('any-id', 'Frame conclusions around the festive season opportunity.');
    expect(r[0].status).toBe('direction');
  });

  it('detects "What/Which/How" questions as question-shaped (not direction)', async () => {
    const r = await validateFocusQuestions('any-id', 'What are the top categories?');
    expect(r[0].status).not.toBe('direction');
  });
});

describe('focus question topic detection — unanswerable when data missing', () => {
  // db mocked to return no uploads → all data missing
  it('"price sensitivity" → unanswerable (no keyword data)', async () => {
    const r = await validateFocusQuestions('any-id', 'What is the price sensitivity for Tier 2?');
    expect(r[0].status === 'unanswerable' || r[0].status === 'partial').toBe(true);
    expect(r[0].reason.toLowerCase()).toMatch(/missing|data needed/);
  });

  it('"social sentiment" → unanswerable (no social listening data)', async () => {
    const r = await validateFocusQuestions('any-id', 'What is the social sentiment around the brand?');
    expect(r[0].status === 'unanswerable' || r[0].status === 'partial').toBe(true);
  });

  it('"trending searches last 90 days" → unanswerable (no keyword data)', async () => {
    const r = await validateFocusQuestions('any-id', 'What trending queries appeared in the last 90 days?');
    expect(r[0].status === 'unanswerable' || r[0].status === 'partial').toBe(true);
  });
});

describe('focus question — partial when topic detected but unmappable', () => {
  it('generic question with no topic match returns partial', async () => {
    const r = await validateFocusQuestions('any-id', 'What is interesting about this analysis?');
    expect(r[0].status).toBe('partial');
  });
});
