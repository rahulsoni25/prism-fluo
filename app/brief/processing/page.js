'use client';
import { useState, useEffect, Suspense } from 'react';
import Navbar from '@/components/Navbar';
import { useRouter, useSearchParams } from 'next/navigation';
import { PLATFORMS_DATA } from '@/lib/data';
import { formatSlaBadge } from '@/lib/sla';

const SL = { complete: '● Complete', fetching: '⟳ Fetching', connecting: '⟳ Connecting', queued: '○ Queued' };
const SC = { complete: 's-complete', fetching: 's-fetching', connecting: 's-fetching', queued: 's-fetching' };

// Extra detail shown when a card is expanded (click to reveal)
const PLATFORM_DETAILS = {
  'Global Web Index (GWI)':      { metrics: ['14.2M respondents profiled', '47 psychographic signals', '8 audience segments built'], tip: 'Audience profile ready for content strategy' },
  'Comscore':                    { metrics: ['8.4B digital touchpoints', '92% market reach coverage', 'Cross-device deduplication'], tip: 'Audience overlap with competitors detected' },
  'SimilarWeb':                  { metrics: ['Crawling 14 competitor domains', 'Traffic gap analysis in progress', 'Channel mix comparison'], tip: 'Share-of-traffic benchmark being computed' },
  'Google Trends':               { metrics: ['24-month search history fetched', 'Seasonality index calculated', 'Category trend mapped'], tip: 'Trend peak in past 4 weeks — good timing' },
  'Google Insights Finder':      { metrics: ['Consumer intent signals loading', 'Interest affinity mapping', 'Audience interest clusters'], tip: 'API handshake in progress — ~2 min' },
  'Brandwatch Sentiment':        { metrics: ['2.3M brand mentions processed', 'Share of voice calculated', 'Sentiment by channel split'], tip: 'Net sentiment positive at +68% this quarter' },
  'Helium10':                    { metrics: ['Amazon keyword index queued', 'Category rank data queued', 'Starts after GWI + Comscore'], tip: 'Slot reserved — processing starts in ~2 hrs' },
  'Google Keyword':              { metrics: ['500 high-intent keywords mapped', 'CPC benchmarks captured', 'Competitor keyword gaps listed'], tip: 'Top-of-funnel opportunities identified' },
};

const BUCKET_DEFS = [
  { icon: '📝', name: 'Content',       color: 'linear-gradient(90deg,#2563EB,#60A5FA)' },
  { icon: '🛒', name: 'Commerce',      color: 'linear-gradient(90deg,#059669,#34D399)' },
  { icon: '📢', name: 'Communication', color: 'linear-gradient(90deg,#7C3AED,#A78BFA)' },
  { icon: '🌍', name: 'Culture',       color: 'linear-gradient(90deg,#D97706,#FBBF24)' },
  { icon: '📡', name: 'Channel',       color: 'linear-gradient(90deg,#0891B2,#22D3EE)' },
  { icon: '🎬', name: 'Media',         color: 'linear-gradient(90deg,#EA580C,#FB923C)' },
  { icon: '🎨', name: 'Creative',      color: 'linear-gradient(90deg,#C026D3,#E879F9)' },
  { icon: '💰', name: 'Pricing',       color: 'linear-gradient(90deg,#DC2626,#F87171)' },
  { icon: '🔍', name: 'Search',        color: 'linear-gradient(90deg,#0D9488,#2DD4BF)' },
];

function ProcessingInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const briefId = searchParams.get('id');

  const [brief, setBrief] = useState(null);
  const [widths, setWidths] = useState(PLATFORMS_DATA.map(p => p.pct));
  const [bucketPcts, setBucketPcts] = useState([45, 28, 60, 15, 20, 18, 22, 12, 25]);
  const [expandedCard, setExpandedCard] = useState(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!briefId) return;
    fetch(`/api/briefs/${briefId}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(d => { if (!d.error) setBrief(d); })
      .catch(err => console.warn('[processing] Could not load brief:', err.message));
  }, [briefId]);

  // Per-platform animation speeds (% per tick) and caps — staggered so bars
  // move at different rates, giving a genuine "live fetching" feel.
  const BAR_SPEED = [0.25, 0.30, 0.35, 0.18, 0.55, 0.28, 0.60, 0.32];
  const BAR_CAP   = [88,   82,   72,   92,   55,   85,   45,   78  ];

  // Animate progress bars
  useEffect(() => {
    const tb = setInterval(() => {
      setWidths(prev => prev.map((w, i) => w < BAR_CAP[i] ? Math.min(w + BAR_SPEED[i], BAR_CAP[i]) : w));
    }, 400);
    const tBucket = setInterval(() => {
      setBucketPcts(prev => prev.map(p => Math.min(p + Math.random() * 0.5 + 0.1, 90)));
    }, 600);
    const te = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => { clearInterval(tb); clearInterval(tBucket); clearInterval(te); };
  }, []);

  const fetchingSources = PLATFORMS_DATA.filter(p => p.status === 'fetching').length;
  const elapsedStr = elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;
  const brandLabel = brief?.brand ?? '…';
  const subLabel = [brief?.category, brief?.age_ranges, brief?.market, brief?.objective]
    .filter(Boolean).join(' · ');

  return (
    <div className="screen fade-in">
      <Navbar />
      <div className="proc-hero">
        <div className="proc-eyebrow">Brief Submitted Successfully</div>
        <div className="proc-title">Mining Insights for {brandLabel}</div>
        {subLabel && <div className="proc-sub">{subLabel}</div>}
        <div className="eta-pill">
          ⏳ Estimated ready in <strong>
            &nbsp;{brief?.sla_due_at
              ? (formatSlaBadge(brief.sla_due_at, brief.actual_completed_at, brief.created_at).replace(/^Due in /, '~') || '~6 hours')
              : '~8 hours'}
          </strong>
          {brief?.sla_due_at && (
            <span style={{ marginLeft: 6, opacity: 0.85 }}>
              · ETA {new Date(brief.sla_due_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
          &nbsp;·&nbsp;{fetchingSources} of {PLATFORMS_DATA.length} sources fetching
        </div>
        <div className="elapsed-pill">
          ⏱ Processing for <strong style={{ color: '#fff', marginLeft: 4 }}>{elapsedStr}</strong>
        </div>
      </div>

      <div className="main">
        <div className="container">

          {/* When the brief is waiting for data, surface an explicit CTA so
              the user can attach files. The /upload page picks up briefId
              from the URL and links every uploaded file + analysis back. */}
          {brief?.status === 'waiting_for_data' && (
            <div style={{
              background: 'linear-gradient(135deg, #EEF2FF 0%, #F5F3FF 100%)',
              border: '1.5px solid #C7D2FE',
              borderRadius: 14, padding: '20px 22px', marginBottom: 22,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>📤 Add data files to start mining insights</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  Upload Excel, CSV, or PDF files. Every file you add is automatically attached to this brief — no manual mapping.
                </div>
              </div>
              <button
                className="btn btn-primary"
                onClick={() => router.push(`/upload?briefId=${briefId}`)}
                style={{ flexShrink: 0 }}
              >
                Upload Data →
              </button>
            </div>
          )}

          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '3px' }}>Platform Data Sources</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Connecting to {PLATFORMS_DATA.length} platforms to gather audience, competitive, and cultural intelligence</div>
          </div>

          <div className="platform-grid">
            {PLATFORMS_DATA.map((p, i) => {
              const isExpanded = expandedCard === i;
              const detail = PLATFORM_DETAILS[p.name] ?? { metrics: [], tip: '' };
              return (
                <div
                  key={i}
                  className={`plat-card ${p.status}${isExpanded ? ' expanded' : ''} fade-in`}
                  style={{ animationDelay: `${i * 0.07}s` }}
                  onClick={() => setExpandedCard(isExpanded ? null : i)}
                  title="Click for details"
                >
                  <div className="plat-header">
                    <div className="plat-left">
                      <span style={{ fontSize: '18px' }}>{p.icon}</span>
                      <div className="plat-nm">{p.name}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className={`plat-status ${SC[p.status]}`}>{SL[p.status]}</span>
                      <span style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1 }}>{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </div>
                  <div className="plat-desc">{p.desc}</div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${widths[i]}%` }}></div>
                  </div>
                  <div className="plat-note">{p.note}</div>

                  {/* Expanded detail panel */}
                  {isExpanded && (
                    <div className="plat-expand">
                      {detail.metrics.map((m, mi) => (
                        <div key={mi} className="plat-expand-row">
                          <span style={{ color: p.status === 'complete' ? '#059669' : p.status === 'queued' ? '#94A3B8' : '#2563EB' }}>●</span>
                          {m}
                        </div>
                      ))}
                      {detail.tip && (
                        <div style={{ marginTop: 8, padding: '6px 8px', background: '#FFF7ED', borderRadius: 6, fontSize: 11, color: '#92400E', fontStyle: 'italic' }}>
                          💡 {detail.tip}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ background: '#fff', borderRadius: '14px', padding: '24px', marginTop: '22px', boxShadow: 'var(--shadow)' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: 8 }}>
              Insight Buckets — Mining in Progress
              <span style={{ fontSize: 10, fontWeight: 700, background: '#DBEAFE', color: '#1D4ED8', borderRadius: 20, padding: '2px 9px', animation: 'badge-pulse 1.6s ease-in-out infinite' }}>⟳ Live</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 16 }}>Extracting signals across all 9 buckets from uploaded data sources</div>
            <div className="bucket-progress-grid">
              {BUCKET_DEFS.map((b, i) => (
                <div key={i} className="bucket-prog-card">
                  <div className="bpc-icon">{b.icon}</div>
                  <div className="bpc-name">{b.name}</div>
                  <div className="bpc-note">{Math.floor(bucketPcts[i] / 15)} insights ready</div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${bucketPcts[i]}%`, background: b.color }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ textAlign: 'center', marginTop: '28px', color: 'var(--muted)', fontSize: '12px', lineHeight: 2 }}>
            You'll receive an email when your insights are ready. You can safely close this page.<br />
            <button className="btn btn-outline btn-sm" style={{ marginTop: '10px' }} onClick={() => router.push('/dashboard')}>← Back to Dashboard</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Processing() {
  return (
    <Suspense fallback={<div className="screen"><Navbar /><div className="main"><p style={{ padding: 40, color: 'var(--muted)' }}>Loading…</p></div></div>}>
      <ProcessingInner />
    </Suspense>
  );
}
