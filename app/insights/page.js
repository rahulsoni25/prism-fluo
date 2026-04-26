'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Copilot from '@/components/Copilot';
import {
  ChartBar, ChartLine, ChartPie, ChartScatter, ChartHBar,
  Heatmap, Scorecard,
} from '@/components/charts/AppChart';
import { ID, HM_DATA, SCATTER_COLORS, SCATTER_LABELS, PLATFORMS_DATA } from '@/lib/data';

/* ─── helpers ─── */
function fmtTs(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
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

/* ─── Guard: returns true only when chart data has real points ─── */
function chartHasContent(data) {
  if (!data) return false;
  const datasets = data.datasets;
  if (!Array.isArray(datasets) || datasets.length === 0) return false;
  const ds = datasets[0];
  if (!ds || !Array.isArray(ds.data) || ds.data.length < 2) return false;
  // Scatter: data is array of {x,y} objects
  if (typeof ds.data[0] === 'object' && ds.data[0] !== null) return ds.data.length >= 2;
  // Bar / line / pie: require at least one non-zero value
  return ds.data.some(v => Number(v) > 0);
}

/* ─── Saved analysis detail view ─── */
function ApiChartRenderer({ chart }) {
  const data = chart.computedChartData;
  if (!chartHasContent(data)) return null;
  switch (chart.type) {
    case 'bar':     return <ChartBar     data={data} />;
    case 'line':    return <ChartLine    data={data} />;
    case 'hbar':    return <ChartHBar    data={data} />;
    case 'pie':     return <ChartPie     data={data} />;
    case 'scatter': return <ChartScatter data={data} />;
    default:        return null;
  }
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
  const result = { content: [], commerce: [], communication: [], culture: [] };
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

  const r      = analysis.results_json;
  const charts = r?.charts ?? [];
  const meta   = r?.meta;

  const domain        = (meta?.domain ?? 'general').toLowerCase();
  const sourceBadge   = SOURCE_BADGE_MAP[domain] || domain.toUpperCase();
  const primaryBucket = DOMAIN_TO_BUCKET[domain] || 'content';

  const bucketedCharts = assignChartsToBuckets(charts, primaryBucket);
  const currentBucket  = activeBucket || primaryBucket;
  const activeCharts   = bucketedCharts[currentBucket] || [];
  const activeMeta     = BUCKET_META[currentBucket];

  const chartTypes    = [...new Set(charts.map(c => c.type).filter(Boolean))];
  const totalInsights = charts.length;

  return (
    <div className="screen fade-in">
      <Navbar />

      {/* ── Hero header (identical structure to NikeInsights) ── */}
      <div className="insights-hero">
        <div className="insights-top">
          <div>
            <div className="ins-eyebrow">Intelligence Report — Ready</div>
            <div className="ins-title">{analysis.sheet_name || analysis.filename}</div>
            <div className="ins-sub">
              {analysis.filename} · {sourceBadge} · {timeAgo(analysis.created_at)}
            </div>
            {analysis.brief?.sla_due_at && (
              <SlaStrip brief={analysis.brief} />
            )}
          </div>
          <div className="ins-actions">
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
            {BUCKET_TABS.map(b => (
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

      {/* ── Body ── */}
      <div className="insights-body">
        {/* Section header row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700 }}>{activeMeta.label}</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
              {activeCharts.length} insight{activeCharts.length !== 1 ? 's' : ''} · sourced from {sourceBadge}
            </div>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', background: '#fff', padding: '5px 12px', borderRadius: '20px', boxShadow: 'var(--shadow)' }}>
            Sorted by confidence score
          </div>
        </div>

        {/* Empty state */}
        {activeCharts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
            <div style={{ fontSize: 14 }}>No insights in this category for this dataset.</div>
            <div style={{ fontSize: 12, marginTop: 6 }}>
              Switch to another tab or upload a richer dataset to populate this section.
            </div>
          </div>
        ) : (
          <div className="insights-grid">
            {activeCharts.map((chart, i) => {
              const confidence  = chart.conviction ?? (78 + (i * 3) % 15);
              const cardSource  = chart.toolLabel || sourceBadge;
              return (
                <div
                  key={i}
                  className={`insight-card ${activeMeta.cls} fade-in`}
                  style={{ animationDelay: `${i * 0.08}s` }}
                >
                  {/* Card header */}
                  <div className="ic-header">
                    <span className="ic-source">{cardSource}</span>
                    <span className="ic-confidence">● {confidence}% confidence</span>
                  </div>

                  {/* Title */}
                  <div className="ic-title">{chart.title}</div>

                  {/* Chart — only render wrapper when there is real data */}
                  {chartHasContent(chart.computedChartData) && (
                    <div className="chart-wrap">
                      <ApiChartRenderer chart={chart} />
                    </div>
                  )}

                  {/* Observation */}
                  {chart.obs && (
                    <div className="ic-section">
                      <div className="ic-label obs">📊 Observation</div>
                      <div className="ic-text">{chart.obs}</div>
                      {chart.stat && <div className="ic-stat">{chart.stat}</div>}
                    </div>
                  )}

                  {/* Recommendation */}
                  {chart.rec && (
                    <div className="ic-section">
                      <div className="ic-label rec">💡 Recommendation</div>
                      <div className="ic-text">{chart.rec}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tools-used panel — shows the contributing platforms */}
      <div className="insights-body" style={{ paddingTop: 0 }}>
        <ToolsUsedPanel charts={charts} />
      </div>

      {/* Floating PRISM Copilot — grounded in this analysis */}
      <Copilot
        analysisId={id}
        analysisTitle={analysis.sheet_name || analysis.filename}
      />
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
