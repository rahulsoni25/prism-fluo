'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Task {
  id: string;
  title: string;
  emoji?: string;
  category: 'hidden-feature' | 'decision' | 'deferred-improvement' | 'technical-debt';
  criticality: 'high' | 'medium' | 'low';
  dateDiscussed: string;
  context: string;
  status: 'open' | 'parked' | 'in-progress' | 'awaiting-confirmation' | 'resolved';
  effort?: string;
  whereInCode?: string;
  blockers?: string[];
  doc?: string;
  resolvedDate?: string;
  resolution?: string;
}

interface Stats {
  total: number;
  byCriticality: { high: number; medium: number; low: number };
  byStatus: Record<string, number>;
  byCategory: Record<string, number>;
}

interface Payload {
  tasks: Task[];
  stats: Stats;
}

const CRIT = {
  high:   { color: '#DC2626', bg: '#FEF2F2', icon: '🔴', label: 'HIGH' },
  medium: { color: '#D97706', bg: '#FFFBEB', icon: '🟡', label: 'MEDIUM' },
  low:    { color: '#059669', bg: '#ECFDF5', icon: '🟢', label: 'LOW' },
} as const;

const CATEGORY_LABEL: Record<string, { label: string; color: string }> = {
  'hidden-feature':       { label: 'Hidden feature',     color: '#7C3AED' },
  'decision':             { label: 'Decision',           color: '#2563EB' },
  'deferred-improvement': { label: 'Deferred',           color: '#64748B' },
  'technical-debt':       { label: 'Tech debt',          color: '#0891B2' },
};

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  'open':                  { label: 'Open',                  color: '#DC2626' },
  'parked':                { label: 'Parked',                color: '#64748B' },
  'in-progress':           { label: 'In progress',           color: '#2563EB' },
  'awaiting-confirmation': { label: 'Awaiting confirmation', color: '#D97706' },
  'resolved':              { label: '✓ Resolved',            color: '#059669' },
};

function fmtDate(d: string): string {
  if (!d || d === 'pre-session') return 'Earlier';
  try {
    return new Date(d).toLocaleDateString(undefined, { dateStyle: 'medium' });
  } catch { return d; }
}

export default function PendingTasksPage() {
  const router = useRouter();
  const [data,    setData]    = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [critFilter, setCritFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [catFilter, setCatFilter] = useState<'all' | Task['category']>('all');

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.authenticated) { router.replace('/login'); return; }
        if (!d.isAdmin)        { router.replace('/dashboard'); return; }
        return fetch('/api/admin/pending-tasks');
      })
      .then(r => r?.ok ? r.json() : null)
      .then((d: Payload) => { if (d) setData(d); })
      .catch(() => router.replace('/login'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ minHeight: '100vh', background: '#F0F4FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', fontSize: 15 }}>Loading pending tasks…</div>;
  if (!data)   return null;

  const visible = data.tasks.filter(t => {
    if (critFilter !== 'all' && t.criticality !== critFilter) return false;
    if (catFilter  !== 'all' && t.category    !== catFilter)  return false;
    return true;
  });

  function toggle(id: string) {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpanded(next);
  }

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
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>Pending Tasks</span>
          <Link href="/admin/agents" style={{ marginLeft: 18, color: '#A5F3FC', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>★ Agents</Link>
        </div>
        <Link href="/dashboard" style={{ color: '#94A3B8', fontSize: 13, textDecoration: 'none' }}>← Back to app</Link>
      </div>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: '#0F172A', marginBottom: 6 }}>📋 Pending Tasks & Decisions</h1>
        <p style={{ color: '#64748B', fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
          Every parked decision, hidden feature, awaiting-confirmation proposal, and deferred improvement —
          single source of truth so nothing slips. <strong>{data.stats.total} total · {data.stats.byCriticality.high} high · {data.stats.byCriticality.medium} medium · {data.stats.byCriticality.low} low</strong>.
        </p>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'High criticality',    value: data.stats.byCriticality.high.toString(),    color: CRIT.high.color },
            { label: 'Medium criticality',  value: data.stats.byCriticality.medium.toString(),  color: CRIT.medium.color },
            { label: 'Low criticality',     value: data.stats.byCriticality.low.toString(),     color: CRIT.low.color },
            { label: 'Open',                value: (data.stats.byStatus.open ?? 0).toString(),  color: '#DC2626' },
            { label: 'Awaiting confirmation', value: (data.stats.byStatus['awaiting-confirmation'] ?? 0).toString(), color: '#D97706' },
            { label: 'Parked',              value: (data.stats.byStatus.parked ?? 0).toString(), color: '#64748B' },
            { label: 'Resolved',            value: (data.stats.byStatus.resolved ?? 0).toString(), color: '#059669' },
          ].map(c => (
            <div key={c.label} style={{ background: '#fff', borderRadius: 14, padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.08em' }}>{c.label}</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: c.color, marginTop: 4 }}>{c.value}</div>
            </div>
          ))}
        </div>

        {/* Filter bar */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B', marginRight: 6, textTransform: 'uppercase', letterSpacing: '.08em' }}>Criticality</span>
          {(['all', 'high', 'medium', 'low'] as const).map(c => (
            <button key={c} onClick={() => setCritFilter(c)} style={{
              padding: '5px 11px', borderRadius: 14,
              border: `1.5px solid ${critFilter === c ? '#2563EB' : '#E2E8F0'}`,
              background: critFilter === c ? '#EFF6FF' : '#fff',
              color: critFilter === c ? '#1E40AF' : '#475569',
              fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
            }}>{c}</button>
          ))}
          <span style={{ width: 12 }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B', marginRight: 6, textTransform: 'uppercase', letterSpacing: '.08em' }}>Category</span>
          {(['all', 'hidden-feature', 'decision', 'deferred-improvement', 'technical-debt'] as const).map(c => (
            <button key={c} onClick={() => setCatFilter(c)} style={{
              padding: '5px 11px', borderRadius: 14,
              border: `1.5px solid ${catFilter === c ? '#2563EB' : '#E2E8F0'}`,
              background: catFilter === c ? '#EFF6FF' : '#fff',
              color: catFilter === c ? '#1E40AF' : '#475569',
              fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
            }}>{c === 'all' ? 'all' : CATEGORY_LABEL[c]?.label || c}</button>
          ))}
        </div>

        {/* Task list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visible.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 14, padding: 32, textAlign: 'center', color: '#94A3B8' }}>No tasks match the current filters.</div>
          ) : visible.map(t => {
            const crit = CRIT[t.criticality];
            const cat  = CATEGORY_LABEL[t.category];
            const stat = STATUS_LABEL[t.status];
            const isOpen = expanded.has(t.id);
            const isResolved = t.status === 'resolved';
            return (
              <div key={t.id} style={{
                background: isResolved ? '#F8FAFC' : '#fff',
                opacity: isResolved ? 0.7 : 1,
                borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,.04)',
                borderLeft: `4px solid ${isResolved ? '#059669' : crit.color}`,
                overflow: 'hidden',
              }}>
                {/* Collapsed row */}
                <button onClick={() => toggle(t.id)} style={{
                  width: '100%', padding: '16px 20px', background: 'transparent', border: 'none',
                  textAlign: 'left', cursor: 'pointer', display: 'grid',
                  gridTemplateColumns: '1fr auto auto auto auto', gap: 14, alignItems: 'center',
                  fontFamily: 'inherit',
                }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 3 }}>
                      <span style={{ marginRight: 8 }}>{t.emoji || '•'}</span>{t.title}
                    </div>
                    <div style={{ fontSize: 11.5, color: '#64748B', lineHeight: 1.4 }}>
                      {t.context.length > 140 && !isOpen ? `${t.context.slice(0, 138)}…` : t.context}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 800, letterSpacing: '.06em',
                    color: crit.color, background: crit.bg,
                    padding: '3px 8px', borderRadius: 10,
                  }}>{crit.icon} {crit.label}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: cat?.color || '#64748B',
                    background: '#F8FAFC', padding: '3px 8px', borderRadius: 10,
                  }}>{cat?.label || t.category}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: stat?.color || '#64748B',
                    background: '#F8FAFC', padding: '3px 8px', borderRadius: 10,
                  }}>{stat?.label || t.status}</span>
                  <span style={{ fontSize: 11, color: '#94A3B8', whiteSpace: 'nowrap', minWidth: 90 }}>
                    {fmtDate(t.dateDiscussed)}
                  </span>
                </button>

                {/* Expanded body */}
                {isOpen && (
                  <div style={{ padding: '0 20px 18px 20px', borderTop: '1px solid #F1F5F9' }}>
                    {t.resolution && (
                      <div style={{
                        marginTop: 14, padding: '12px 14px',
                        background: '#ECFDF5', border: '1px solid #A7F3D0',
                        borderRadius: 8, fontSize: 12, color: '#065F46', lineHeight: 1.5,
                      }}>
                        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 4, color: '#047857' }}>
                          ✓ Resolved {t.resolvedDate ? `· ${fmtDate(t.resolvedDate)}` : ''}
                        </div>
                        {t.resolution}
                      </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 14px', fontSize: 12, color: '#475569', marginTop: 14 }}>
                      {t.effort && (<>
                        <span style={{ color: '#94A3B8', fontWeight: 600 }}>Effort:</span>
                        <span style={{ color: '#0F172A', fontWeight: 600 }}>{t.effort}</span>
                      </>)}
                      {t.whereInCode && (<>
                        <span style={{ color: '#94A3B8', fontWeight: 600 }}>Where in code:</span>
                        <code style={{ fontFamily: "'SF Mono', Menlo, Consolas, monospace", fontSize: 11, color: '#475569', background: '#F1F5F9', padding: '2px 6px', borderRadius: 4 }}>{t.whereInCode}</code>
                      </>)}
                      {t.blockers && t.blockers.length > 0 && (<>
                        <span style={{ color: '#94A3B8', fontWeight: 600, alignSelf: 'start' }}>Blockers:</span>
                        <ul style={{ margin: 0, paddingLeft: 18, color: '#475569', fontSize: 12, lineHeight: 1.6 }}>
                          {t.blockers.map((b, i) => <li key={i}>{b}</li>)}
                        </ul>
                      </>)}
                      {t.doc && (<>
                        <span style={{ color: '#94A3B8', fontWeight: 600 }}>Doc:</span>
                        <code style={{ fontFamily: "'SF Mono', Menlo, Consolas, monospace", fontSize: 11, color: '#475569' }}>{t.doc}</code>
                      </>)}
                      <span style={{ color: '#94A3B8', fontWeight: 600 }}>Task ID:</span>
                      <code style={{ fontFamily: "'SF Mono', Menlo, Consolas, monospace", fontSize: 11, color: '#94A3B8' }}>{t.id}</code>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 24, fontSize: 11, color: '#94A3B8', textAlign: 'center', lineHeight: 1.6 }}>
          Source of truth: <code style={{ fontFamily: "'SF Mono', Menlo, monospace" }}>lib/admin/pending-tasks-data.ts</code><br />
          To add a new task: append a row there + mirror in <code>docs/HIDDEN-FEATURES.md</code> or <code>docs/PENDING-DECISIONS.md</code><br />
          Auto-reminder rule lives in <code>AGENTS.md</code> — future Claude sessions surface relevant items proactively
        </div>
      </main>
    </div>
  );
}
