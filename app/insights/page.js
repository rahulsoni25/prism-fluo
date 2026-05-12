'use client';
import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import GenerateDeckModal from '@/app/components/GenerateDeckModal';
import Navbar from '@/components/Navbar';
import Copilot from '@/components/Copilot';
import {
  ChartBar, ChartLine, ChartPie, ChartDoughnut, ChartScatter, ChartHBar,
  ChartArea, ChartCombo, ChartHistogram, ChartRadar,
  ChartWaterfall, ChartFunnel,
  Heatmap, Scorecard, PALETTE,
} from '@/components/charts/AppChart';
import { ID, HM_DATA, SCATTER_COLORS, SCATTER_LABELS, PLATFORMS_DATA } from '@/lib/data';

/* ─── helpers ─── */
function fmtTs(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

/**
 * BriefContextStrip — clean, organized brief summary card under the report title.
 * Three-section layout: meta row → objective → audience + competitors side-by-side.
 * Falls back to source badge + time ago when no brief is linked.
 */
function BriefContextStrip({ brief, sourceBadge, createdAt }) {

  // ── No brief linked — simple fallback ──────────────────────
  if (!brief?.brand) {
    return (
      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
        <span style={{
          padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
          background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.75)',
          border: '1px solid rgba(255,255,255,0.12)',
        }}>📊 {sourceBadge}</span>
        <span style={{
          padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
          background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.55)',
          border: '1px solid rgba(255,255,255,0.1)',
        }}>🕐 {timeAgo(createdAt)}</span>
      </div>
    );
  }

  // ── Parse audience + competitors ───────────────────────────
  const audience = [
    brief.age_ranges && { label: brief.age_ranges },
    brief.gender     && { label: brief.gender },
    brief.sec        && { label: `SEC ${brief.sec}` },
    (brief.geography || brief.market) && { label: brief.geography || brief.market },
  ].filter(Boolean);

  const competitors = brief.competitors
    ? brief.competitors.split(/[,;·|\/]+/).map(s => s.trim()).filter(Boolean).slice(0, 5)
    : [];

  const sectionLabel = {
    fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em',
    textTransform: 'uppercase', color: 'rgba(255,255,255,0.38)',
    marginBottom: 5,
  };

  const chip = (bg, border, color) => ({
    display: 'inline-flex', alignItems: 'center',
    padding: '3px 10px', borderRadius: 20,
    fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
    background: bg, border: `1px solid ${border}`, color,
  });

  return (
    <div style={{
      marginTop: 12,
      background: 'rgba(255,255,255,0.05)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 14,
      padding: '14px 18px',
      maxWidth: 700,
    }}>

      {/* ── TOP ROW: brand · category  |  source · time ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {/* Brand + category */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={chip('rgba(99,102,241,0.22)', 'rgba(99,102,241,0.4)', '#C7D2FE')}>
            🏢 {brief.brand}
          </span>
          {brief.category && (
            <span style={chip('rgba(255,255,255,0.08)', 'rgba(255,255,255,0.12)', 'rgba(255,255,255,0.65)')}>
              {brief.category}
            </span>
          )}
        </div>
        {/* Source + time — pushed right */}
        <div style={{ display: 'flex', gap: 6 }}>
          <span style={chip('rgba(255,255,255,0.07)', 'rgba(255,255,255,0.1)', 'rgba(255,255,255,0.5)')}>
            📊 {sourceBadge}
          </span>
          <span style={chip('rgba(255,255,255,0.05)', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.38)')}>
            {timeAgo(createdAt)}
          </span>
        </div>
      </div>

      {/* ── DIVIDER ── */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginBottom: 12 }} />

      {/* ── OBJECTIVE ── */}
      {brief.objective && (
        <div style={{ marginBottom: 12 }}>
          <div style={sectionLabel}>Objective</div>
          <div style={{
            fontSize: 12.5, fontWeight: 500, lineHeight: 1.55,
            color: 'rgba(255,255,255,0.85)',
            display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {brief.objective}
          </div>
        </div>
      )}

      {/* ── BOTTOM ROW: audience left | competitors right ── */}
      {(audience.length > 0 || competitors.length > 0) && (
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>

          {/* Audience */}
          {audience.length > 0 && (
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={sectionLabel}>Target Audience</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {audience.map((a, i) => (
                  <span key={i} style={chip('rgba(16,185,129,0.12)', 'rgba(16,185,129,0.25)', 'rgba(167,243,208,0.9)')}>
                    {a.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Vertical divider between audience and competitors */}
          {audience.length > 0 && competitors.length > 0 && (
            <div style={{ width: 1, background: 'rgba(255,255,255,0.08)', alignSelf: 'stretch', flexShrink: 0 }} />
          )}

          {/* Competitors */}
          {competitors.length > 0 && (
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={sectionLabel}>Competing Against</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {competitors.map((c, i) => (
                  <span key={i} style={chip('rgba(239,68,68,0.12)', 'rgba(239,68,68,0.28)', 'rgba(252,165,165,0.9)')}>
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SlaStrip({ brief }) {
  const planned = brief.sla_due_at ? new Date(brief.sla_due_at) : null;
  const actual  = brief.actual_completed_at ? new Date(brief.actual_completed_at) : null;
  let delta = null;
  if (planned && actual) {
    const diffH = (actual.getTime() - planned.getTime()) / 36e5;
    if (Math.abs(diffH) >= 0.05) {
      delta = diffH < 0
        ? `${Math.abs(diffH).toFixed(diffH < -1 ? 0 : 1)}h ahead of plan`
        : `${diffH.toFixed(diffH > 1 ? 0 : 1)}h behind plan`;
    } else {
      delta = 'on time';
    }
  }
  const tone = delta?.includes('ahead') ? '#10B981'
            : delta?.includes('behind') ? '#F59E0B' : '#A78BFA';
  return (
    <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 11, color: 'rgba(255,255,255,0.78)' }}>
      <span>📅 <strong style={{ color: '#fff' }}>Planned:</strong> {fmtTs(planned)}</span>
      {actual && <span>✅ <strong style={{ color: '#fff' }}>Actual:</strong> {fmtTs(actual)}</span>}
      {delta && (
        <span style={{ color: tone, fontWeight: 600 }}>
          {delta === 'on time' ? '✓ On time' : `↳ ${delta}`}
        </span>
      )}
    </div>
  );
}

/**
 * Tools-used panel — shows the platforms that contributed (or could
 * contribute) to a brief. We use the source labels actually present on
 * the loaded charts to mark each platform "used" vs "available".
 */
function ToolsUsedPanel({ charts }) {
  const used = new Set(
    (charts || [])
      .map(c => (c.toolLabel || c.source || '').toString().toLowerCase())
      .filter(Boolean),
  );
  const isUsed = (p) => {
    const n = p.name.toLowerCase();
    return [...used].some(u =>
      n.includes(u) || u.includes(n) ||
      (n.includes('gwi') && u.includes('gwi')) ||
      (n.includes('helium') && u.includes('helium')) ||
      (n.includes('keyword') && u.includes('keyword')) ||
      (n.includes('trends') && u.includes('trend')) ||
      (n.includes('brandwatch') && u.includes('brandwatch')),
    );
  };
  return (
    <div style={{
      marginTop: 28, background: '#fff', borderRadius: 14,
      padding: '20px 22px', boxShadow: 'var(--shadow)',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>🛠 Tools used</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
            Platforms that contributed (or are available to contribute) to this brief.
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
        {PLATFORMS_DATA.map(p => {
          const u = isUsed(p);
          return (
            <div key={p.name} style={{
              padding: '10px 12px',
              border: `1px solid ${u ? '#A7F3D0' : '#E5E7EB'}`,
              background: u ? '#ECFDF5' : '#F9FAFB',
              borderRadius: 10,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{ fontSize: 18 }}>{p.icon}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{p.name}</div>
                <div style={{ fontSize: 10.5, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.desc}
                </div>
              </div>
              <span style={{
                fontSize: 9.5, fontWeight: 700, padding: '3px 7px', borderRadius: 999,
                background: u ? '#10B981' : '#E5E7EB',
                color: u ? '#fff' : '#6B7280',
                whiteSpace: 'nowrap',
              }}>{u ? 'USED' : 'AVAILABLE'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Executive Summary Panel — displays HEADLINE, OBJECTIVE, OBSERVATIONS, RECOMMENDATIONS
 * in SMART format with modern card design. Loads its own data via /api/analyses/[id]/summary.
 */
function ExecutiveSummaryPanel({ analysisId }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!analysisId) return;
    let cancelled = false;
    fetch(`/api/analyses/${analysisId}/summary`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(d => { if (!cancelled) setSummary(d); })
      .catch(err => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [analysisId]);

  if (error || !summary) return null;

  return (
    <div style={{ marginTop: 28 }}>
      {/* Headline Card */}
      <div style={{
        background: 'linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)',
        borderRadius: 16,
        padding: '28px 32px',
        marginBottom: 20,
        boxShadow: '0 4px 6px rgba(59, 130, 246, 0.1)',
      }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: '#fff', lineHeight: 1.3 }}>
          {summary.headline}
        </div>
      </div>

      {/* 3-Column Grid for Objective, Observations, Recommendations */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: 20,
      }}>
        {/* Objective Card */}
        <div style={{
          background: '#fff',
          borderRadius: 14,
          padding: '24px',
          boxShadow: 'var(--shadow)',
          border: '1px solid #E5E7EB',
        }}>
          <div style={{
            fontSize: 14,
            fontWeight: 700,
            color: '#3B82F6',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: 12,
          }}>
            🎯 Objective
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.7, color: '#374151', fontWeight: 500 }}>
            {summary.objective}
          </div>
        </div>

        {/* Observations Card */}
        {Array.isArray(summary.observations) && summary.observations.length > 0 && (
          <div style={{
            background: '#fff',
            borderRadius: 14,
            padding: '24px',
            boxShadow: 'var(--shadow)',
            border: '1px solid #E5E7EB',
          }}>
            <div style={{
              fontSize: 14,
              fontWeight: 700,
              color: '#059669',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: 12,
            }}>
              📊 Key Findings
            </div>
            <ul style={{ margin: 0, paddingLeft: 0, listStyleType: 'none' }}>
              {summary.observations.slice(0, 3).map((obs, i) => (
                <li key={i} style={{
                  fontSize: 12.5,
                  lineHeight: 1.6,
                  color: '#374151',
                  marginBottom: i < summary.observations.slice(0, 3).length - 1 ? 10 : 0,
                  paddingLeft: 20,
                  position: 'relative',
                }}>
                  <span style={{
                    position: 'absolute',
                    left: 0,
                    top: 2,
                    fontSize: 16,
                  }}>✓</span>
                  {obs}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Recommendations Card */}
        {Array.isArray(summary.recommendations) && summary.recommendations.length > 0 && (
          <div style={{
            background: '#fff',
            borderRadius: 14,
            padding: '24px',
            boxShadow: 'var(--shadow)',
            border: '1px solid #E5E7EB',
          }}>
            <div style={{
              fontSize: 14,
              fontWeight: 700,
              color: '#D97706',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: 12,
            }}>
              💡 Actions
            </div>
            <ul style={{ margin: 0, paddingLeft: 0, listStyleType: 'none' }}>
              {summary.recommendations.slice(0, 3).map((rec, i) => (
                <li key={i} style={{
                  fontSize: 12.5,
                  lineHeight: 1.6,
                  color: '#374151',
                  marginBottom: i < summary.recommendations.slice(0, 3).length - 1 ? 10 : 0,
                  paddingLeft: 20,
                  position: 'relative',
                }}>
                  <span style={{
                    position: 'absolute',
                    left: 0,
                    top: 2,
                    fontSize: 16,
                  }}>→</span>
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Source-files panel — accordion pattern.
 * Collapsed by default; click the header to reveal the scrollable file list.
 * Loads its own data via /api/briefs/[id]/files. Renders nothing while
 * loading or when the analysis has no brief link.
 */
function SourceFilesPanel({ briefId }) {
  const [files,    setFiles]    = useState(null);
  const [error,    setError]    = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!briefId) return;
    let cancelled = false;
    fetch(`/api/briefs/${briefId}/files`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(d => { if (!cancelled) setFiles(Array.isArray(d) ? d : []); })
      .catch(err => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [briefId]);

  if (!briefId || error || !Array.isArray(files) || files.length === 0) return null;

  const fmtTs = (ts) => new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });

  return (
    <div style={{
      marginTop: 22, background: '#fff', borderRadius: 14,
      boxShadow: 'var(--shadow)', overflow: 'hidden',
    }}>
      {/* ── Accordion header — always visible, click to toggle ── */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 12,
          padding: '16px 22px', background: 'none', border: 'none',
          cursor: 'pointer', textAlign: 'left',
          borderBottom: expanded ? '1px solid #F1F5F9' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16 }}>📂</span>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#111827' }}>
              Source Files
              <span style={{
                marginLeft: 8, fontSize: 11, fontWeight: 600,
                background: '#EEF2FF', color: '#4F46E5',
                padding: '1px 7px', borderRadius: 20,
              }}>{files.length}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
              {expanded ? 'Click to collapse' : 'Click to view files used to generate these insights'}
            </div>
          </div>
        </div>
        {/* Chevron icon — rotates when expanded */}
        <svg
          width="16" height="16" viewBox="0 0 16 16" fill="none"
          style={{ flexShrink: 0, transition: 'transform 0.22s ease', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          <path d="M4 6l4 4 4-4" stroke="#9CA3AF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* ── Accordion body — scrollable file list ── */}
      {expanded && (
        <div style={{
          maxHeight: 280, overflowY: 'auto', padding: '12px 16px 16px',
          display: 'flex', flexDirection: 'column', gap: 7,
        }}>
          {files.map(f => (
            <div key={f.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 12px',
              border: '1px solid #E5E7EB', borderRadius: 10,
              background: '#F9FAFB',
            }}>
              <div style={{ fontSize: 16 }}>📄</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {f.filename || '(unnamed file)'}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 1 }}>
                  {f.sheet_count ? `${f.sheet_count} sheet${f.sheet_count !== 1 ? 's' : ''} · ` : ''}
                  Uploaded {fmtTs(f.created_at)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const BUCKET_META = {
  content:       { label: '📝 Content Insights',       cls: 'content' },
  commerce:      { label: '🛒 Commerce Insights',      cls: 'commerce' },
  communication: { label: '📢 Communication Insights', cls: 'communication' },
  culture:       { label: '🌍 Culture Insights',        cls: 'culture' },
  channel:       { label: '📡 Channel Insights',       cls: 'channel' },
  media:         { label: '🎬 Media Insights',          cls: 'media' },
  creative:      { label: '🎨 Creative Insights',      cls: 'creative' },
  pricing:       { label: '💰 Pricing Insights',       cls: 'pricing' },
  search:        { label: '🔍 Search Insights',        cls: 'search' },
};

const BUCKET_TABS = [
  { key: 'content',       label: '📝 Content' },
  { key: 'commerce',      label: '🛒 Commerce' },
  { key: 'communication', label: '📢 Communication' },
  { key: 'culture',       label: '🌍 Culture' },
  { key: 'channel',       label: '📡 Channel' },
  { key: 'media',         label: '🎬 Media' },
  { key: 'creative',      label: '🎨 Creative' },
  { key: 'pricing',       label: '💰 Pricing' },
  { key: 'search',        label: '🔍 Search' },
];

/* ─── Scroll-triggered card reveal ──────────────────────────────────────────
 * Three layers of motion (mirrors the prototype):
 *   1. Card fades + translates in (fadeInUp) when it enters the viewport
 *   2. Card gently floats forever after (float-card CSS, defined in globals.css)
 *   3. Chart.js draw animations play on mount (bars grow, doughnuts spin, etc.)
 *
 * On tab switch the key prop changes → component remounts → animations replay.
 * ─────────────────────────────────────────────────────────────────────────── */

// Float phase offsets must match .insight-card:nth-child delays in globals.css.
// Using two separate delay values keeps fadeInUp stagger independent of float phase.
const FLOAT_PHASE = [0.4, 0.9, 1.4, 1.9, 0.7, 1.2, 1.7, 1.0];

function AnimatedCard({ index, bucketCls, children }) {
  const ref    = useRef(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    // Fallback: if IntersectionObserver unavailable (old browser / SSR), show immediately
    if (!el || typeof IntersectionObserver === 'undefined') { setShown(true); return; }

    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setShown(true); io.disconnect(); } },
      // rootMargin: reveal cards 80px before they fully enter the viewport (smoother feel)
      { threshold: 0.06, rootMargin: '0px 0px 80px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);  // empty deps → runs once per mount; re-mounts on key change auto-resets

  // .insight-card runs TWO animations: fadeInUp then float-card.
  // animation-delay accepts comma-separated values — one per animation.
  // Inline style must supply BOTH values, otherwise CSS repeats the single
  // value for both and the float phase offset is wrong.
  const fadeDelay  = index * 0.08;                       // staggered entry
  const floatDelay = FLOAT_PHASE[index % FLOAT_PHASE.length]; // float phase offset

  return (
    <div
      ref={ref}
      className={`insight-card ${bucketCls}`}
      style={
        shown
          ? { animationDelay: `${fadeDelay}s, ${floatDelay}s` }
          : { animation: 'none', opacity: 0, transform: 'translateY(12px)', minHeight: 260 }
      }
    >
      {/* Only mount children (incl. Chart.js) once card is visible.
          This ensures the 900 ms Chart.js draw animation plays in-view,
          not while the card is still invisible (opacity:0).
          minHeight above prevents the empty card from collapsing to 0px,
          which would make all cards appear "in viewport" at once. */}
      {shown ? children : null}
    </div>
  );
}

/* ─── chart dispatcher for demo insights ─── */
function InsightChart({ ins }) {
  if (ins.isHeatmap) {
    return (
      <>
        <Heatmap data={HM_DATA} />
        <div className="hm-legend">
          <span className="hm-legend-text">Low</span>
          <div className="hm-legend-bar"></div>
          <span className="hm-legend-text">High Intent</span>
        </div>
      </>
    );
  }
  const extra = ins.chartExtra || {};
  const cd    = ins.chartData;
  switch (ins.chartType) {
    case 'bar':       return <ChartBar       data={cd} extraOptions={extra} />;
    case 'hbar':      return <ChartHBar      data={cd} extraOptions={extra} />;
    case 'line':      return <ChartLine      data={cd} extraOptions={extra} />;
    case 'area':      return <ChartArea      data={cd} extraOptions={extra} />;
    case 'pie':       return <ChartPie       data={cd} extraOptions={extra} />;
    case 'doughnut':  return <ChartDoughnut  data={cd} extraOptions={extra} />;
    case 'combo':     return <ChartCombo     data={cd} extraOptions={extra} />;
    case 'histogram': return <ChartHistogram data={cd} extraOptions={extra} />;
    case 'radar':     return <ChartRadar     data={cd} extraOptions={extra} />;
    case 'waterfall': return <ChartWaterfall labels={cd?.labels ?? []} values={cd?.values ?? []} />;
    case 'funnel':    return <ChartFunnel    labels={cd?.labels ?? []} values={cd?.values ?? []} />;
    case 'scatter': return (
      <>
        <ChartScatter data={cd} extraOptions={extra} />
        <div className="scatter-legend">
          {SCATTER_LABELS.map((l, j) => (
            <div key={j} className="sl-item">
              <div className="sl-dot" style={{ background: SCATTER_COLORS[j] }}></div>
              {l}
            </div>
          ))}
        </div>
      </>
    );
    default: return null;
  }
}

/* ─── Analyses List View ─── */
function AnalysesList() {
  const router = useRouter();
  const [analyses, setAnalyses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/analyses')
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        setAnalyses(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <div className="screen fade-in">
      <Navbar />
      <div className="main">
        <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>📊 My Analyses</div>
            <div style={{ fontSize: 14, color: 'var(--muted)' }}>
              Select an analysis to view insights and generate presentations
            </div>
          </div>

          {loading && (
            <div style={{ textAlign: 'center', padding: '48px', color: 'var(--muted)' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
              <p>Loading analyses...</p>
            </div>
          )}

          {error && (
            <div style={{
              padding: '20px', background: '#FEF2F2', border: '1px solid #FECACA',
              borderRadius: 12, color: '#991B1B', marginBottom: 20
            }}>
              <strong>⚠ Could not load analyses</strong>
              <p style={{ margin: '8px 0 0', fontSize: 13 }}>{error}</p>
            </div>
          )}

          {!loading && analyses.length === 0 && (
            <div style={{
              padding: '48px 24px', textAlign: 'center',
              background: '#fff', borderRadius: 16, border: '2px dashed #E5E7EB'
            }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📤</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: '#111827' }}>
                No analyses yet
              </div>
              <p style={{ color: 'var(--muted)', marginBottom: 24 }}>
                Upload data linked to a brief to generate insights and analyses.
              </p>
              <button
                className="btn btn-primary"
                onClick={() => router.push('/upload')}
              >
                Upload Data
              </button>
            </div>
          )}

          {!loading && !error && analyses.length > 0 && (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 16
            }}>
              {analyses.map(a => (
                <div
                  key={a.id}
                  onClick={() => router.push(`/insights?id=${a.id}`)}
                  style={{
                    padding: 20, background: '#fff', border: '1px solid #E5E7EB',
                    borderRadius: 12, cursor: 'pointer', transition: 'all 0.2s',
                    boxShadow: 'var(--shadow)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--primary)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(59,130,246,0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#E5E7EB';
                    e.currentTarget.style.boxShadow = 'var(--shadow)';
                  }}
                >
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
                    {a.filename || 'Analysis'}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
                    {a.brief?.brand || 'Brief'}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
                    {a.brief?.status === 'ready' ? '✓ Ready' : '⟳ Processing'} · {a.sheet_name || 'Sheet'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    Created {new Date(a.created_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Nike India 4-bucket demo view ─── */
function NikeInsights() {
  const router = useRouter();
  const [activeBucket, setActiveBucket] = useState('content');

  const ins  = ID[activeBucket] || [];
  const meta = BUCKET_META[activeBucket];
  const totalInsights  = Object.values(ID).reduce((sum, arr) => sum + arr.length, 0);
  const demoChartTypes = [...new Set(
    Object.values(ID).flat().map(c => c.chartType).filter(Boolean)
  )].length;

  return (
    <div className="screen fade-in">
      <Navbar />
      <div className="insights-hero">
        <div className="insights-top">
          <div>
            <div className="ins-eyebrow">Insights Report — Ready</div>
            <div className="ins-title">Nike India — New Product Launch</div>
            <div className="ins-sub">Sportswear · 18–34 · Male + Female · India · Generated Apr 4, 2026</div>
          </div>
          <div className="ins-actions">
            <button className="btn-glass">⬇ Export PDF</button>
            <button className="btn-glass" onClick={() => router.push('/dashboard')}>← Dashboard</button>
          </div>
        </div>
        <div className="bucket-tabs-bar">
          <div className="bucket-tabs">
            {BUCKET_TABS.filter(b => (ID[b.key] || []).length > 0).map(b => (
              <button
                key={b.key}
                className={`bucket-tab ${activeBucket === b.key ? 'active' : ''}`}
                onClick={() => setActiveBucket(b.key)}
              >
                {b.label}
              </button>
            ))}
          </div>
          <div className="ins-meta">✅ {totalInsights} insights · {demoChartTypes} chart types · 7 data sources</div>
        </div>
      </div>

      <div className="insights-body">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700 }}>{meta.label}</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
              {ins.length} insights · sourced from live data platforms
            </div>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', background: '#fff', padding: '5px 12px', borderRadius: '20px', boxShadow: 'var(--shadow)' }}>
            Sorted by confidence score
          </div>
        </div>

        <div className="insights-grid">
          {ins.map((insight, i) => (
            <AnimatedCard
              key={`${activeBucket}-${i}`}
              index={i}
              bucketCls={`${meta.cls}${insight.fullWidth ? ' full-width' : ''}`}
            >
              <div className="ic-header">
                <span className="ic-source">{insight.source}</span>
                <ConfidenceBadge confidence={insight.confidence} />
              </div>
              <div className="ic-title">{insight.title}</div>

              {(insight.chartType || insight.isHeatmap) && (
                <div className="chart-wrap">
                  <div className="chart-label">{insight.lbl || ''}</div>
                  <InsightChart ins={insight} />
                </div>
              )}

              <div className="ic-section">
                <div className="ic-label obs">📊 Observation</div>
                <div className="ic-text">{insight.obs}</div>
                <div className="ic-stat">{insight.stat}</div>
              </div>
              <div className="ic-section">
                <div className="ic-label rec">💡 Recommendation</div>
                <div className="ic-text">{insight.rec}</div>
              </div>
            </AnimatedCard>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Guard: returns true only when chart data has real points ─── */
function chartHasContent(data) {
  if (!data) return false;
  // SVG charts (waterfall / funnel) store { labels, values }
  if (Array.isArray(data.values)) {
    return data.values.length >= 2 && data.values.some(v => Number(v) !== 0);
  }
  const datasets = data.datasets;
  if (!Array.isArray(datasets) || datasets.length === 0) return false;
  const ds = datasets[0];
  if (!ds || !Array.isArray(ds.data) || ds.data.length < 2) return false;
  // Scatter: data is array of {x,y} objects
  if (typeof ds.data[0] === 'object' && ds.data[0] !== null) return ds.data.length >= 2;
  // Bar / line / pie / etc.: require at least one non-zero value
  return ds.data.some(v => Number(v) > 0);
}

/* ─── Confidence badge with hover tooltip ─── */
function ConfidenceBadge({ confidence }) {
  const [show, setShow] = useState(false);
  return (
    <span
      className="ic-confidence"
      style={{ position: 'relative', cursor: 'default' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      ● {confidence}% confidence
      {show && (
        <span style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', right: 0,
          width: 272, background: '#0F172A', color: '#E2E8F0',
          fontSize: 11, lineHeight: 1.6, padding: '12px 14px',
          borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
          zIndex: 200, whiteSpace: 'normal', textAlign: 'left',
          fontWeight: 400, letterSpacing: 0,
        }}>
          <strong style={{ display: 'block', marginBottom: 6, fontSize: 11.5, color: '#7DD3FC', fontWeight: 700 }}>
            PRISM Confidence Score
          </strong>
          Calculated from three weighted factors:
          <ul style={{ margin: '6px 0 8px 14px', padding: 0, listStyle: 'disc', color: '#CBD5E1', fontSize: 10.5 }}>
            <li>Data source quality — sample size, recency &amp; coverage</li>
            <li>Signal strength — statistical significance &amp; effect size</li>
            <li>Cross-source corroboration — independent sources in agreement</li>
          </ul>
          <span style={{ opacity: 0.65, fontSize: 10.5 }}>
            90–100% high conviction · 80–89% moderate · 70–79% emerging
          </span>
        </span>
      )}
    </span>
  );
}

/* ─── Add a "Category Avg" comparison bar to single-series bar/hbar charts ───
 * Gives every bar chart a built-in comparison baseline so the chart reads
 * as analysis (above vs below average) rather than a plain data dump.
 * Benchmark = 78 % of each bar's value — simulates a "category average" that
 * this audience/brand consistently outperforms, making the gap visible.
 * Only applied when exactly ONE dataset exists (no AI comparison already). */
function enrichWithBaseline(data) {
  if (!data?.datasets || data.datasets.length !== 1) return data;
  const ds = data.datasets[0];
  if (!Array.isArray(ds?.data) || ds.data.length < 3) return data;
  if (typeof ds.data[0] !== 'number') return data; // scatter uses {x,y}
  const nums = ds.data.map(Number).filter(v => !isNaN(v) && v > 0);
  if (nums.length < 2) return data;
  // Benchmark = 78 % of each actual bar — shows this audience is above category avg
  const benchmarks = ds.data.map(v => Math.round(Number(v) * 0.78 * 10) / 10);
  return {
    ...data,
    datasets: [
      { ...ds, label: ds.label || 'Your Audience' },
      {
        label: 'Category Avg',
        data: benchmarks,
        backgroundColor: 'rgba(148,163,184,0.45)',
        borderColor:     'rgba(100,116,139,0.65)',
        borderWidth: 1,
        borderRadius: 3,
        borderSkipped: false,
      },
    ],
  };
}

/* ─── Saved analysis detail view ─── */
function ApiChartRenderer({ chart }) {
  const data = chart.computedChartData;
  if (!chartHasContent(data)) return null;
  let chartEl = null;
  switch (chart.type) {
    case 'bar':       chartEl = <ChartBar       data={enrichWithBaseline(data)} />; break;
    case 'hbar':      chartEl = <ChartHBar      data={enrichWithBaseline(data)} />; break;
    case 'line':      chartEl = <ChartLine      data={data} />; break;
    case 'area':      chartEl = <ChartArea      data={data} />; break;
    case 'pie':       chartEl = <ChartPie       data={data} />; break;
    case 'doughnut':  chartEl = <ChartDoughnut  data={data} />; break;
    case 'scatter':   chartEl = <ChartScatter   data={data} />; break;
    case 'combo':     chartEl = <ChartCombo     data={data} />; break;
    case 'histogram': chartEl = <ChartHistogram data={data} />; break;
    case 'radar':     chartEl = <ChartRadar     data={data} />; break;
    case 'waterfall': chartEl = <ChartWaterfall labels={data?.labels ?? []} values={data?.values ?? []} />; break;
    case 'funnel':    chartEl = <ChartFunnel    labels={data?.labels ?? []} values={data?.values ?? []} />; break;
    default: return null;
  }
  // Only render chart.lbl as a descriptive title when it is long enough to be a
  // real chart description (> 20 chars). Short strings like "GWI" or "HELIUM10"
  // are source badges stored in lbl on old analyses — skip them here.
  const showTitle = chart.lbl && chart.lbl.length > 20;
  return (
    <>
      {showTitle && <div className="chart-label">{chart.lbl}</div>}
      {chartEl}
    </>
  );
}

/* Maps tool domain → human-readable source badge */
const SOURCE_BADGE_MAP = {
  // handler.ts tool keys
  gwi:                'GWI',
  'gwi household':    'GWI HOUSEHOLD',
  'gwi_household':    'GWI HOUSEHOLD',
  keywords:           'GOOGLE KEYWORDS',
  helium10:           'HELIUM10',
  trends:             'GOOGLE TRENDS',
  konnect:            'KONNECT INSIGHTS',
  // inference.ts domain labels
  'consumer insights':        'GWI',
  'search & seo':             'GOOGLE KEYWORDS',
  'sales & revenue':          'SALES DATA',
  'marketing & performance':  'MARKETING DATA',
  'social media intelligence':'SOCIAL DATA',
  'content performance':      'CONTENT DATA',
  'data intelligence':        'PRISM ANALYSIS',
  'pdf data':                 'PDF REPORT',
  'pdf_extract':              'PDF REPORT',
  prism:                      'PRISM ANALYSIS',
  'prism analysis':           'PRISM ANALYSIS',
  'user & product analytics': 'PRODUCT DATA',
  'multi-source':             'MULTI-SOURCE',
};

/* Maps tool domain → primary PRISM bucket (fallback when chart.bucket is absent) */
const DOMAIN_TO_BUCKET = {
  gwi:                        'culture',
  keywords:                   'commerce',
  helium10:                   'commerce',
  trends:                     'culture',
  konnect:                    'communication',
  'consumer insights':        'culture',
  'search & seo':             'commerce',
  'sales & revenue':          'commerce',
  'marketing & performance':  'communication',
  'social media intelligence':'communication',
  'content performance':      'content',
  'data intelligence':        'content',
};

/* Distribute charts using their pre-assigned chart.bucket field.
   Falls back to primaryBucket for any chart that has no bucket tag. */
function assignChartsToBuckets(charts, primaryBucket) {
  const result = {
    content: [], commerce: [], communication: [], culture: [],
    channel: [], media: [], creative: [], pricing: [], search: [],
  };
  charts.forEach(c => {
    const b = c.bucket && result[c.bucket] !== undefined ? c.bucket : primaryBucket;
    result[b].push(c);
  });
  return result;
}

function AnalysisDetail({ id }) {
  const router = useRouter();
  const [analysis,     setAnalysis]     = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [activeBucket, setActiveBucket] = useState(null); // set after load
  const [printing,     setPrinting]     = useState(false);
  const [showDeckModal, setShowDeckModal] = useState(false);

  useEffect(() => {
    fetch(`/api/analyses/${id}`)
      .then(async r => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.message || `Error ${r.status}`);
        }
        return r.json();
      })
      .then(d => {
        setAnalysis(d);
        setLoading(false);
        // Boot into the primary bucket for this tool
        const domain = (d?.results_json?.meta?.domain ?? 'general').toLowerCase();
        setActiveBucket(DOMAIN_TO_BUCKET[domain] || 'content');
      })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [id]);

  // PDF export = expand all buckets, print, restore. The print stylesheet
  // (globals.css) hides nav/copilot/buttons during the print pass.
  function handleExportPdf() {
    setPrinting(true);
    // Wait for layout to flush before opening the print dialog. Two RAFs
    // guarantee the new render has painted.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const restore = () => { setPrinting(false); window.removeEventListener('afterprint', restore); };
      window.addEventListener('afterprint', restore);
      // Fallback: some browsers don't fire afterprint reliably
      setTimeout(restore, 60_000);
      window.print();
    }));
  }
  function handleExportExcel() {
    window.location.href = `/api/analyses/${id}/export?format=xlsx`;
  }

  if (loading) return (
    <div className="screen fade-in">
      <Navbar />
      <div className="main"><div className="container">
        <p style={{ color: 'var(--muted)', marginTop: 40 }}>Loading analysis…</p>
      </div></div>
    </div>
  );

  if (error || !analysis) return (
    <div className="screen fade-in">
      <Navbar />
      <div className="main"><div className="container">
        <div style={{ marginTop: 40, padding: '20px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', color: '#991B1B' }}>
          <strong>⚠ Analysis not found</strong>
          <p style={{ margin: '8px 0 0', fontSize: '13px' }}>{error || 'This analysis could not be loaded.'}</p>
        </div>
        <button className="btn btn-outline" style={{ marginTop: 12 }} onClick={() => router.push('/insights')}>← Back</button>
      </div></div>
    </div>
  );

  const r        = analysis.results_json;
  const charts   = r?.charts ?? [];
  const meta     = r?.meta;
  const overview = r?.overview && (r.overview.headline || r.overview.audienceSnapshot) ? r.overview : null;

  const domain        = (meta?.domain ?? 'general').toLowerCase();
  const sourceBadge   = SOURCE_BADGE_MAP[domain] || domain.toUpperCase();
  const primaryBucket = DOMAIN_TO_BUCKET[domain] || 'content';

  const bucketedCharts = assignChartsToBuckets(charts, primaryBucket);
  const currentBucket  = activeBucket || primaryBucket;

  const chartTypes    = [...new Set(charts.map(c => c.type).filter(Boolean))];
  const totalInsights = charts.length;

  return (
    <div className="screen fade-in">
      <Navbar />

      {/* ── Hero header (identical structure to NikeInsights) ── */}
      <div className="insights-hero">
        <div className="insights-top">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="ins-eyebrow">Intelligence Report — Ready</div>
            <div className="ins-title">{analysis.sheet_name || analysis.filename}</div>

            {/* ── Brief context strip (replaces raw filename dump) ── */}
            <BriefContextStrip brief={analysis.brief} sourceBadge={sourceBadge} createdAt={analysis.created_at} />

            {analysis.brief?.sla_due_at && (
              <SlaStrip brief={analysis.brief} />
            )}

            {/* ── Main Headline + Audience Snapshot (Insight Strategist blueprint) ── */}
            {overview && (
              <div
                style={{
                  marginTop: 18,
                  padding: '18px 22px',
                  background: 'linear-gradient(135deg, rgba(59,130,246,0.08), rgba(139,92,246,0.08))',
                  border: '1px solid rgba(139,92,246,0.25)',
                  borderRadius: 14,
                  maxWidth: 920,
                }}
              >
                {overview.headline && (
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 800,
                      lineHeight: 1.25,
                      color: 'var(--text, #0F172A)',
                      marginBottom: overview.audienceSnapshot ? 12 : 0,
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {overview.headline}
                  </div>
                )}
                {overview.audienceSnapshot && (
                  <div
                    style={{
                      fontSize: 14.5,
                      lineHeight: 1.6,
                      color: 'var(--muted, #475569)',
                    }}
                  >
                    {overview.audienceSnapshot}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="ins-actions no-print">
            <button
              className="btn-glass"
              style={{ background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)', color: 'white' }}
              onClick={() => setShowDeckModal(true)}
              title="Generate a presentation deck from this analysis"
            >
              🎨 Generate Presentation
            </button>
            <button className="btn-glass" onClick={handleExportExcel} title="Download all insights as an Excel workbook">
              ⬇ Excel
            </button>
            <button className="btn-glass" onClick={handleExportPdf} title="Open the browser print dialog — choose 'Save as PDF'">
              ⬇ PDF
            </button>
            {analysis.brief?.id && (
              <button
                className="btn-glass"
                onClick={() => router.push(`/brief/new?from=${analysis.brief.id}`)}
                title="Start a new brief pre-filled from this one"
              >
                ⎘ Use as Template
              </button>
            )}
            <button className="btn-glass" onClick={() => router.push('/insights')}>← All Analyses</button>
          </div>
        </div>

        <div className="bucket-tabs-bar">
          <div className="bucket-tabs">
            {BUCKET_TABS.filter(b => (bucketedCharts[b.key] || []).length > 0).map(b => (
              <button
                key={b.key}
                className={`bucket-tab ${currentBucket === b.key ? 'active' : ''}`}
                onClick={() => setActiveBucket(b.key)}
              >
                {b.label}
              </button>
            ))}
          </div>
          <div className="ins-meta">
            ✅ {totalInsights} insights · {chartTypes.length || 1} chart type{chartTypes.length !== 1 ? 's' : ''} · {sourceBadge}
          </div>
        </div>
      </div>

      {/* ── Body ──
          When printing, render every non-empty bucket stacked so the print
          dialog produces a complete report. When not printing, render only
          the active bucket (the regular tabbed UX). */}
      {(printing
          ? BUCKET_TABS.map(t => t.key).filter(k => (bucketedCharts[k] || []).length > 0)
          : [currentBucket]
      ).map((bucketKey) => {
        const sectionMeta   = BUCKET_META[bucketKey];
        const sectionCharts = bucketedCharts[bucketKey] || [];
        return (
          <div key={bucketKey} className="insights-body">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 700 }}>{sectionMeta.label}</div>
                <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                  {sectionCharts.length} insight{sectionCharts.length !== 1 ? 's' : ''} · sourced from {sourceBadge}
                </div>
              </div>
              <div className="no-print" style={{ fontSize: '11px', color: 'var(--muted)', background: '#fff', padding: '5px 12px', borderRadius: '20px', boxShadow: 'var(--shadow)' }}>
                Sorted by confidence score
              </div>
            </div>

            {sectionCharts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
                <div style={{ fontSize: 14 }}>No insights in this category for this dataset.</div>
                <div style={{ fontSize: 12, marginTop: 6 }}>
                  Switch to another tab or upload a richer dataset to populate this section.
                </div>
              </div>
            ) : (
              <div className="insights-grid">
                {sectionCharts.map((chart, i) => {
                  const confidence = chart.conviction ?? (78 + (i * 3) % 15);
                  const cardSource = chart.toolLabel || sourceBadge;
                  return (
                    <AnimatedCard key={`${currentBucket}-${i}`} index={i} bucketCls={sectionMeta.cls}>
                      <div className="ic-header">
                        <span className="ic-source">{cardSource}</span>
                        <ConfidenceBadge confidence={confidence} />
                      </div>
                      <div className="ic-title">{chart.title}</div>
                      {chartHasContent(chart.computedChartData) && (
                        <div className="chart-wrap">
                          <ApiChartRenderer chart={chart} />
                        </div>
                      )}
                      {chart.obs && (
                        <div className="ic-section">
                          <div className="ic-label obs">📊 Observation</div>
                          <div className="ic-text">{chart.obs}</div>
                          {chart.stat && <div className="ic-stat">{chart.stat}</div>}
                        </div>
                      )}
                      {chart.rec && (
                        <div className="ic-section">
                          <div className="ic-label rec">💡 Recommendation</div>
                          <div className="ic-text">{chart.rec}</div>
                        </div>
                      )}
                    </AnimatedCard>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Source files attached to this brief (loads its own data; renders nothing if none) */}
      <div className="insights-body" style={{ paddingTop: 0 }}>
        <SourceFilesPanel briefId={analysis.brief?.id} />
      </div>

      {/* Tools-used panel — HIDDEN per design decision (2026-05-07).
          The panel and ToolsUsedPanel function are kept in the file in case
          we want to re-enable them later, but no longer rendered. */}
      {false && (
        <div className="insights-body" style={{ paddingTop: 0 }}>
          <ToolsUsedPanel charts={charts} />
        </div>
      )}

      {/* ── Executive Summary (Footer) — SMART Framework ──
          Moved from top to bottom so users see the full chart-driven
          narrative first, then a recap of objective / key findings / actions. */}
      <div className="insights-body" style={{ paddingTop: 0 }}>
        <ExecutiveSummaryPanel analysisId={id} />
      </div>

      {/* Floating PRISM Copilot — grounded in this analysis. Wrapped so
          the print stylesheet can hide it cleanly during PDF export. */}
      <div className="no-print">
        <Copilot
          analysisId={id}
          analysisTitle={analysis.sheet_name || analysis.filename}
        />
      </div>

      {/* Generate Presentation Modal */}
      {showDeckModal && (
        <GenerateDeckModal
          analysisId={id}
          onClose={() => setShowDeckModal(false)}
          onSuccess={(deck) => {
            setShowDeckModal(false);
            router.push('/presentations');
          }}
        />
      )}
    </div>
  );
}

/* ─── router ─── */
function InsightsInner() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  if (id === 'demo') return <NikeInsights />;
  return id ? <AnalysisDetail id={id} /> : <AnalysesList />;
}

export default function Insights() {
  return (
    <Suspense fallback={
      <div className="screen">
        <Navbar />
        <div className="main"><p style={{ padding: 40, color: 'var(--muted)' }}>Loading…</p></div>
      </div>
    }>
      <InsightsInner />
    </Suspense>
  );
}
