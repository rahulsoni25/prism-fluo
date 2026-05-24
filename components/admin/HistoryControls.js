'use client';
import { filterByRange, rangeCounts, rowsToCsv } from '@/lib/admin/history-filters';

// Re-export helpers so pages can import everything from this one path
export { filterByRange, rangeCounts };

/**
 * Shared controls for the 3 admin history pages (mapper / verification /
 * export). Provides:
 *   • Date range filter — last 24h / 7d / 30d / 90d / all
 *   • CSV export — downloads the FILTERED rows so admins can audit
 *     externally without paging through 50+ rows in the UI
 *
 * Props:
 *   range:    one of '24h' | '7d' | '30d' | '90d' | 'all'  (current value)
 *   onRange:  (newRange) => void
 *   rows:     the currently visible (range-filtered) rows for CSV export
 *   filename: base name for the downloaded CSV (no extension)
 *   counts:   optional { '24h': N, '7d': N, ... } to badge each pill
 */
export default function HistoryControls({ range, onRange, rows, filename, counts }) {
  const RANGES = [
    { key: '24h', label: '24h'  },
    { key: '7d',  label: '7 days' },
    { key: '30d', label: '30 days' },
    { key: '90d', label: '90 days' },
    { key: 'all', label: 'All' },
  ];

  function downloadCsv() {
    if (!rows || rows.length === 0) return;
    const csv = rowsToCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 12, flexWrap: 'wrap', marginBottom: 12,
    }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B', marginRight: 6, textTransform: 'uppercase', letterSpacing: '.08em' }}>
          Range
        </span>
        {RANGES.map(r => {
          const active = range === r.key;
          const count  = counts?.[r.key];
          return (
            <button
              key={r.key}
              onClick={() => onRange(r.key)}
              style={{
                padding: '5px 11px', borderRadius: 14,
                border: `1.5px solid ${active ? '#2563EB' : '#E2E8F0'}`,
                background: active ? '#EFF6FF' : '#fff',
                color: active ? '#1E40AF' : '#475569',
                fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'inherit',
              }}>
              {r.label}
              {typeof count === 'number' && (
                <span style={{
                  marginLeft: 5,
                  background: active ? '#DBEAFE' : '#F1F5F9',
                  color: active ? '#1E40AF' : '#64748B',
                  padding: '1px 6px', borderRadius: 8, fontSize: 10, fontWeight: 800,
                }}>{count}</span>
              )}
            </button>
          );
        })}
      </div>
      <button
        onClick={downloadCsv}
        disabled={!rows || rows.length === 0}
        title={rows && rows.length ? `Download ${rows.length} row(s) as CSV` : 'No rows to export'}
        style={{
          padding: '6px 14px', borderRadius: 8,
          border: '1px solid #CBD5E1',
          background: '#fff', color: '#0F172A',
          fontSize: 12, fontWeight: 700,
          cursor: (rows && rows.length) ? 'pointer' : 'not-allowed',
          opacity: (rows && rows.length) ? 1 : 0.5,
          fontFamily: 'inherit',
        }}>
        ⬇ Export CSV
      </button>
    </div>
  );
}
