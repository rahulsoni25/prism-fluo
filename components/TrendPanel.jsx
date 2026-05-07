'use client';
/**
 * TrendPanel — Live Google Trends widget for the PRISM dashboard.
 *
 * Features:
 * - Keyword search input (pre-fills from briefs)
 * - Interest Over Time sparkline (SVG, no charting library needed)
 * - Rising & Top queries with pill badges
 * - 4 Gemini insight cards derived from trends data
 * - 6h cached — won't hammer Google on every page load
 */

import { useState, useEffect, useCallback } from 'react';

// ── Colour helpers ─────────────────────────────────────────────
const TREND_COLOR = {
  rising:  { text: '#059669', bg: '#D1FAE5', arrow: '↑' },
  falling: { text: '#DC2626', bg: '#FEE2E2', arrow: '↓' },
  stable:  { text: '#D97706', bg: '#FEF3C7', arrow: '→' },
};

const BUCKET_META = {
  content:       { icon: '📝', color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
  commerce:      { icon: '🛒', color: '#0369A1', bg: '#F0F9FF', border: '#BAE6FD' },
  communication: { icon: '📢', color: '#065F46', bg: '#ECFDF5', border: '#A7F3D0' },
  culture:       { icon: '🌍', color: '#92400E', bg: '#FFFBEB', border: '#FDE68A' },
};

// ── Tiny SVG sparkline ─────────────────────────────────────────
function Sparkline({ points, color = '#3B82F6' }) {
  if (!points || points.length < 2) return null;
  const W = 320, H = 60, PAD = 4;
  const vals  = points.map(p => p.value);
  const minV  = Math.min(...vals);
  const maxV  = Math.max(...vals) || 1;
  const range = maxV - minV || 1;

  const coords = points.map((p, i) => {
    const x = PAD + ((i / (points.length - 1)) * (W - PAD * 2));
    const y = H - PAD - (((p.value - minV) / range) * (H - PAD * 2));
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  // Fill polygon
  const fillCoords = [
    `${PAD},${H - PAD}`,
    ...coords,
    `${W - PAD},${H - PAD}`,
  ].join(' ');

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={`tg_${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon
        points={fillCoords}
        fill={`url(#tg_${color.replace('#','')})`}
      />
      <polyline
        points={coords.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Last point dot */}
      {coords.length > 0 && (() => {
        const last = coords[coords.length - 1].split(',');
        return <circle cx={last[0]} cy={last[1]} r="3.5" fill={color} />;
      })()}
    </svg>
  );
}

// ── Query pill ─────────────────────────────────────────────────
function QueryPill({ text, value, isBreakout, isRising }) {
  const bg     = isBreakout ? '#FEF9C3' : isRising ? '#F0FDF4' : '#F1F5F9';
  const color  = isBreakout ? '#854D0E' : isRising ? '#166534' : '#475569';
  const badge  = isBreakout ? '🔥 Breakout' : isRising ? `+${value}%` : `${value}`;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '6px 10px', borderRadius: 8, background: bg,
      marginBottom: 4, gap: 8,
    }}>
      <span style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>{text}</span>
      <span style={{ fontSize: 10, fontWeight: 700, color, flexShrink: 0 }}>{badge}</span>
    </div>
  );
}

// ── Insight card ───────────────────────────────────────────────
function InsightCard({ card }) {
  const meta = BUCKET_META[card.bucket] || BUCKET_META.content;
  return (
    <div style={{
      background: '#fff',
      border: `1px solid ${meta.border}`,
      borderRadius: 12, padding: '16px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <span style={{
          width: 28, height: 28, borderRadius: 7, background: meta.bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
        }}>{meta.icon}</span>
        <span style={{ fontSize: 10, fontWeight: 800, color: meta.color, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {card.bucket}
        </span>
        <span style={{
          marginLeft: 'auto', fontSize: 9, fontWeight: 700, color: '#9CA3AF',
          border: '1px solid #E5E7EB', borderRadius: 999, padding: '1px 6px',
        }}>Google Trends</span>
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', lineHeight: 1.4, marginBottom: 8 }}>
        {card.title}
      </div>

      <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.6, marginBottom: 8 }}>
        {card.obs}
      </div>

      {card.stat && (
        <div style={{
          fontSize: 11, fontWeight: 700, color: meta.color,
          background: meta.bg, padding: '4px 8px',
          borderRadius: 6, marginBottom: 8, display: 'inline-block',
        }}>
          📈 {card.stat}
        </div>
      )}

      <div style={{
        fontSize: 11, color: '#6B7280',
        borderTop: '1px solid #F3F4F6', paddingTop: 8, lineHeight: 1.5,
      }}>
        → {card.rec}
      </div>
    </div>
  );
}

// ── Main TrendPanel ────────────────────────────────────────────
export default function TrendPanel({ defaultKeyword = '', brandContext = '' }) {
  const [query,       setQuery]       = useState(defaultKeyword);
  const [input,       setInput]       = useState(defaultKeyword);
  const [trendsData,  setTrendsData]  = useState(null);
  const [insights,    setInsights]    = useState(null);
  const [loadingT,    setLoadingT]    = useState(false);
  const [loadingI,    setLoadingI]    = useState(false);
  const [errorT,      setErrorT]      = useState('');
  const [errorI,      setErrorI]      = useState('');
  const [activeTab,   setActiveTab]   = useState('chart'); // 'chart' | 'insights'

  // Auto-fetch when defaultKeyword is provided
  useEffect(() => {
    if (defaultKeyword && defaultKeyword !== query) {
      setInput(defaultKeyword);
      setQuery(defaultKeyword);
    }
  }, [defaultKeyword]);

  const fetchTrends = useCallback(async (kw) => {
    if (!kw?.trim()) return;
    setLoadingT(true);
    setErrorT('');
    setTrendsData(null);
    setInsights(null);
    setErrorI('');

    try {
      const res = await fetch(`/api/trends?q=${encodeURIComponent(kw)}&geo=IN&period=today%203-m`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Trends fetch failed');
      setTrendsData(data);
    } catch (e) {
      setErrorT(e.message);
    } finally {
      setLoadingT(false);
    }
  }, []);

  const fetchInsights = useCallback(async (td) => {
    if (!td) return;
    setLoadingI(true);
    setErrorI('');

    try {
      const res = await fetch('/api/trends/insights', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          ...td,
          brandContext: brandContext || td.keyword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Insights failed');
      setInsights(data);
    } catch (e) {
      setErrorI(e.message);
    } finally {
      setLoadingI(false);
    }
  }, [brandContext]);

  // When trends data arrives, auto-fetch insights
  useEffect(() => {
    if (trendsData) fetchInsights(trendsData);
  }, [trendsData, fetchInsights]);

  // Auto-search on mount if keyword given
  useEffect(() => {
    if (defaultKeyword) fetchTrends(defaultKeyword);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSearch(e) {
    e?.preventDefault();
    const kw = input.trim();
    if (kw) { setQuery(kw); fetchTrends(kw); }
  }

  const trendMeta = trendsData ? (TREND_COLOR[trendsData.trend] || TREND_COLOR.stable) : null;

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #E2E8F0',
      borderRadius: 16,
      padding: '24px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      marginBottom: 28,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 9,
          background: 'linear-gradient(135deg,#EA4335,#FBBC05)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18,
        }}>📈</div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A' }}>Live Google Trends</div>
          <div style={{ fontSize: 11, color: '#6B7280' }}>Real-time search interest — India · Last 90 days</div>
        </div>

        {trendsData && trendMeta && (
          <div style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
            background: trendMeta.bg, borderRadius: 8, padding: '6px 12px',
          }}>
            <span style={{ fontSize: 14 }}>{trendMeta.arrow}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: trendMeta.text, textTransform: 'capitalize' }}>
              {trendsData.trend}
            </span>
            {trendsData.peakWeek && (
              <span style={{ fontSize: 10, color: '#6B7280', marginLeft: 4 }}>
                Peak: {trendsData.peakWeek}
              </span>
            )}
            {trendsData.cached && (
              <span style={{ fontSize: 9, fontWeight: 700, background: '#F0FDF4', color: '#166534', borderRadius: 999, padding: '1px 5px' }}>
                CACHED
              </span>
            )}
          </div>
        )}
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Enter brand, category, or keyword (e.g. Nike India, Blinkit, IPL)"
          style={{
            flex: 1, padding: '9px 14px', borderRadius: 9,
            border: '1.5px solid #E2E8F0', fontSize: 13, color: '#0F172A',
            outline: 'none', fontFamily: 'Inter, sans-serif',
          }}
          onFocus={e => e.target.style.borderColor = '#3B82F6'}
          onBlur={e => e.target.style.borderColor = '#E2E8F0'}
        />
        <button
          type="submit"
          disabled={loadingT || !input.trim()}
          style={{
            padding: '9px 20px', borderRadius: 9, border: 'none',
            background: loadingT || !input.trim() ? '#E5E7EB' : 'linear-gradient(135deg,#EA4335,#FBBC05)',
            color: loadingT || !input.trim() ? '#9CA3AF' : '#fff',
            fontWeight: 700, fontSize: 13, cursor: loadingT ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Inter, sans-serif',
          }}
        >
          {loadingT ? '⏳ Fetching…' : '🔍 Search Trends'}
        </button>
      </form>

      {/* Error */}
      {errorT && (
        <div style={{
          background: '#FEF2F2', border: '1px solid #FCA5A5',
          borderRadius: 8, padding: '10px 14px', marginBottom: 16,
          fontSize: 12, color: '#DC2626',
        }}>
          ⚠ {errorT}
        </div>
      )}

      {/* Loading skeleton */}
      {loadingT && (
        <div style={{ padding: '20px 0' }}>
          {[1,2].map(i => (
            <div key={i} style={{
              height: 20, marginBottom: 10, borderRadius: 6,
              background: 'linear-gradient(90deg,#F1F5F9 25%,#F8FAFC 50%,#F1F5F9 75%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.5s infinite',
              width: i === 1 ? '80%' : '60%',
            }} />
          ))}
          <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
        </div>
      )}

      {/* Content */}
      {trendsData && !loadingT && (
        <>
          {/* Tab switcher */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 18, borderBottom: '1px solid #E2E8F0', paddingBottom: 0 }}>
            {[
              { id: 'chart',    label: '📊 Trend Chart' },
              { id: 'queries',  label: '🔍 Related Searches' },
              { id: 'insights', label: `⚡ Insights${insights ? ` (${insights.cards?.length ?? 0})` : ''}` },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '8px 14px', border: 'none', background: 'transparent',
                  fontSize: 12, fontWeight: activeTab === tab.id ? 700 : 500,
                  color:  activeTab === tab.id ? '#3B82F6' : '#6B7280',
                  borderBottom: activeTab === tab.id ? '2px solid #3B82F6' : '2px solid transparent',
                  cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                  marginBottom: -1,
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ── Chart tab ── */}
          {activeTab === 'chart' && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 8 }}>
                Interest over time for <strong style={{ color: '#0F172A' }}>"{trendsData.keyword}"</strong> in India
                <span style={{ marginLeft: 8, fontSize: 10, color: '#9CA3AF' }}>
                  ({trendsData.dataPoints} weekly data points)
                </span>
              </div>
              <Sparkline points={trendsData.timeline} color="#3B82F6" />

              {/* Min/Max labels */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <span style={{ fontSize: 10, color: '#9CA3AF' }}>
                  {trendsData.timeline[0]?.date}
                </span>
                <span style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 600 }}>
                  Peak {trendsData.peakValue}/100 — {trendsData.peakWeek}
                </span>
                <span style={{ fontSize: 10, color: '#9CA3AF' }}>
                  {trendsData.timeline.at(-1)?.date}
                </span>
              </div>
            </div>
          )}

          {/* ── Queries tab ── */}
          {activeTab === 'queries' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
                  🔝 Top Searches
                </div>
                {trendsData.topQueries.length > 0
                  ? trendsData.topQueries.map((q, i) => (
                      <QueryPill key={i} text={q.query} value={q.value} isBreakout={false} isRising={false} />
                    ))
                  : <p style={{ fontSize: 12, color: '#9CA3AF' }}>No data</p>}
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
                  🚀 Rising Searches
                </div>
                {trendsData.risingQueries.length > 0
                  ? trendsData.risingQueries.map((q, i) => (
                      <QueryPill key={i} text={q.query} value={q.value} isBreakout={q.isBreakout} isRising={true} />
                    ))
                  : <p style={{ fontSize: 12, color: '#9CA3AF' }}>No data</p>}
              </div>
              {trendsData.relatedTopics.length > 0 && (
                <div style={{ gridColumn: '1/-1' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
                    🌐 Related Topics
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {trendsData.relatedTopics.map((t, i) => (
                      <span key={i} style={{
                        fontSize: 11, padding: '4px 10px', borderRadius: 999,
                        background: '#F1F5F9', border: '1px solid #E2E8F0', color: '#475569',
                      }}>
                        {t.topic} {t.type ? `· ${t.type}` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Insights tab ── */}
          {activeTab === 'insights' && (
            <div>
              {loadingI && (
                <div style={{ textAlign: 'center', padding: '24px', color: '#6B7280', fontSize: 13 }}>
                  ⏳ Gemini is reading the trends data…
                </div>
              )}
              {errorI && (
                <div style={{
                  background: '#FEF2F2', border: '1px solid #FCA5A5',
                  borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#DC2626',
                }}>
                  ⚠ {errorI}
                  <button
                    onClick={() => fetchInsights(trendsData)}
                    style={{ marginLeft: 10, fontSize: 11, color: '#3B82F6', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    Retry
                  </button>
                </div>
              )}
              {insights && !loadingI && (
                <>
                  <div style={{
                    fontSize: 11, color: '#6B7280', marginBottom: 14,
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <span>4 Gemini insight cards from live Google Trends data</span>
                    {insights.cached && (
                      <span style={{ fontSize: 9, fontWeight: 700, background: '#F0FDF4', color: '#166534', borderRadius: 999, padding: '1px 5px' }}>
                        CACHED 6H
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px,1fr))', gap: 12 }}>
                    {insights.cards.map((card, i) => (
                      <InsightCard key={i} card={card} />
                    ))}
                  </div>
                </>
              )}
              {!loadingI && !insights && !errorI && (
                <div style={{ textAlign: 'center', padding: '20px', color: '#9CA3AF', fontSize: 12 }}>
                  Insights will load automatically after trends data is fetched.
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Empty state */}
      {!trendsData && !loadingT && !errorT && (
        <div style={{ textAlign: 'center', padding: '32px 20px', color: '#9CA3AF' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📈</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#6B7280', marginBottom: 4 }}>
            Search any brand, keyword or category
          </div>
          <div style={{ fontSize: 12, marginBottom: 16 }}>
            See India search trends + Gemini-powered strategy insights instantly
          </div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
            {['Nike India', 'Zomato', 'IPL 2025', 'Blinkit', 'Zepto'].map(s => (
              <button
                key={s}
                onClick={() => { setInput(s); setQuery(s); fetchTrends(s); }}
                style={{
                  fontSize: 11, padding: '5px 12px', borderRadius: 999,
                  background: '#F8FAFC', border: '1px solid #E2E8F0',
                  color: '#475569', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
