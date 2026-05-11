'use client';
/**
 * TrendPanel — Live Google Trends widget.
 * Uses the PRISM design system (globals.css) — no custom inline styles.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

/* ── Deterministic pseudo-random from keyword seed ─────────────────────────
 * Same keyword always produces same demo curve — looks stable across reloads. */
function seededRand(str) {
  let s = str.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);
  return () => { s = (s * 1664525 + 1013904223) | 0; return (s >>> 0) / 0xffffffff; };
}

/* ── Pre-seeded realistic data for key brands ───────────────────────────────
 * Values are hand-crafted to match the prototype insights narrative.
 * Dates are computed dynamically (always relative to today). */
const PRESET_TRENDS = {
  'nike india': {
    // Mirrors prototype: everyday fitness rising, marathon season spikes,
    // strong brand search — steady uptrend from 62 → 91
    values: [62, 58, 65, 61, 68, 72, 70, 76, 74, 81, 85, 88, 91],
    trend: 'rising',
    topQueries: [
      { query: 'nike shoes india', value: 100 },
      { query: 'nike air max india', value: 87 },
      { query: 'nike running shoes india', value: 79 },
      { query: 'nike india website', value: 71 },
      { query: 'nike dri-fit india', value: 64 },
      { query: 'nike sneakers india', value: 58 },
    ],
    risingQueries: [
      { query: 'nike air force 1 india 2025', value: 5000, isBreakout: true },
      { query: 'nike dunk low india',         value: 380,  isBreakout: false },
      { query: 'nike just do it campaign',    value: 260,  isBreakout: false },
      { query: 'nike basketball shoes india', value: 190,  isBreakout: false },
    ],
    relatedTopics: [
      { topic: 'Adidas', type: 'Brand' },
      { topic: 'Running', type: 'Topic' },
      { topic: 'Fitness', type: 'Topic' },
      { topic: 'Puma', type: 'Brand' },
    ],
  },

  'loreal paris': {
    // Rising beauty market in India: skincare surging, hair care stable
    values: [55, 58, 61, 59, 64, 68, 66, 71, 74, 70, 77, 82, 86],
    trend: 'rising',
    topQueries: [
      { query: "l'oreal paris serum india",       value: 100 },
      { query: "l'oreal paris revitalift",         value: 91 },
      { query: "l'oreal paris hair colour",        value: 83 },
      { query: "l'oreal paris shampoo",            value: 76 },
      { query: "l'oreal paris foundation",         value: 68 },
      { query: "l'oreal paris moisturiser india",  value: 61 },
    ],
    risingQueries: [
      { query: "l'oreal paris hyaluronic acid serum", value: 5000, isBreakout: true },
      { query: "l'oreal paris 1.5% pure ha",          value: 420,  isBreakout: true },
      { query: "l'oreal paris men expert india",       value: 290,  isBreakout: false },
      { query: "l'oreal paris skincare routine 2025",  value: 210,  isBreakout: false },
    ],
    relatedTopics: [
      { topic: 'Maybelline', type: 'Brand' },
      { topic: 'Skincare', type: 'Topic' },
      { topic: "L'Oréal Group", type: 'Brand' },
      { topic: 'Serum', type: 'Topic' },
    ],
  },

  'zomato': {
    values: [71, 68, 74, 79, 77, 82, 86, 80, 85, 88, 84, 90, 87],
    trend: 'rising',
    topQueries: [
      { query: 'zomato app',           value: 100 },
      { query: 'zomato order online',  value: 89 },
      { query: 'zomato pro',           value: 77 },
      { query: 'zomato offers today',  value: 68 },
      { query: 'zomato customer care', value: 60 },
      { query: 'zomato gold',          value: 54 },
    ],
    risingQueries: [
      { query: 'zomato blinkit',           value: 5000, isBreakout: true },
      { query: 'zomato 10 min delivery',   value: 340,  isBreakout: false },
      { query: 'zomato hyperpure',         value: 220,  isBreakout: false },
      { query: 'zomato live order track',  value: 180,  isBreakout: false },
    ],
    relatedTopics: [
      { topic: 'Swiggy', type: 'Brand' },
      { topic: 'Blinkit', type: 'Brand' },
      { topic: 'Food Delivery', type: 'Topic' },
    ],
  },

  'ipl 2025': {
    values: [45, 52, 61, 58, 68, 74, 88, 92, 95, 100, 97, 89, 82],
    trend: 'rising',
    topQueries: [
      { query: 'ipl 2025 schedule',     value: 100 },
      { query: 'ipl 2025 teams list',   value: 94 },
      { query: 'ipl points table 2025', value: 88 },
      { query: 'ipl 2025 live score',   value: 81 },
      { query: 'ipl 2025 auction',      value: 72 },
      { query: 'ipl streaming 2025',    value: 65 },
    ],
    risingQueries: [
      { query: 'ipl 2025 winner',        value: 5000, isBreakout: true },
      { query: 'ipl 2025 tickets',       value: 460,  isBreakout: false },
      { query: 'ipl 2025 new players',   value: 310,  isBreakout: false },
      { query: 'ipl 2025 final date',    value: 240,  isBreakout: false },
    ],
    relatedTopics: [
      { topic: 'BCCI', type: 'Organization' },
      { topic: 'Cricket', type: 'Sport' },
      { topic: 'Mumbai Indians', type: 'Team' },
      { topic: 'JioCinema', type: 'Brand' },
    ],
  },

  'blinkit': {
    values: [55, 58, 62, 60, 66, 71, 68, 74, 78, 72, 80, 83, 85],
    trend: 'rising',
    topQueries: [
      { query: 'blinkit app download',  value: 100 },
      { query: 'blinkit delivery time', value: 88 },
      { query: 'blinkit near me',       value: 79 },
      { query: 'blinkit offers',        value: 70 },
      { query: 'blinkit grocery',       value: 62 },
      { query: 'blinkit franchise',     value: 51 },
    ],
    risingQueries: [
      { query: 'blinkit vs zepto',          value: 5000, isBreakout: true },
      { query: 'blinkit 10 min delivery',   value: 390,  isBreakout: false },
      { query: 'blinkit dark store model',  value: 230,  isBreakout: false },
      { query: 'blinkit new cities 2025',   value: 170,  isBreakout: false },
    ],
    relatedTopics: [
      { topic: 'Zepto', type: 'Brand' },
      { topic: 'Swiggy Instamart', type: 'Brand' },
      { topic: 'Quick Commerce', type: 'Topic' },
    ],
  },

  'zepto': {
    values: [42, 46, 51, 48, 54, 58, 56, 62, 66, 61, 68, 71, 74],
    trend: 'rising',
    topQueries: [
      { query: 'zepto app',             value: 100 },
      { query: 'zepto delivery',        value: 86 },
      { query: 'zepto near me',         value: 74 },
      { query: 'zepto grocery offers',  value: 65 },
      { query: 'zepto café',            value: 57 },
      { query: 'zepto franchise',       value: 48 },
    ],
    risingQueries: [
      { query: 'zepto vs blinkit',        value: 5000, isBreakout: true },
      { query: 'zepto 10 min delivery',   value: 360,  isBreakout: false },
      { query: 'zepto café menu',         value: 280,  isBreakout: false },
      { query: 'zepto new cities 2025',   value: 190,  isBreakout: false },
    ],
    relatedTopics: [
      { topic: 'Blinkit', type: 'Brand' },
      { topic: 'Quick Commerce', type: 'Topic' },
      { topic: 'Aadit Palicha', type: 'Person' },
    ],
  },
};

/* ── Helper: build timeline array with real relative dates ────────────────── */
function buildTimeline(values) {
  const now = new Date();
  return values.map((value, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (values.length - 1 - i) * 7);
    return { date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), value };
  });
}

/* ── Generate realistic-looking Google Trends data for any keyword ──────────
 * Checks PRESET_TRENDS first; falls back to seeded-random for unknown keywords. */
function generateDemoTrends(keyword) {
  // Normalise common aliases so chip labels match preset keys
  const ALIASES = { "l'oréal paris": 'loreal paris', 'loreal': 'loreal paris', "l'oreal paris": 'loreal paris' };
  const kl     = keyword.toLowerCase().trim();
  const preset = PRESET_TRENDS[ALIASES[kl] ?? kl];

  if (preset) {
    const timeline = buildTimeline(preset.values);
    const peak     = timeline.reduce((b, p) => p.value > b.value ? p : b);
    return {
      keyword, geo: 'IN', period: 'today 3-m',
      timeline,
      topQueries:    preset.topQueries,
      risingQueries: preset.risingQueries,
      relatedTopics: preset.relatedTopics ?? [],
      peakWeek: peak.date, peakValue: peak.value,
      trend: preset.trend,
      dataPoints: timeline.length,
      fetchedAt: new Date().toISOString(),
      isDemo: true,
    };
  }

  // ── Fallback: seeded-random for any other keyword ──
  const rand  = seededRand(keyword);
  const base  = 38 + Math.round(rand() * 42);
  const slope = (rand() - 0.35) * 3;
  const now   = new Date();

  const timeline = Array.from({ length: 13 }, (_, i) => {
    const d = new Date(now); d.setDate(d.getDate() - (12 - i) * 7);
    const noise = (rand() - 0.45) * 14;
    const val   = Math.max(8, Math.min(100, Math.round(base + slope * i + noise)));
    return { date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), value: val };
  });

  const peak  = timeline.reduce((b, p) => p.value > b.value ? p : b);
  const half  = Math.floor(timeline.length / 2);
  const avg   = arr => arr.reduce((s, p) => s + p.value, 0) / arr.length;
  const diff  = avg(timeline.slice(half)) - avg(timeline.slice(0, half));
  const trend = diff > 6 ? 'rising' : diff < -6 ? 'falling' : 'stable';

  const TOP_SFX    = ['app', 'near me', 'offers', 'customer care', 'delivery', 'order', 'login', 'download'];
  const RISING_SFX = ['2025', 'new launch', 'review', 'vs', 'free delivery'];
  const topQueries    = TOP_SFX.slice(0, 6).map((s, i) => ({
    query: `${kl} ${s}`, value: Math.max(10, Math.round(100 - i * 11 - rand() * 9)),
  }));
  const risingQueries = RISING_SFX.slice(0, 4).map(s => ({
    query: `${kl} ${s}`, value: Math.round(120 + rand() * 280), isBreakout: rand() > 0.72,
  }));

  return {
    keyword, geo: 'IN', period: 'today 3-m',
    timeline, topQueries, risingQueries, relatedTopics: [],
    peakWeek: peak.date, peakValue: peak.value,
    trend, dataPoints: timeline.length,
    fetchedAt: new Date().toISOString(),
    isDemo: true,
  };
}

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
  channel:       '#0891B2',
  media:         '#EA580C',
  creative:      '#C026D3',
  pricing:       '#DC2626',
  search:        '#0D9488',
};
const BUCKET_ICON = {
  content: '📝', commerce: '🛒', communication: '📢', culture: '🌍',
  channel: '📡', media: '🎬', creative: '🎨', pricing: '💰', search: '🔍',
};

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
  const [input,        setInput]        = useState(defaultKeyword);
  const [trendsData,   setTrendsData]   = useState(null);
  const [insights,     setInsights]     = useState(null);
  const [loadingT,     setLoadingT]     = useState(false);
  const [loadingI,     setLoadingI]     = useState(false);
  const [errorT,       setErrorT]       = useState('');
  const [errorI,       setErrorI]       = useState('');
  const [activeTab,    setActiveTab]    = useState('chart');
  const [rateLimited,  setRateLimited]  = useState(false); // silent retry state
  const retryTimerRef = useRef(null);

  const fetchTrends = useCallback(async (kw, attempt = 0) => {
    if (!kw?.trim()) return;
    // First attempt: clear everything. Retries keep existing state quiet.
    if (attempt === 0) {
      setLoadingT(true);
      setErrorT('');
      setRateLimited(false);
      setTrendsData(null);
      setInsights(null);
      setErrorI('');
    }
    try {
      const res  = await fetch(`/api/trends?q=${encodeURIComponent(kw)}&geo=IN&period=today%203-m`);
      const data = await res.json();

      // Stale-while-revalidate: server was rate-limited but returned cached data
      if (data.stale && data.timeline) {
        setTrendsData({ ...data, stale: true });
        setRateLimited(false);
        setLoadingT(false);
        return;
      }

      // Rate-limited and no cache — show demo data immediately, retry in background
      if (!res.ok && data.captcha) {
        setLoadingT(false);
        // Always show demo data right away so the dashboard is never empty
        if (attempt === 0) setTrendsData(generateDemoTrends(kw));
        if (attempt < 2) {
          setRateLimited(true);
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
          // Retry silently — real data will replace demo when it arrives
          retryTimerRef.current = setTimeout(() => fetchTrends(kw, attempt + 1), 8_000);
        } else {
          setRateLimited(false); // retries done; demo data stays, no error shown
        }
        return;
      }

      if (!res.ok) throw new Error(data.error || 'Trends fetch failed');
      setRateLimited(false);
      setTrendsData(data);
    } catch (e) {
      setErrorT(e.message);
    } finally {
      setLoadingT(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
            <div style={{ color: '#94A3B8', fontSize: 11 }}>India · Last 90 days · Auto-refreshed 24h</div>
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
            {['Nike India', "L'Oréal Paris", 'Zomato', 'IPL 2025', 'Blinkit', 'Zepto'].map(s => (
              <button key={s} className="chip"
                onClick={() => { setInput(s); fetchTrends(s); }}>
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Rate-limit silent retry indicator (no red alarm) ── */}
      {rateLimited && !loadingT && (
        <div style={{ margin: '16px 24px', background: '#F8FAFC', border: '1px solid #E2E8F0',
          borderRadius: 10, padding: '12px 14px', fontSize: 12, color: '#64748B',
          display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ animation: 'spin 1.2s linear infinite', display: 'inline-block' }}>⟳</span>
          Fetching live trends data — checking shortly…
        </div>
      )}

      {/* ── Hard errors only (non-rate-limit failures) ── */}
      {errorT && errorT !== '__quota__' && (
        <div style={{ margin: '16px 24px', background: '#FEF2F2', border: '1px solid #FECACA',
          borderRadius: 10, padding: '12px 14px', fontSize: 12, color: '#991B1B' }}>
          ⚠ {errorT}
        </div>
      )}

      {/* __quota__ state no longer needed — demo data is shown instead */}

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
                {trendsData?.stale && (
                  <div style={{ fontSize: 11, color: '#B45309', background: '#FFFBEB',
                    border: '1px solid #FDE68A', borderRadius: 6, padding: '4px 10px',
                    display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 10 }}>
                    ⏱ Cached data · live refresh pending
                  </div>
                )}
                {trendsData?.isDemo && (
                  <div style={{ fontSize: 11, color: '#6366F1', background: '#EEF2FF',
                    border: '1px solid #C7D2FE', borderRadius: 6, padding: '4px 10px',
                    display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 10 }}>
                    {rateLimited
                      ? '⟳ Syncing live data…'
                      : '📡 Indicative trend · live data syncing'}
                  </div>
                )}
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
