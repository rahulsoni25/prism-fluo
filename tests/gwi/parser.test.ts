/**
 * Tests for the generalized GWI parser — inferQuestionType detection
 * across the 7 canonical GWI question shapes.
 */
import { describe, it, expect } from 'vitest';
import { inferQuestionType } from '@/lib/gwi/parser';

describe('inferQuestionType — explicit col 0 phrases', () => {
  it.each([
    ['Time spent on social media',              [], 'time_spent'],
    ['Time spent in a typical day on YouTube',  [], 'time_spent'],
    ['Hours per day on streaming',              [], 'time_spent'],
    ['TV genres watched',                       [], 'tv_genres'],
    ['TV shows watched in the last month',      [], 'tv_genres'],
    ['Music genres listened to',                [], 'music_genres'],
    ['Interests — this question combines data',  [], 'content_topics'],
    ['Topics audience is interested in',         [], 'content_topics'],
    ['Streaming services used',                  [], 'streaming_services'],
    ['Social media services used',               [], 'social_platforms'],
    ['Social media platforms accounts followed', [], 'social_platforms'],
    ['Ownership of devices',                     [], 'devices'],
  ])('"%s" → %s', (col0Text, labels, expected) => {
    expect(inferQuestionType(col0Text, labels as string[])).toBe(expected);
  });
});

describe('inferQuestionType — row-label clustering', () => {
  it('detects TV genres from row labels alone (no clear col 0 hint)', () => {
    const labels = ['Drama', 'Comedy', 'Reality TV', 'News', 'Sports'];
    expect(inferQuestionType('Source: GWI', labels)).toBe('tv_genres');
  });

  it('detects music genres when Bollywood/Pop appear in label cluster', () => {
    const labels = ['Bollywood', 'Pop', 'Classical', 'Hip-hop'];
    expect(inferQuestionType('Source: GWI', labels)).toBe('music_genres');
  });

  it('detects content topics from interest-style row labels', () => {
    const labels = ['Fashion', 'Food', 'Travel', 'Tech', 'Beauty'];
    expect(inferQuestionType('Source: GWI', labels)).toBe('content_topics');
  });

  it('detects streaming services from platform name labels', () => {
    const labels = ['Hotstar', 'Netflix', 'JioCinema', 'Prime Video'];
    expect(inferQuestionType('Source: GWI', labels)).toBe('streaming_services');
  });

  it('detects social platforms from app name labels', () => {
    const labels = ['Instagram', 'WhatsApp', 'YouTube', 'Facebook'];
    expect(inferQuestionType('Source: GWI', labels)).toBe('social_platforms');
  });

  it('detects devices from device-name labels', () => {
    const labels = ['Mobile', 'Laptop', 'Tablet', 'Smart TV'];
    expect(inferQuestionType('Source: GWI', labels)).toBe('devices');
  });
});

describe('inferQuestionType — fallback', () => {
  it('returns "unknown" when no signal matches', () => {
    expect(inferQuestionType('Some other GWI question', ['Foo', 'Bar', 'Baz'])).toBe('unknown');
  });

  it('returns "unknown" on empty inputs', () => {
    expect(inferQuestionType('', [])).toBe('unknown');
  });
});

describe('inferQuestionType — priority (col 0 wins over label cluster)', () => {
  it('explicit "time spent" col 0 wins even if labels look genre-ish', () => {
    expect(inferQuestionType('Time spent on streaming', ['Drama', 'Comedy', 'Reality'])).toBe('time_spent');
  });

  it('explicit "TV genres" col 0 wins even if labels look topic-ish', () => {
    expect(inferQuestionType('TV genres watched', ['Fashion', 'Food', 'Travel'])).toBe('tv_genres');
  });
});
