'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface RecentItem {
  filename?: string; kind?: string; brand?: string | null; mode?: string;
  model?: string; rate?: number | null; quarantined?: boolean;
  grade?: number; ready?: boolean;
  blockers?: number; majors?: number;
  at?: string;
}

interface Council {
  id?: string;
  name: string;
  stage: string;
  emoji: string;
  agents: number;
  agentNames: string[];
  description?: string;
  lifetime: Record<string, any>;
  recent: RecentItem[];
  link: string | null;
  grade?: number | null;
  autoRecover?: { retry?: boolean; fallback?: boolean; quarantine?: boolean; alternateRoute?: boolean };
}

interface Overview {
  systemGrade: number;
  councils: Council[];
}

function fmtBytes(n: number): string {
  if (!n || n < 1024) return `${n || 0} B`;
  if (n < 1e6) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1e9) return `${(n / 1e6).toFixed(1)} MB`;
  return `${(n / 1e9).toFixed(2)} GB`;
}

function fmtDate(d?: string): string {
  if (!d) return '—';
  return new Date(d).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

function gradeColor(g: number): string {
  if (g >= 9)  return '#059669';
  if (g >= 7)  return '#65A30D';
  if (g >= 5)  return '#D97706';
  return '#DC2626';
}

export default function AgentsOverviewPage() {
  const router = useRouter();
  const [data,    setData]    = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.authenticated) { router.replace('/login'); return; }
        if (!d.isAdmin)        { router.replace('/dashboard'); return; }
        return fetch('/api/admin/agents-overview');
      })
      .then(r => r?.ok ? r.json() : null)
      .then((d: Overview) => { if (d) setData(d); })
      .catch(() => router.replace('/login'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ minHeight: '100vh', background: '#F0F4FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', fontSize: 15 }}>Loading agents overview…</div>;
  if (!data)   return null;

  const totalAgents = data.councils.reduce((sum, c) => sum + c.agents, 0);

  return (
    <div style={{ minHeight: '100vh', background: '#F0F4FF', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#0F172A,#1E1B4B)', padding: '20px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link href="/dashboard" style={{ textDecoration: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#6366F1,#7C3AED)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 14 }}>P</div>
              <span style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>PRISM</span>
            </div>
          </Link>
          <span style={{ color: 'rgba(255,255,255,.3)', fontSize: 14 }}>/</span>
          <Link href="/admin/pages" style={{ color: '#C7D2FE', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>Admin</Link>
          <span style={{ color: 'rgba(255,255,255,.3)', fontSize: 14 }}>/</span>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>Agents</span>
        </div>
        <Link href="/dashboard" style={{ color: '#94A3B8', fontSize: 13, textDecoration: 'none' }}>← Back to app</Link>
      </div>

      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px' }}>
        {/* ── Hero: system grade ──────────────────────────────── */}
        <div style={{ background: 'linear-gradient(135deg,#fff,#F8FAFC)', borderRadius: 18, padding: '28px 32px', marginBottom: 28, boxShadow: '0 4px 12px rgba(0,0,0,.04)', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 32, alignItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 4 }}>System Grade</div>
            <div style={{ fontSize: 64, fontWeight: 900, color: gradeColor(data.systemGrade), lineHeight: 1 }}>{data.systemGrade.toFixed(1)}</div>
            <div style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>out of 10</div>
          </div>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 900, color: '#0F172A', marginBottom: 6 }}>🏛 The PRISM Agent Network</h1>
            <p style={{ color: '#64748B', fontSize: 14, lineHeight: 1.6 }}>
              {data.councils.length} councils · {totalAgents} agents working in concert.
              Average of every council's most-recent verdict gives the system grade.
              Click any council to drill into its own dashboard.
            </p>
          </div>
        </div>

        {/* ── Council cards (2x2 grid) ────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(540px, 1fr))', gap: 18, marginBottom: 28 }}>
          {data.councils.map(c => (
            <CouncilCard key={c.name} council={c} />
          ))}
        </div>

        {/* ── Lifecycle diagram (auto-built from registry) ────── */}
        <div style={{ background: '#fff', borderRadius: 14, padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,.04)', marginBottom: 28 }}>
          <h2 style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', marginBottom: 14 }}>Brief lifecycle — who handles what</h2>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${data.councils.length}, 1fr)`, gap: 12 }}>
            {data.councils.map((c, i) => (
              <div key={c.name} style={{ position: 'relative', background: '#F8FAFC', borderRadius: 10, padding: '12px 14px' }}>
                {i < data.councils.length - 1 && <span style={{ position: 'absolute', right: -8, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', fontSize: 16, fontWeight: 900 }}>→</span>}
                <div style={{ fontSize: 10, fontWeight: 800, color: '#7C3AED', letterSpacing: '.08em', marginBottom: 4 }}>{c.stage.toUpperCase()}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>{c.emoji} {c.name}</div>
                <div style={{ fontSize: 11, color: '#64748B', lineHeight: 1.4 }}>{c.description || `${c.agents} agent(s)`}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ fontSize: 11, color: '#94A3B8', textAlign: 'center' }}>
          Live snapshot · refreshes on page load · all counts from last 24h unless noted
        </div>
      </main>
    </div>
  );
}

function CouncilCard({ council: c }: { council: Council }) {
  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: '18px 22px', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#0F172A' }}>
            <span style={{ marginRight: 8 }}>{c.emoji}</span>{c.name}
          </div>
          <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.08em', marginTop: 2 }}>
            {c.agents} agents · {c.stage} stage
          </div>
        </div>
        {c.link && (
          <Link href={c.link} style={{ fontSize: 11, fontWeight: 700, color: '#2563EB', textDecoration: 'none', padding: '4px 10px', border: '1px solid #DBEAFE', borderRadius: 12 }}>
            Open dashboard →
          </Link>
        )}
      </div>

      {/* Agent chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
        {c.agentNames.map(a => (
          <span key={a} style={{ fontSize: 10.5, padding: '2px 8px', background: '#F1F5F9', color: '#475569', borderRadius: 10, fontWeight: 600 }}>{a}</span>
        ))}
      </div>

      {/* Auto-recovery badges (proactive-solve rule) */}
      {c.autoRecover && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
          {c.autoRecover.retry          && <span style={{ fontSize: 9.5, padding: '2px 7px', background: '#ECFDF5', color: '#065F46', borderRadius: 10, fontWeight: 700, letterSpacing: '.04em' }}>🔁 auto-retry</span>}
          {c.autoRecover.fallback       && <span style={{ fontSize: 9.5, padding: '2px 7px', background: '#ECFDF5', color: '#065F46', borderRadius: 10, fontWeight: 700, letterSpacing: '.04em' }}>↩ auto-fallback</span>}
          {c.autoRecover.quarantine     && <span style={{ fontSize: 9.5, padding: '2px 7px', background: '#ECFDF5', color: '#065F46', borderRadius: 10, fontWeight: 700, letterSpacing: '.04em' }}>🚧 auto-quarantine</span>}
          {c.autoRecover.alternateRoute && <span style={{ fontSize: 9.5, padding: '2px 7px', background: '#ECFDF5', color: '#065F46', borderRadius: 10, fontWeight: 700, letterSpacing: '.04em' }}>🔀 alternate-route</span>}
        </div>
      )}

      {/* Lifetime stats */}
      <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>Lifetime</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', fontSize: 12 }}>
          {Object.entries(c.lifetime).map(([k, v]) => (
            <div key={k}>
              <span style={{ color: '#64748B', marginRight: 4 }}>{k.replace(/([A-Z])/g, ' $1').toLowerCase()}:</span>
              <span style={{ color: '#0F172A', fontWeight: 700 }}>
                {typeof v === 'number' && k.toLowerCase().includes('byte') ? fmtBytes(v) : String(v ?? '—')}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>Latest activity</div>
        {c.recent.length === 0 ? (
          <div style={{ fontSize: 11, color: '#94A3B8', fontStyle: 'italic', padding: '6px 0' }}>No activity yet</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {c.recent.slice(0, 5).map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '4px 0', borderBottom: i < c.recent.length - 1 ? '1px solid #F1F5F9' : 'none', fontSize: 11.5 }}>
                <span style={{ color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {r.filename ? `${r.filename.slice(0, 28)}${r.filename.length > 28 ? '…' : ''}` :
                   r.brand    ? `${r.brand} · ${r.mode || '—'}` :
                   r.model    ? r.model : '—'}
                </span>
                <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11 }}>
                  {typeof r.grade === 'number' && <span style={{ color: gradeColor(r.grade), fontWeight: 800 }}>{r.grade}/10</span>}
                  {typeof r.rate === 'number' && <span style={{ color: r.rate >= 0.95 ? '#059669' : '#D97706', fontWeight: 700 }}>{(r.rate * 100).toFixed(0)}%</span>}
                  {r.quarantined && <span style={{ color: '#DC2626', fontWeight: 700 }}>🛑 OUT</span>}
                  {typeof r.blockers === 'number' && r.blockers > 0 && <span style={{ color: '#DC2626', fontWeight: 700 }}>{r.blockers}🛑</span>}
                  {typeof r.majors   === 'number' && r.majors   > 0 && <span style={{ color: '#D97706', fontWeight: 700 }}>{r.majors}⚠</span>}
                  <span style={{ color: '#94A3B8' }}>{fmtDate(r.at)}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
