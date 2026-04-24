'use client';
import { useState, useEffect, Suspense } from 'react';
import Navbar from '@/components/Navbar';
import { useRouter, useSearchParams } from 'next/navigation';
import { PLATFORMS_DATA } from '@/lib/data';

const SL = { complete: '✓ Complete', fetching: '⟳ Fetching', connecting: '⟳ Connecting', queued: '○ Queued' };
const SC = { complete: 's-complete', fetching: 's-fetching', connecting: 's-connecting', queued: 's-queued' };

const BUCKET_DEFS = [
  { icon: '📝', name: 'Content',       color: 'linear-gradient(90deg,#2563EB,#60A5FA)' },
  { icon: '🛒', name: 'Commerce',      color: 'linear-gradient(90deg,#059669,#34D399)' },
  { icon: '📢', name: 'Communication', color: 'linear-gradient(90deg,#7C3AED,#A78BFA)' },
  { icon: '🌍', name: 'Culture',       color: 'linear-gradient(90deg,#D97706,#FBBF24)' },
];

function ProcessingInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const briefId = searchParams.get('id');

  const [brief, setBrief] = useState(null);
  const [widths, setWidths] = useState(PLATFORMS_DATA.map(p => p.pct));
  const [bucketPcts, setBucketPcts] = useState([45, 28, 60, 15]);

  useEffect(() => {
    if (!briefId) return;
    fetch(`/api/briefs/${briefId}`)
      .then(r => r.json())
      .then(d => { if (!d.error) setBrief(d); });
  }, [briefId]);

  // Animate progress bars
  useEffect(() => {
    const t2 = setInterval(() => {
      setWidths(prev => {
        const next = [...prev];
        if (next[2] < 78) next[2] = Math.min(next[2] + 0.4, 78);
        return next;
      });
    }, 400);
    const t4 = setInterval(() => {
      setWidths(prev => {
        const next = [...prev];
        if (next[4] < 38) next[4] = Math.min(next[4] + 0.8, 38);
        return next;
      });
    }, 600);
    const tb = setInterval(() => {
      setBucketPcts(prev => prev.map(p => Math.min(p + Math.random() * 0.3, 95)));
    }, 800);
    return () => { clearInterval(t2); clearInterval(t4); clearInterval(tb); };
  }, []);

  const completedSources = PLATFORMS_DATA.filter(p => p.status === 'complete').length;
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
          ⏳ Estimated ready in <strong>&nbsp;~16 hours</strong>&nbsp;·&nbsp;{completedSources} of {PLATFORMS_DATA.length} sources complete
        </div>
      </div>

      <div className="main">
        <div className="container">
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '3px' }}>Platform Data Sources</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Connecting to {PLATFORMS_DATA.length} platforms to gather audience, competitive, and cultural intelligence</div>
          </div>

          <div className="platform-grid">
            {PLATFORMS_DATA.map((p, i) => (
              <div key={i} className={`plat-card ${p.status} fade-in`} style={{ animationDelay: `${i * 0.07}s` }}>
                <div className="plat-header">
                  <div className="plat-left">
                    <span style={{ fontSize: '18px' }}>{p.icon}</span>
                    <div className="plat-nm">{p.name}</div>
                  </div>
                  <span className={`plat-status ${SC[p.status]}`}>{SL[p.status]}</span>
                </div>
                <div className="plat-desc">{p.desc}</div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${widths[i]}%` }}></div>
                </div>
                <div className="plat-note">{p.note}</div>
              </div>
            ))}
          </div>

          <div style={{ background: '#fff', borderRadius: '14px', padding: '24px', marginTop: '22px', boxShadow: 'var(--shadow)' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '16px' }}>Insight Buckets Being Populated</div>
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
