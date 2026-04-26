'use client';
import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import BriefCard from '@/components/BriefCard';
import { useRouter } from 'next/navigation';
import { formatSlaBadge } from '@/lib/sla';

const CATEGORY_ICONS = {
  'FMCG — Food & Beverages':  '☕',
  'Fashion & Apparel':         '👗',
  'Automotive':                '🚗',
  'Telecom':                   '📱',
  'Google Keyword Advertising':'🔍',
  'Sportswear & Footwear':     '👟',
  'Beauty & Cosmetics':        '💄',
};

const STATUS_BADGE = {
  ready:            { text: '✓ Ready',       cls: 'badge-ready' },
  processing:       { text: '⟳ Processing',  cls: 'badge-processing', extra: 'pulsing' },
  waiting_for_data: { text: '⏳ Waiting',     cls: 'badge-processing' },
  draft:            { text: 'Draft',          cls: 'badge-draft' },
};

function formatMeta(brief) {
  const when = new Date(brief.created_at);
  const diff  = Math.floor((Date.now() - when) / 1000);
  let ago;
  if (diff < 3600)       ago = `${Math.floor(diff / 60)} min ago`;
  else if (diff < 86400) ago = `${Math.floor(diff / 3600)} hrs ago`;
  else                   ago = `${Math.floor(diff / 86400)} days ago`;
  return `${brief.objective || 'Brief'} · Submitted ${ago}`;
}

function buildTags(brief) {
  const tags = [];
  if (brief.category)                                tags.push(brief.category);
  if (brief.age_ranges)                              tags.push(brief.age_ranges);
  if (brief.market)                                  tags.push(brief.market);
  if (brief.gender && brief.gender !== 'All Genders') tags.push(brief.gender);
  return tags;
}

export default function Dashboard() {
  const router = useRouter();
  const [filter, setFilter]   = useState('All Briefs');
  const [briefs, setBriefs]   = useState([]);
  const [stats, setStats]     = useState({ total: 0, ready: 0, processing: 0, waiting: 0, draft: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    // Single round-trip to the overview endpoint (replaces multiple /api/briefs calls)
    fetch('/api/dashboard/overview')
      .then(async r => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.message || `Server error ${r.status}`);
        }
        return r.json();
      })
      .then(data => {
        setBriefs(Array.isArray(data.briefs) ? data.briefs : []);
        if (data.stats) setStats(data.stats);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message || 'Could not load dashboard data. Check your connection.');
        setLoading(false);
      });
  }, []);

  const FILTERS = ['All Briefs', 'Ready', 'Processing', 'Waiting', 'Draft'];
  const FILTER_TO_STATUS = {
    'Ready':      'ready',
    'Processing': 'processing',
    'Waiting':    'waiting_for_data',
    'Draft':      'draft',
  };

  const filtered = briefs.filter(b => {
    if (filter === 'All Briefs') return true;
    return b.status === FILTER_TO_STATUS[filter];
  });

  return (
    <div className="screen fade-in">
      <Navbar />
      <div className="main">
        <div className="container">
          <div className="page-header">
            <div>
              <div className="page-title">My Insights Briefs</div>
              <div className="page-sub">Track your client intelligence requests</div>
            </div>
            <button className="btn btn-primary" onClick={() => router.push('/brief/new')}>
              + New Brief
            </button>
          </div>

          {/* Stats row — driven by real DB aggregation */}
          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-label">Total Briefs</div>
              <div className="stat-val">{stats.total}</div>
              <div className="stat-note">All time</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Insights Ready</div>
              <div className="stat-val" style={{ color: '#059669' }}>{stats.ready}</div>
              <div className="stat-note" style={{ color: 'var(--muted)' }}>Available to view</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">In Progress</div>
              <div className="stat-val" style={{ color: '#D97706' }}>{stats.processing + (stats.waiting || 0)}</div>
              <div className="stat-note" style={{ color: 'var(--muted)' }}>
                {stats.waiting ? `${stats.waiting} waiting · ${stats.processing} processing` : 'Typical delivery 4–6 hrs'}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Data Sources</div>
              <div className="stat-val" style={{ color: 'var(--primary)' }}>7</div>
              <div className="stat-note" style={{ color: 'var(--muted)' }}>Platforms connected</div>
            </div>
          </div>

          <div className="filter-bar">
            {FILTERS.map(f => (
              <button
                key={f}
                className={`filter-btn ${filter === f ? 'active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="briefs-grid">
            {/* Loading state */}
            {loading && (
              <p style={{ color: 'var(--muted)', gridColumn: '1/-1' }}>Loading briefs…</p>
            )}

            {/* Error state — shown instead of fake demo data */}
            {!loading && error && (
              <div style={{
                gridColumn: '1/-1',
                padding: '24px',
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                borderRadius: '12px',
                color: '#991B1B',
              }}>
                <strong>⚠ Could not load briefs</strong>
                <p style={{ margin: '8px 0 0', fontSize: '13px' }}>{error}</p>
                <button
                  className="btn btn-outline"
                  style={{ marginTop: '12px', fontSize: '13px' }}
                  onClick={() => window.location.reload()}
                >
                  Retry
                </button>
              </div>
            )}

            {/* Empty state — distinct from error */}
            {!loading && !error && filtered.length === 0 && (
              <div style={{
                gridColumn: '1/-1',
                padding: '48px',
                textAlign: 'center',
                color: 'var(--muted)',
              }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>📋</div>
                <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '8px' }}>
                  {filter === 'All Briefs' ? 'No briefs yet' : `No ${filter.toLowerCase()} briefs`}
                </div>
                <div style={{ fontSize: '13px', marginBottom: '16px' }}>
                  Create your first insights brief to get started.
                </div>
                <button className="btn btn-primary" onClick={() => router.push('/brief/new')}>
                  + New Brief
                </button>
              </div>
            )}

            {/* Real briefs */}
            {!loading && !error && filtered.map(brief => {
              const badge = STATUS_BADGE[brief.status] || STATUS_BADGE.draft;
              const slaText = formatSlaBadge(brief.sla_due_at, brief.actual_completed_at, brief.created_at);
              const footer  = ['📡 7 sources'];
              if (slaText) footer.push(`⏱ ${slaText}`);
              return (
                <BriefCard
                  key={brief.id}
                  href={
                    brief.status === 'ready'
                      ? (brief.analysis_id ? `/insights?id=${brief.analysis_id}` : '/insights')
                      : brief.status === 'processing' || brief.status === 'waiting_for_data'
                      ? `/brief/processing?id=${brief.id}`
                      : '/brief/new'
                  }
                  icon={CATEGORY_ICONS[brief.category] || '📋'}
                  badgeText={badge.text}
                  badgeClass={badge.cls}
                  badgeExtra={badge.extra || ''}
                  brand={brief.brand}
                  meta={formatMeta(brief)}
                  tags={buildTags(brief)}
                  footerItems={brief.status !== 'draft' ? footer : undefined}
                  isDraft={brief.status === 'draft'}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
