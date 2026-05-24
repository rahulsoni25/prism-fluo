/**
 * Tests for the date-range filter helpers used by all 3 admin history pages.
 * Pure functions — no React, no DOM.
 */
import { describe, it, expect } from 'vitest';
import { filterByRange, rangeCounts, rowsToCsv } from '@/lib/admin/history-filters';

function ago(hours: number): string {
  return new Date(Date.now() - hours * 3600_000).toISOString();
}

const rows = [
  { id: '1', createdAt: ago(2),       label: 'fresh-2h'  },  // within 24h
  { id: '2', createdAt: ago(20),      label: 'fresh-20h' },  // within 24h
  { id: '3', createdAt: ago(48),      label: '2d'        },  // within 7d
  { id: '4', createdAt: ago(24 * 10), label: '10d'       },  // within 30d
  { id: '5', createdAt: ago(24 * 50), label: '50d'       },  // within 90d
  { id: '6', createdAt: ago(24 * 120),label: '120d'      },  // only 'all'
];

describe('filterByRange', () => {
  it('"all" returns every row unchanged', () => {
    expect(filterByRange(rows, 'all', 'createdAt')).toHaveLength(6);
  });

  it('"24h" keeps only rows from the last 24 hours', () => {
    const r = filterByRange(rows, '24h', 'createdAt');
    expect(r.map(x => x.id).sort()).toEqual(['1', '2']);
  });

  it('"7d" keeps rows from the last week', () => {
    const r = filterByRange(rows, '7d', 'createdAt');
    expect(r.map(x => x.id).sort()).toEqual(['1', '2', '3']);
  });

  it('"30d" keeps rows from the last 30 days', () => {
    const r = filterByRange(rows, '30d', 'createdAt');
    expect(r.map(x => x.id).sort()).toEqual(['1', '2', '3', '4']);
  });

  it('"90d" keeps rows from the last 90 days', () => {
    const r = filterByRange(rows, '90d', 'createdAt');
    expect(r.map(x => x.id).sort()).toEqual(['1', '2', '3', '4', '5']);
  });

  it('handles missing/null rows gracefully', () => {
    expect(filterByRange(null as any, '24h', 'createdAt')).toEqual([]);
    expect(filterByRange([], '24h', 'createdAt')).toEqual([]);
  });

  it('falls back across multiple date-field names (generatedAt / at)', () => {
    const mixed = [
      { id: 'a', generatedAt: ago(2)  },
      { id: 'b', at:          ago(2)  },
      { id: 'c', created_at:  ago(2)  },
    ];
    // dateField doesn't exist on any row → helper falls through to the well-known field names
    expect(filterByRange(mixed, '24h', 'nonexistent').map(x => x.id).sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('rangeCounts', () => {
  it('counts cumulative entries per bucket', () => {
    const c = rangeCounts(rows, 'createdAt');
    expect(c['24h']).toBe(2);   // 2 in last day
    expect(c['7d']).toBe(3);    // 2 + 1
    expect(c['30d']).toBe(4);   // ... + 1
    expect(c['90d']).toBe(5);   // ... + 1
    expect(c.all).toBe(6);      // every row
  });

  it('zero counts for empty array', () => {
    const c = rangeCounts([], 'createdAt');
    expect(c['24h']).toBe(0);
    expect(c.all).toBe(0);
  });

  it('handles null input', () => {
    const c = rangeCounts(null as any, 'createdAt');
    expect(c.all).toBe(0);
  });
});

describe('rowsToCsv', () => {
  it('returns empty string for null/empty input', () => {
    expect(rowsToCsv([])).toBe('');
    expect(rowsToCsv(null as any)).toBe('');
  });

  it('emits header row + one data row per object', () => {
    const csv = rowsToCsv([{ id: 1, name: 'A' }, { id: 2, name: 'B' }]);
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('id,name');
    expect(lines[1]).toBe('1,A');
    expect(lines[2]).toBe('2,B');
  });

  it('escapes values containing commas, quotes, or newlines (RFC 4180)', () => {
    const csv = rowsToCsv([{ note: 'Hello, world' }, { note: 'She said "hi"' }, { note: 'line1\nline2' }]);
    const lines = csv.split('\r\n');
    expect(lines[1]).toBe('"Hello, world"');
    expect(lines[2]).toBe('"She said ""hi"""');
    expect(lines[3]).toBe('"line1\nline2"');
  });

  it('unions keys across heterogeneous rows', () => {
    const csv = rowsToCsv([{ a: 1, b: 2 }, { a: 3, c: 4 }] as any);
    const header = csv.split('\r\n')[0].split(',').sort();
    expect(header).toEqual(['a', 'b', 'c']);   // all keys across rows
  });

  it('skips object-typed fields (would break CSV)', () => {
    const csv = rowsToCsv([{ id: 1, meta: { foo: 'bar' } }] as any);
    const header = csv.split('\r\n')[0].split(',').sort();
    expect(header).toContain('id');
    expect(header).not.toContain('meta');  // object-typed field excluded
  });
});
