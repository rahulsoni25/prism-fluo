'use client';
/**
 * TrendPanel — Live Google Trends widget.
 * Uses the PRISM design system (globals.css) — no custom inline styles.
 */

import { useState, useEffect, useCallback } from 'react';

// ── Tiny SVG sparkline (only component that needs inline SVG geometry) ──
function Sparkline({ points, color = 'var(--primary)' }) {
  if (!points || points.length < 2) return null;
  const W = 400, H = 72, PAD = 6;
  const vals  = points.map(p => p.value);
  const minV  = Math.min(...vals);
  const maxV  = Math.max(...vals) || 1;
  const range = maxV - minV || 1;

  const xy = points.map((p, i) => {
    const x = PAD + (i / (points.length - 1)) * (W - PAD * 2);
    const y = H - PAD - ((p.value - minV) / range) * (H - PAD * 2);
    return [x.toFixed(1), y.toFixed(1)];
  });
  const polyLine = xy.map(c => c.join(',')).join(' ');
  const fillPoly = [`${PAD},${H - PAD}`, ...xy.map(c => c.join(',')), `${W - PAD},${H - PAD}`].join(' ');

  const last = xy[xy.length - 1];
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="var(--primary)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={fillPoly} fill="url(#sparkFill)" />
      <polyline points={polyLine} fill="none" stroke="var(--primary)" strokeWidth="2.5"
        strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="4" fill="var(--primary)" />
    </svg>
  );
}

// ── Query row ──────────────────────────────────────────────────
function QueryRow({ text, value, isBreakout }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>{text}</span>
      <span className={isBreakout ? 'badge badge-processing' : 'badge badge-draft'}
        style={{ marginLeft: 8 }}>
        {isBreakout ? '🔥 Breakout' : `+${value}%`}
      </span>
    </div>
  );
}

// ── Insight card (matches insights-page style) ─────────────────
const BUCKET_COLOR = {
  content:       'var(--primary)',
  commerce:      'var(--success)',
  communication: 'var(--accent)',
  culture:       'var(--warning)',
};
const BUCKET_ICON = { content: '📝', commerce: '🛒', communication: '📢', culture: '🌍' };

function InsightCard({ card }) {
  const borderColor = BUCKET_COLOR[card.bucket] || 'var(--primary)';
  return (
    <div className={`insight-card ${card.bucket}`}>
      <div className="ic-header">
        <span className="ic-source">
          {BUCKET_ICON[card.bucket]} {card.bucket}
        </span>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)',
          background: 'var(--bg)', padding: '2px 8px', borderRadius: 20,
          border: '1px solid var(--border)' }}>
          Google Trends
        </span>
      </div>
      <div className="ic-title">{card.title}</div>

      <div className="ic-section">
        <div className="ic-label obs">📊 Observation</div>
        <div className="ic-text">{card.obs}</div>
        {card.stat && <div className="ic-stat">{card.stat}</div>}
      </div>

      <div className="ic-section">
        <div className="ic-label rec">→ Recommendation</div>
        <div className="ic-text">{card.rec}</div>
      </div>
    </div>
  );
}

// ── Main TrendPanel ────────────────────────────────────────────
export default function TrendPanel({ defaultKeyword = '', brandContext = '' }) {
  const [input,      setInput]      = useState(defaultKeyword);
  const [trendsData, setTrendsData] = useState(null);
  const [insights,   setInsights]   = useState(null);
  const [loadingT,   setLoadingT]   = useState(false);
  const [loadingI,   setLoadingI]   = useState(false);
  const [errorT,     setErrorT]     = useState('');
  const [errorI,     setErrorI]     = useState('');
  const [activeTab,  setActiveTab]  = useState('chart');

  const fetchTrends = useCallback(async (kw) => {
    if (!kw?.trim()) return;
    setLoadingT(true); setErrorT(''); setTrendsData(null); setInsights(null); setErrorI('');
    try {
      const res  = await fetch(`/api/trends?q=${encodeURIComponent(kw)}&geo=IN&period=today%203-m`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Trends fetch failed');
      setTrendsData(data);
    } catch (e) { setErrorT(e.message); }
    finally { setLoadingT(false); }
  }, []);

  const fetchInsights = useCallback(async (td) => {
    if (!td) return;
    setLoadingI(true); setErrorI('');
    try {
      const res  = await fetch('/api/trends/insights', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...td, brandContext: brandContext || td.keyword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Insights failed');
      setInsights(data);
    } catch (e) { setErrorI(e.message); }
    finally { setLoadingI(false); }
  }, [brandContext]);

  // Auto-run on mount if keyword provided
  useEffect(() => {
    if (defaultKeyword) { setInput(defaultKeyword); fetchTrends(defaultKeyword); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fetch insights when trends data arrives
  useEffect(() => { if (trendsData) fetchInsights(trendsData); }, [trendsData, fetchInsights]);

  function handleSearch(e) {
    e?.preventDefault();
    const kw = input.trim();
    if (kw) fetchTrends(kw);
  }

  // Trend badge
  const TREND_BADGE = {
    rising:  { cls: 'badge-ready',      label: '↑ Rising' },
    falling: { cls: 'badge badge-processing', label: '↓ Falling' },
    stable:  { cls: 'badge-draft',      label: '→ Stable' },
  };
  const trendBadge = trendsData ? (TREND_BADGE[trendsData.trend] || TREND_BADGE.stable) : null;

  return (
    <div className="stat-card" style={{ marginBottom: 28, padding: 0, overflow: 'hidden' }}>

      {/* ── Panel header (dark band matching insights-hero) ── */}
      <div style={{
        background: 'linear-gradient(135deg, #0F172A, #1E1B4B)',
        padding: '18px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="nav-prism-icon"
            style={{ background: 'linear-gradient(135deg,#EA4335,#FBBC05)', fontSize: 16 }}>📈</div>
          <div>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 14, letterSpacing: '-.2px' }}>
              Live Google Trends
            </div>
            <div style={{ color: '#94A3B8', fontSize: 11 }}>India · Last 90 days · Auto-refreshed 6h</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {trendBadge && (
            <span className={`badge ${trendBadge.cls}`}>{trendBadge.label}</span>
          )}
          {trendsData?.peakWeek && (
            <span style={{ fontSize: 10, color: '#94A3B8' }}>Peak: {trendsData.peakWeek}</span>
          )}
          {trendsData?.cached && (
            <span className="badge badge-ready" style={{ fontSize: 9 }}>⚡ Cached</span>
          )}
        </div>
      </div>

      {/* ── Search bar ── */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Enter brand, keyword or category — e.g. Nike India, Blinkit, IPL 2025"
            style={{ flex: 1 }}
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loadingT || !input.trim()}
            style={{ opacity: loadingT || !input.trim() ? 0.5 : 1, flexShrink: 0 }}
          >
            {loadingT ? '⏳ Fetching…' : '🔍 Search Trends'}
          </button>
        </form>

        {/* Quick examples */}
        {!trendsData && !loadingT && (
          <div className="chips" style={{ marginTop: 10 }}>
            {['Nike India', 'Zomato', 'IPL 2025', 'Blinkit', 'Zepto'].map(s => (
              <button key={s} className="chip"
                onClick={() => { setInput(s); fetchTrends(s); }}>
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Error ── */}
      {errorT && (
        <div style={{ margin: '16px 24px', background: '#FEF2F2', border: '1px solid #FECACA',
          borderRadius: 10, padding: '12px 14px', fontSize: 12, color: '#991B1B' }}>
          ⚠ {errorT}
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {loadingT && (
        <div style={{ padding: '20px 24px' }}>
          {[80, 60, 70].map((w, i) => (
            <div key={i} className="progress-bar" style={{ marginBottom: 10, width: `${w}%` }}>
              <div className="progress-fill pulsing" style={{ width: '100%' }} />
            </div>
          ))}
        </div>
      )}

      {/* ── Main content ── */}
      {trendsData && !loadingT && (
        <div>
          {/* Tabs — reuse filter-bar pattern */}
          <div className="filter-bar" style={{ padding: '12px 24px 0', marginBottom: 0,
            borderBottom: '1px solid var(--border)' }}>
            {[
              { id: 'chart',    label: '📊 Trend Chart' },
              { id: 'queries',  label: '🔍 Related Searches' },
              { id: 'insights', label: `⚡ Insights${insights ? ` (${insights.cards?.length ?? 0})` : ''}` },
            ].map(tab => (
              <button
                key={tab.id}
                className={`filter-btn ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div style={{ padding: '20px 24px' }}>

            {/* ── Chart ── */}
            {activeTab === 'chart' && (
              <div>
                <div className="stat-label" style={{ marginBottom: 10 }}>
                  Search interest for <strong style={{ color: 'var(--text)' }}>"{trendsData.keyword}"</strong>
                  &nbsp;· {trendsData.dataPoints} weekly points
                </div>
                <div className="chart-wrap" style={{ padding: '12px 8px 6px' }}>
                  <Sparkline points={trendsData.timeline} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>{trendsData.timeline[0]?.date}</span>
                  <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700 }}>
                    Peak {trendsData.peakValue}/100 — {trendsData.peakWeek}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>{trendsData.timeline.at(-1)?.date}</span>
                </div>
              </div>
            )}

            {/* ── Queries ── */}
            {activeTab === 'queries' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                <div>
                  <div className="stat-label" style={{ marginBottom: 10 }}>🔝 Top Searches</div>
                  {trendsData.topQueries.length > 0
                    ? trendsData.topQueries.map((q, i) => (
                        <QueryRow key={i} text={q.query} value={q.value} isBreakout={false} />
                      ))
                    : <p className="page-sub">No data available</p>}
                </div>
                <div>
                  <div className="stat-label" style={{ marginBottom: 10 }}>🚀 Rising Searches</div>
                  {trendsData.risingQueries.length > 0
                    ? trendsData.risingQueries.map((q, i) => (
                        <QueryRow key={i} text={q.query} value={q.value} isBreakout={q.isBreakout} />
                      ))
                    : <p className="page-sub">No data available</p>}
                </div>
                {trendsData.relatedTopics?.length > 0 && (
                  <div style={{ gridColumn: '1/-1' }}>
                    <div className="stat-label" style={{ marginBottom: 10 }}>🌐 Related Topics</div>
                    <div className="chips">
                      {trendsData.relatedTopics.map((t, i) => (
                        <span key={i} className="tag">{t.topic}{t.type ? ` · ${t.type}` : ''}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Insights ── */}
            {activeTab === 'insights' && (
              <div>
                {loadingI && (
                  <div style={{ textAlign: 'center', padding: '28px', color: 'var(--muted)', fontSize: 13 }}>
                    <div className="pulsing" style={{ fontSize: 22, marginBottom: 8 }}>⚡</div>
                    Gemini is analysing the trends data…
                  </div>
                )}
                {errorI && (
                  <div style={{ background: '#FEF2F2', border: '1px solid #FECACA',
                    borderRadius: 10, padding: '12px 14px', fontSize: 12, color: '#991B1B',
                    display: 'flex', alignItems: 'center', gap: 8 }}>
                    ⚠ {errorI}
                    <button className="btn btn-outline btn-sm"
                      style={{ marginLeft: 'auto' }}
                      onClick={() => fetchInsights(trendsData)}>
                      Retry
                    </button>
                  </div>
                )}
                {insights && !loadingI && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                      <span className="page-sub">4 strategy cards from live Google Trends</span>
                      {insights.cached && <span className="badge badge-ready" style={{ fontSize: 9 }}>⚡ Cached 6h</span>}
                    </div>
                    <div className="insights-grid">
                      {insights.cards.map((card, i) => (
                        <InsightCard key={i} card={card} />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {!trendsData && !loadingT && !errorT && (
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>📈</div>
          <div className="page-title" style={{ fontSize: 15, marginBottom: 4 }}>Search any brand or keyword</div>
          <div className="page-sub">Get India Google Trends + Gemini strategy insights — no file upload needed</div>
        </div>
      )}
    </div>
  );
}
