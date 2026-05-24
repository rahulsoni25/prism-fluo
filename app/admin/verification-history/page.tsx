'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface RecentRun {
  analysisId:      string;
  brand:           string;
  category:        string | null;
  generatedAt:     string;
  mode:            string;
  totalCards:      number;
  cardsWithIssues: number;
  findings:        number;
  blockers:        number;
  majors:          number;
  minors:          number;
  verdict:         'block' | 'review' | 'clean';
}

interface History {
  totals:     { analyses: number; findings: number; blockers: number; majors: number; minors: number };
  byAgent:    Record<string, number>;
  bySeverity: { blocker?: number; major?: number; minor?: number };
  bySection:  Record<string, number>;
  recentRuns: RecentRun[];
  trend30d:   { day: string; findings: number; runs: number }[];
  note?:      string;
}

const SEV_COLOR: Record<string, string> = { block: '#DC2626', review: '#D97706', clean: '#059669' };
const SEV_BG:    Record<string, string> = { block: '#FEF2F2', review: '#FFFBEB', clean: '#ECFDF5' };

const AGENT_LABEL: Record<string, string> = {
  proofreader:       '📝 ProofReader',
  'stat-checker':    '🔢 StatChecker',
  'fact-analyzer':   '🔍 FactAnalyzer',
  'math-integrity':  '🧮 MathIntegrity',
  coverage:          '📋 Coverage',
};

function fmt(d: string) {
  return new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function VerificationHistoryPage() {
  const router = useRouter();
  const [data,    setData]    = useState<History | null>(null);
  const [loading, setLoading] = useState(true);
  const [me,      setMe]      = useState<any>(null);
  const [filter,  setFilter]  = useState<'all' | 'block' | 'review' | 'clean'>('all');

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.authenticated) { router.replace('/login'); return; }
        if (!d.isAdmin)        { router.replace('/dashboard'); return; }
        setMe(d);
        return fetch('/api/admin/verification-history');
      })
      .then(r => r?.ok ? r.json() : null)
      .then((d: History) => { if (d) setData(d); })
      .catch(() => router.replace('/login'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ minHeight: '100vh', background: '#F0F4FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', fontSize: 15 }}>Loading verification history…</div>;
  if (!data)   return null;

  const maxTrend = Math.max(1, ...data.trend30d.map(d => d.findings));
  const visibleRuns = filter === 'all' ? data.recentRuns : data.recentRuns.filter(r => r.verdict === filter);

  return (
    <div style={{ minHeight: '100vh', background: '#F0F4FF', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* ── Admin header ── */}
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
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>Verification History</span>
          <Link href="/admin/users"      style={{ marginLeft: 18, color: '#94A3B8', fontSize: 13, textDecoration: 'none' }}>→ Users</Link>
          <Link href="/admin/audit-log"  style={{ marginLeft: 10, color: '#94A3B8', fontSize: 13, textDecoration: 'none' }}>→ Audit Log</Link>
          <Link href="/admin/ai-health"  style={{ marginLeft: 10, color: '#94A3B8', fontSize: 13, textDecoration: 'none' }}>→ AI Health</Link>
          <Link href="/admin/mapper-history" style={{ marginLeft: 10, color: '#94A3B8', fontSize: 13, textDecoration: 'none' }}>→ Mapper</Link>
          <Link href="/admin/agents" style={{ marginLeft: 10, color: '#A5F3FC', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>★ Agents</Link>
        </div>
        <Link href="/dashboard" style={{ color: '#94A3B8', fontSize: 13, textDecoration: 'none' }}>← Back to app</Link>
      </div>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: '#0F172A', marginBottom: 6 }}>📊 Verification History</h1>
        <p style={{ color: '#64748B', fontSize: 14, marginBottom: 24 }}>
          Activity log for the 5-agent verification council. {data.note ? <em style={{ color: '#94A3B8' }}>{data.note}</em> : `${data.totals.analyses} analyses verified · ${data.totals.findings} confirmed findings to date.`}
        </p>

        {/* ── Top-line counters ───────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 28 }}>
          {[
            { label: 'Verified analyses', value: data.totals.analyses,  color: '#0F172A' },
            { label: 'Total findings',    value: data.totals.findings,  color: '#0F172A' },
            { label: 'Blockers',          value: data.totals.blockers,  color: SEV_COLOR.block },
            { label: 'Majors',            value: data.totals.majors,    color: SEV_COLOR.review },
            { label: 'Minors',            value: data.totals.minors,    color: '#64748B' },
          ].map(c => (
            <div key={c.label} style={{ background: '#fff', borderRadius: 14, padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.08em' }}>{c.label}</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: c.color, marginTop: 4 }}>{c.value}</div>
            </div>
          ))}
        </div>

        {/* ── Agent breakdown + Section breakdown ──────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16, marginBottom: 28 }}>
          {/* Agent breakdown */}
          <div style={{ background: '#fff', borderRadius: 14, padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
            <h2 style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', marginBottom: 12 }}>Findings by agent</h2>
            {Object.entries(data.byAgent).map(([agent, count]) => {
              const max = Math.max(1, ...Object.values(data.byAgent));
              const pct = (count / max) * 100;
              return (
                <div key={agent} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 40px', gap: 10, alignItems: 'center', marginBottom: 6, fontSize: 12 }}>
                  <span style={{ color: '#475569', fontWeight: 600 }}>{AGENT_LABEL[agent] || agent}</span>
                  <div style={{ height: 8, background: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,#2563EB,#7C3AED)', borderRadius: 4 }} />
                  </div>
                  <span style={{ textAlign: 'right', fontWeight: 700, color: '#0F172A' }}>{count}</span>
                </div>
              );
            })}
          </div>

          {/* Coverage section breakdown */}
          <div style={{ background: '#fff', borderRadius: 14, padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
            <h2 style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', marginBottom: 4 }}>Coverage gaps by section</h2>
            <p style={{ fontSize: 11, color: '#94A3B8', marginBottom: 12 }}>Which methodology sections most frequently aren't addressed.</p>
            {Object.keys(data.bySection).length === 0 ? (
              <div style={{ fontSize: 12, color: '#059669', fontWeight: 600 }}>✓ No coverage gaps recorded yet</div>
            ) : (
              Object.entries(data.bySection).sort((a, b) => b[1] - a[1]).map(([sec, count]) => {
                const max = Math.max(1, ...Object.values(data.bySection));
                return (
                  <div key={sec} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 40px', gap: 10, alignItems: 'center', marginBottom: 6, fontSize: 12 }}>
                    <span style={{ fontWeight: 800, color: '#7C3AED' }}>Sec {sec}</span>
                    <div style={{ height: 8, background: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(count / max) * 100}%`, background: '#D97706', borderRadius: 4 }} />
                    </div>
                    <span style={{ textAlign: 'right', fontWeight: 700, color: '#0F172A' }}>{count}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── 30-day trend sparkline ─────────────────────────────── */}
        {data.trend30d.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 14, padding: '16px 20px', marginBottom: 28, boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <h2 style={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>Last 30 days</h2>
              <span style={{ fontSize: 11, color: '#64748B' }}>Daily findings · grey bars = runs</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 80 }}>
              {data.trend30d.map((d, i) => (
                <div key={i} title={`${d.day}: ${d.findings} finding(s) across ${d.runs} run(s)`}
                  style={{
                    flex: 1,
                    height: `${(d.findings / maxTrend) * 100}%`,
                    minHeight: d.runs > 0 ? 2 : 0,
                    background: d.findings > 0 ? 'linear-gradient(180deg,#7C3AED,#2563EB)' : '#E2E8F0',
                    borderRadius: '3px 3px 0 0',
                    transition: 'opacity .15s',
                  }}
                />
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: '#94A3B8' }}>
              <span>{data.trend30d[0]?.day || '—'}</span>
              <span>{data.trend30d[data.trend30d.length - 1]?.day || '—'}</span>
            </div>
          </div>
        )}

        {/* ── Verdict filter ─────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Recent runs</h2>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['all', 'block', 'review', 'clean'] as const).map(f => {
              const count = f === 'all' ? data.recentRuns.length : data.recentRuns.filter(r => r.verdict === f).length;
              return (
                <button key={f} onClick={() => setFilter(f)}
                  style={{
                    padding: '5px 12px', borderRadius: 14,
                    border: `1.5px solid ${filter === f ? (SEV_COLOR[f] || '#2563EB') : '#E2E8F0'}`,
                    background: filter === f ? (SEV_BG[f] || '#EFF6FF') : '#fff',
                    color:      filter === f ? (SEV_COLOR[f] || '#1D4ED8') : '#475569',
                    fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize',
                  }}>
                  {f} · {count}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Recent runs table ──────────────────────────────────── */}
        <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
          {visibleRuns.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#94A3B8' }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>📋</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {data.recentRuns.length === 0 ? 'No verifications yet' : 'No runs match this filter'}
              </div>
              {data.recentRuns.length === 0 && (
                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>
                  Verifications fire automatically when analyses are saved. Open any insights page to start.
                </div>
              )}
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '170px 1.6fr 110px 100px 90px 90px 1fr', gap: 8, padding: '10px 18px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: 10, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.08em' }}>
                <span>When</span><span>Brand</span><span>Verdict</span><span>Cards</span><span>With issues</span><span>Findings</span><span>Severity</span>
              </div>
              {visibleRuns.map((r, idx) => (
                <Link key={r.analysisId + idx} href={`/insights?id=${r.analysisId}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div style={{
                    display: 'grid', gridTemplateColumns: '170px 1.6fr 110px 100px 90px 90px 1fr', gap: 8,
                    padding: '12px 18px', alignItems: 'center',
                    borderBottom: idx < visibleRuns.length - 1 ? '1px solid #F1F5F9' : 'none',
                    fontSize: 12, color: '#334155', transition: 'background .15s',
                    cursor: 'pointer',
                  }} onMouseEnter={e => (e.currentTarget.style.background = '#FAFBFF')} onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                    <span style={{ color: '#64748B', fontSize: 11 }}>{fmt(r.generatedAt)}</span>
                    <span>
                      <div style={{ fontWeight: 700, color: '#0F172A' }}>{r.brand}</div>
                      {r.category && <div style={{ fontSize: 10.5, color: '#94A3B8' }}>{r.category}</div>}
                    </span>
                    <span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: SEV_COLOR[r.verdict], background: SEV_BG[r.verdict], padding: '2px 8px', borderRadius: 10, textTransform: 'uppercase' }}>
                        {r.verdict}
                      </span>
                    </span>
                    <span style={{ textAlign: 'center' }}>{r.totalCards}</span>
                    <span style={{ textAlign: 'center', color: r.cardsWithIssues > 0 ? '#D97706' : '#059669' }}>{r.cardsWithIssues}</span>
                    <span style={{ textAlign: 'center', fontWeight: 700 }}>{r.findings}</span>
                    <span style={{ fontSize: 10.5, color: '#64748B' }}>
                      {r.blockers > 0 && <span style={{ color: SEV_COLOR.block, fontWeight: 700 }}>{r.blockers} blocker </span>}
                      {r.majors > 0   && <span style={{ color: SEV_COLOR.review, fontWeight: 700 }}>{r.majors} major </span>}
                      {r.minors > 0   && <span>{r.minors} minor</span>}
                      {r.blockers + r.majors + r.minors === 0 && <span style={{ color: SEV_COLOR.clean }}>✓ all clean</span>}
                    </span>
                  </div>
                </Link>
              ))}
            </>
          )}
        </div>

        <p style={{ marginTop: 18, fontSize: 11, color: '#94A3B8', textAlign: 'center' }}>
          Click any row to open the analysis. Mode shown next to the agent list — rules-only is the default, +llm fires when manually enabled.
        </p>
      </main>
    </div>
  );
}
