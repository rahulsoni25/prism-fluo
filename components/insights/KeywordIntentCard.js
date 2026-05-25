'use client';
import { useEffect, useState } from 'react';

const INTENT_COLOR = {
  'brand-led':     { fg: '#7C3AED', bg: '#F5F3FF', label: 'Brand-led' },
  'transactional': { fg: '#059669', bg: '#ECFDF5', label: 'Transactional' },
  'informational': { fg: '#2563EB', bg: '#EFF6FF', label: 'Informational' },
  'category':      { fg: '#64748B', bg: '#F1F5F9', label: 'Category' },
};

function fmtVol(n) {
  if (n == null) return '—';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(Math.round(n));
}

function fmtPct(n) {
  if (n == null) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(0)}%`;
}

/**
 * KeywordIntentCard — Renders the 4-output keyword intent breakdown:
 *   • Intent mix (% of search volume per bucket)
 *   • Top branded search terms + volumes
 *   • Top non-branded/category searches + volumes
 *   • Trending queries from last 90 days
 *
 * Hides when no Keyword Planner data is uploaded for this brief
 * (consistent with GenreNuggetCard's honest-skip pattern).
 */
export default function KeywordIntentCard({ briefId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!briefId) { setLoading(false); return; }
    fetch(`/api/briefs/${briefId}/keyword-intent`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [briefId]);

  if (loading || !data?.nugget) return null;
  const n = data.nugget;
  if (n.totalKeywords === 0) return null;

  const Section = ({ title, rows, showTrend }) => {
    if (!rows || rows.length === 0) return null;
    return (
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: '#475569', marginBottom: 6 }}>
          {title}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {rows.map((r, i) => {
            const c = INTENT_COLOR[r.intent] || INTENT_COLOR.category;
            return (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'center', fontSize: 11.5 }}>
                <span style={{ color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.keyword}>
                  {r.keyword}
                </span>
                {showTrend && r.threeMonthChange != null && (
                  <span style={{ color: r.threeMonthChange > 0 ? '#059669' : '#DC2626', fontSize: 10.5, fontWeight: 700 }}>
                    {fmtPct(r.threeMonthChange)} 90d
                  </span>
                )}
                <span style={{ color: '#0F172A', fontWeight: 700, textAlign: 'right', minWidth: 50 }}>
                  {fmtVol(r.volume)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div style={{
      background: '#fff', borderRadius: 14, padding: '14px 18px',
      boxShadow: '0 1px 3px rgba(0,0,0,.04)',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: '#7C3AED' }}>
          🔍 Keyword Intent
        </div>
        <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.06em', color: '#065F46', background: '#D1FAE5', padding: '1px 6px', borderRadius: 8 }}>
          ● LIVE
        </span>
      </div>
      <div style={{ fontSize: 11, color: '#64748B', marginBottom: 10 }}>
        {n.totalKeywords.toLocaleString()} keywords · {fmtVol(n.totalVolume)} monthly searches · {n.source}
      </div>

      {/* Intent mix bar */}
      <div style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: '#475569', marginBottom: 6 }}>
          Intent mix (by search volume)
        </div>
        <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', background: '#F1F5F9' }}>
          {n.intentMix.map((m, i) => {
            const c = INTENT_COLOR[m.intent];
            if (m.pctOfVolume < 1) return null;
            return (
              <div key={i}
                title={`${c.label}: ${m.pctOfVolume.toFixed(1)}% · ${m.count} keywords · ${fmtVol(m.volume)} searches`}
                style={{ width: `${m.pctOfVolume}%`, background: c.fg, height: '100%' }}
              />
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
          {n.intentMix.filter(m => m.pctOfVolume >= 1).map((m, i) => {
            const c = INTENT_COLOR[m.intent];
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10.5 }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: c.fg }} />
                <span style={{ color: '#475569', fontWeight: 600 }}>{c.label}</span>
                <span style={{ color: '#0F172A', fontWeight: 700 }}>{m.pctOfVolume.toFixed(0)}%</span>
              </div>
            );
          })}
        </div>
      </div>

      <Section title="Top branded search terms" rows={n.topBranded} />
      <Section title="Top non-branded / category" rows={n.topNonBranded} />
      <Section title="Trending queries (last 90 days)" rows={n.trending90d} showTrend />

      {/* Cross-ref pills */}
      <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed #E2E8F0', fontSize: 10.5, color: '#94A3B8' }}>
        <span style={{ background: '#F5F3FF', color: '#7C3AED', padding: '1px 6px', borderRadius: 4, fontWeight: 700, marginRight: 6 }}>
          SEARCH
        </span>
        Active-query axis · per Option B classifier spec
      </div>
    </div>
  );
}
