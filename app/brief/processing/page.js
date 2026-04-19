'use client';
import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import { useRouter } from 'next/navigation';
import { PLATFORMS_DATA } from '@/lib/data';

const SL = { complete: '✓ Complete', fetching: '⟳ Fetching', connecting: '⟳ Connecting', queued: '○ Queued' };
const SC = { complete: 's-complete', fetching: 's-fetching', connecting: 's-connecting', queued: 's-queued' };

export default function Processing() {
  const router = useRouter();
  const [widths, setWidths] = useState(PLATFORMS_DATA.map(p => p.pct));

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
    return () => { clearInterval(t2); clearInterval(t4); };
  }, []);

  return (
    <div className="screen fade-in">
      <Navbar />
      <div className="proc-hero">
        <div className="proc-eyebrow">Brief Submitted Successfully</div>
        <div className="proc-title">Mining Insights for Nescafé Premium</div>
        <div className="proc-sub">FMCG — Beverages · 25–44 · Metro India · New Communication</div>
        <div className="eta-pill">
          ⏳ Estimated ready in <strong>&nbsp;~16 hours</strong>&nbsp;·&nbsp;4 of 7 sources complete
        </div>
      </div>
      <div className="main">
        <div className="container">
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '3px' }}>Platform Data Sources</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Connecting to 7 platforms to gather audience, competitive, and cultural intelligence</div>
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
              <div className="bucket-prog-card">
                <div className="bpc-icon">📝</div><div className="bpc-name">Content</div><div className="bpc-note">3 insights ready</div>
                <div className="progress-bar"><div className="progress-fill" style={{ width: '45%', background: 'linear-gradient(90deg,#2563EB,#60A5FA)' }}></div></div>
              </div>
              <div className="bucket-prog-card">
                <div className="bpc-icon">🛒</div><div className="bpc-name">Commerce</div><div className="bpc-note">2 insights ready</div>
                <div className="progress-bar"><div className="progress-fill" style={{ width: '28%', background: 'linear-gradient(90deg,#059669,#34D399)' }}></div></div>
              </div>
              <div className="bucket-prog-card">
                <div className="bpc-icon">📢</div><div className="bpc-name">Communication</div><div className="bpc-note">4 insights ready</div>
                <div className="progress-bar"><div className="progress-fill" style={{ width: '60%', background: 'linear-gradient(90deg,#7C3AED,#A78BFA)' }}></div></div>
              </div>
              <div className="bucket-prog-card">
                <div className="bpc-icon">🌍</div><div className="bpc-name">Culture</div><div className="bpc-note">1 insight ready</div>
                <div className="progress-bar"><div className="progress-fill" style={{ width: '15%', background: 'linear-gradient(90deg,#D97706,#FBBF24)' }}></div></div>
              </div>
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
