'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import {
  ChartBar, ChartLine, ChartPie, ChartScatter, ChartHBar,
  Heatmap, Scorecard,
} from '@/components/charts/AppChart';
import { ID, HM_DATA, SCATTER_COLORS, SCATTER_LABELS } from '@/lib/data';

/* ─── helpers ─── */
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
};

const BUCKET_TABS = [
  { key: 'content',       label: '📝 Content' },
  { key: 'commerce',      label: '🛒 Commerce' },
  { key: 'communication', label: '📢 Communication' },
  { key: 'culture',       label: '🌍 Culture' },
];

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
  switch (ins.chartType) {
    case 'bar':     return <ChartBar    data={ins.chartData} extraOptions={extra} />;
    case 'line':    return <ChartLine   data={ins.chartData} extraOptions={extra} />;
    case 'pie':     return <ChartPie    data={ins.chartData} extraOptions={extra} />;
    case 'hbar':    return <ChartHBar   data={ins.chartData} extraOptions={extra} />;
    case 'scatter': return (
      <>
        <ChartScatter data={ins.chartData} extraOptions={extra} />
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

/* ─── Nike India 4-bucket demo view ─── */
function NikeInsights() {
  const router = useRouter();
  const [activeBucket, setActiveBucket] = useState('content');

  const ins  = ID[activeBucket] || [];
  const meta = BUCKET_META[activeBucket];
  const totalInsights = Object.values(ID).reduce((sum, arr) => sum + arr.length, 0);

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
            {BUCKET_TABS.map(b => (
              <button
                key={b.key}
                className={`bucket-tab ${activeBucket === b.key ? 'active' : ''}`}
                onClick={() => setActiveBucket(b.key)}
              >
                {b.label}
              </button>
            ))}
          </div>
          <div className="ins-meta">✅ {totalInsights} insights · 5 chart types · 7 data sources</div>
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
            <div
              key={i}
              className={`insight-card ${meta.cls}${insight.fullWidth ? ' full-width' : ''} fade-in`}
              style={{ animationDelay: `${i * 0.08}s` }}
            >
              <div className="ic-header">
                <span className="ic-source">{insight.source}</span>
                <span className="ic-confidence">● {insight.confidence}% confidence</span>
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
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Saved analysis detail view ─── */
function ApiChartRenderer({ chart }) {
  const data = chart.computedChartData;
  if (!data) return null;
  switch (chart.type) {
    case 'bar':     return <ChartBar     data={data} />;
    case 'line':    return <ChartLine    data={data} />;
    case 'hbar':    return <ChartHBar    data={data} />;
    case 'pie':     return <ChartPie     data={data} />;
    case 'scatter': return <ChartScatter data={data} />;
    default:        return null;
  }
}

function AnalysisDetail({ id }) {
  const router = useRouter();
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  useEffect(() => {
    fetch(`/api/analyses/${id}`)
      .then(async r => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.message || `Error ${r.status}`);
        }
        return r.json();
      })
      .then(d => { setAnalysis(d); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [id]);

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

  const r          = analysis.results_json;
  const scorecards = r?.scorecards  ?? [];
  const charts     = r?.charts      ?? [];
  const brief      = r?.strategicBrief;
  const meta       = r?.meta;

  return (
    <div className="screen fade-in">
      <Navbar />
      <div className="insights-hero">
        <div className="insights-top">
          <div>
            <div className="ins-eyebrow">Intelligence Report — Ready</div>
            <div className="ins-title">{analysis.sheet_name}</div>
            <div className="ins-sub">
              {analysis.filename} · {meta?.domain ?? 'General'} · {timeAgo(analysis.created_at)}
            </div>
          </div>
          <div className="ins-actions">
            <button className="btn-glass" onClick={() => router.push('/insights')}>← All Analyses</button>
          </div>
        </div>
        <div className="bucket-tabs-bar">
          <div className="ins-meta">✅ {charts.length} charts · {scorecards.length} scorecards</div>
        </div>
      </div>

      <div className="insights-body">
        {scorecards.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
              Key Metrics
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              {scorecards.map((sc, i) => <Scorecard key={i} {...sc} />)}
            </div>
          </div>
        )}

        {brief && (
          <div style={{ marginBottom: 32, background: 'white', borderRadius: 12, padding: '20px 24px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Strategic Brief</div>
            {brief.pillars?.map((p, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <span style={{ fontWeight: 700, fontSize: 12, textTransform: 'uppercase', color: 'var(--primary)' }}>{p.label}</span>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{p.text}</p>
              </div>
            ))}
            {brief.masterAction && (
              <div style={{ marginTop: 12, padding: '12px 16px', background: '#EFF6FF', borderRadius: 8, fontSize: 13, color: '#1E40AF', lineHeight: 1.6 }}>
                {brief.masterAction}
              </div>
            )}
          </div>
        )}

        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
          Charts
        </div>
        <div className="insights-grid">
          {charts.map((chart, i) => (
            <div key={i} className="insight-card fade-in" style={{ animationDelay: `${i * 0.06}s` }}>
              <div className="ic-header">
                <span className="ic-source">{meta?.domain ?? 'PRISM'}</span>
                {chart.conviction != null && (
                  <span className="ic-confidence">● {chart.conviction}% confidence</span>
                )}
              </div>
              <div className="ic-title">{chart.title}</div>
              {chart.computedChartData && (
                <div className="chart-wrap">
                  <ApiChartRenderer chart={chart} />
                </div>
              )}
              {/* FIX: use chart.obs / chart.rec (not chart.observation / chart.recommendation) */}
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
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── router ─── */
function InsightsInner() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  return id ? <AnalysisDetail id={id} /> : <NikeInsights />;
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
