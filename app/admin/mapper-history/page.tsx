'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import HistoryControls, { filterByRange, rangeCounts } from '@/components/admin/HistoryControls';

interface Run {
  id:            string;
  filename:      string;
  kind:          string;
  originalBytes: number;
  finalBytes:    number;
  grade:         number;
  ready:         boolean;
  attempts:      number;
  elapsedMs:     number;
  blockers:      number;
  majors:        number;
  minors:        number;
  strategies:    string[];
  createdAt:     string;
}

interface History {
  totals: {
    runs: number; bytesSaved: number; avgGrade: number;
    readyCount: number; blockerCount: number; compressedCount: number;
  };
  byKind:     { kind: string; runs: number; bytesSaved: number }[];
  recentRuns: Run[];
  trend30d:   { day: string; runs: number; bytesSaved: number }[];
}

const KIND_LABEL: Record<string, string> = {
  pdf: '📄 PDF', pptx: '📊 PPTX', xlsx: '📈 XLSX',
  csv: '📋 CSV', image: '🖼 Image', other: '📁 Other',
};

function fmtBytes(n: number): string {
  if (n < 0) n = 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** Mask the middle of a filename so over-shoulder glances don't leak client
 *  names. e.g. Sargam_Detergent_Q4_brief.pdf → Sargam_D…rief.pdf */
function maskFilename(name: string): string {
  if (name.length <= 24) return name;
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot) : '';
  const stem = dot > 0 ? name.slice(0, dot) : name;
  if (stem.length <= 16) return name;
  return `${stem.slice(0, 8)}…${stem.slice(-4)}${ext}`;
}

function gradeColor(g: number): string {
  if (g >= 10) return '#059669';
  if (g >= 8)  return '#65A30D';
  if (g >= 5)  return '#D97706';
  return '#DC2626';
}

export default function MapperHistoryPage() {
  const router = useRouter();
  const [data,    setData]    = useState<History | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState<'all' | 'compressed' | 'ready' | 'blocked'>('all');
  const [range,   setRange]   = useState<'24h' | '7d' | '30d' | '90d' | 'all'>('all');

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.authenticated) { router.replace('/login'); return; }
        if (!d.isAdmin)        { router.replace('/dashboard'); return; }
        return fetch('/api/admin/mapper-history');
      })
      .then(r => r?.ok ? r.json() : null)
      .then((d: History) => { if (d) setData(d); })
      .catch(() => router.replace('/login'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ minHeight: '100vh', background: '#F0F4FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', fontSize: 15 }}>Loading mapper history…</div>;
  if (!data)   return null;

  const maxTrend = Math.max(1, ...data.trend30d.map(d => d.runs));
  // Apply date range first, then the verdict filter
  const rangeFilteredRuns: Run[] = filterByRange(data.recentRuns, range, 'createdAt');
  const visibleRuns = rangeFilteredRuns.filter(r => {
    if (filter === 'all') return true;
    if (filter === 'compressed') return r.originalBytes !== r.finalBytes;
    if (filter === 'ready')      return r.ready;
    if (filter === 'blocked')    return r.blockers > 0;
    return true;
  });
  const counts = rangeCounts(data.recentRuns, 'createdAt');

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
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>Mapper History</span>
          <Link href="/admin/verification-history" style={{ marginLeft: 18, color: '#94A3B8', fontSize: 13, textDecoration: 'none' }}>→ Verification</Link>
          <Link href="/admin/ai-health"           style={{ marginLeft: 10, color: '#94A3B8', fontSize: 13, textDecoration: 'none' }}>→ AI Health</Link>
          <Link href="/admin/audit-log"           style={{ marginLeft: 10, color: '#94A3B8', fontSize: 13, textDecoration: 'none' }}>→ Audit Log</Link>
          <Link href="/admin/agents"              style={{ marginLeft: 10, color: '#A5F3FC', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>★ Agents</Link>
        </div>
        <Link href="/dashboard" style={{ color: '#94A3B8', fontSize: 13, textDecoration: 'none' }}>← Back to app</Link>
      </div>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: '#0F172A', marginBottom: 6 }}>🗜 Data Mapper Council</h1>
        <p style={{ color: '#64748B', fontSize: 14, marginBottom: 24 }}>
          Compression + integrity verdicts for every upload. {data.totals.runs} runs · {fmtBytes(data.totals.bytesSaved)} saved · avg grade {Number(data.totals.avgGrade).toFixed(1)}/10.
        </p>

        {/* Top-line counters */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 28 }}>
          {[
            { label: 'Total runs',       value: data.totals.runs.toString(),           color: '#0F172A' },
            { label: 'Bytes saved',      value: fmtBytes(data.totals.bytesSaved),      color: '#059669' },
            { label: 'Avg grade',        value: `${Number(data.totals.avgGrade).toFixed(1)}/10`, color: gradeColor(Number(data.totals.avgGrade)) },
            { label: 'Ready (10/10)',    value: data.totals.readyCount.toString(),     color: '#059669' },
            { label: 'Compressed',       value: data.totals.compressedCount.toString(), color: '#2563EB' },
            { label: 'Had blockers',     value: data.totals.blockerCount.toString(),   color: data.totals.blockerCount > 0 ? '#DC2626' : '#64748B' },
          ].map(c => (
            <div key={c.label} style={{ background: '#fff', borderRadius: 14, padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.08em' }}>{c.label}</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: c.color, marginTop: 4 }}>{c.value}</div>
            </div>
          ))}
        </div>

        {/* By kind */}
        <div style={{ background: '#fff', borderRadius: 14, padding: '16px 20px', marginBottom: 28, boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
          <h2 style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', marginBottom: 12 }}>Runs by file kind</h2>
          {data.byKind.length === 0 ? (
            <div style={{ fontSize: 12, color: '#94A3B8' }}>No runs recorded yet — upload a file to populate.</div>
          ) : data.byKind.map(k => {
            const max = Math.max(1, ...data.byKind.map(x => x.runs));
            return (
              <div key={k.kind} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 80px 100px', gap: 10, alignItems: 'center', marginBottom: 6, fontSize: 12 }}>
                <span style={{ color: '#475569', fontWeight: 600 }}>{KIND_LABEL[k.kind] || k.kind}</span>
                <div style={{ height: 8, background: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(k.runs / max) * 100}%`, background: 'linear-gradient(90deg,#2563EB,#7C3AED)', borderRadius: 4 }} />
                </div>
                <span style={{ textAlign: 'right', fontWeight: 700, color: '#0F172A' }}>{k.runs} runs</span>
                <span style={{ textAlign: 'right', fontWeight: 600, color: '#059669' }}>{fmtBytes(k.bytesSaved)}</span>
              </div>
            );
          })}
        </div>

        {/* 30-day trend */}
        {data.trend30d.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 14, padding: '16px 20px', marginBottom: 28, boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <h2 style={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>Last 30 days</h2>
              <span style={{ fontSize: 11, color: '#64748B' }}>Daily run count · hover for bytes saved</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 80 }}>
              {data.trend30d.map((d, i) => (
                <div key={i} title={`${d.day}: ${d.runs} run(s), ${fmtBytes(d.bytesSaved)} saved`}
                  style={{
                    flex: 1,
                    height: `${(d.runs / maxTrend) * 100}%`,
                    minHeight: d.runs > 0 ? 2 : 0,
                    background: d.runs > 0 ? 'linear-gradient(180deg,#7C3AED,#2563EB)' : '#E2E8F0',
                    borderRadius: '3px 3px 0 0',
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

        {/* Date range + CSV export */}
        <HistoryControls
          range={range}
          onRange={(r: any) => setRange(r)}
          rows={visibleRuns}
          filename="prism-mapper-history"
          counts={counts}
        />

        {/* Verdict filter + recent runs */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Recent runs</h2>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['all', 'compressed', 'ready', 'blocked'] as const).map(f => {
              const count = f === 'all' ? data.recentRuns.length
                : f === 'compressed' ? data.recentRuns.filter(r => r.originalBytes !== r.finalBytes).length
                : f === 'ready'      ? data.recentRuns.filter(r => r.ready).length
                :                       data.recentRuns.filter(r => r.blockers > 0).length;
              return (
                <button key={f} onClick={() => setFilter(f)}
                  style={{
                    padding: '5px 12px', borderRadius: 14,
                    border: `1.5px solid ${filter === f ? '#2563EB' : '#E2E8F0'}`,
                    background: filter === f ? '#EFF6FF' : '#fff',
                    color: filter === f ? '#1E40AF' : '#475569',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  }}>
                  {f} · {count}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,.04)', overflow: 'hidden' }}>
          {visibleRuns.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>No runs match this filter yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#F8FAFC', textAlign: 'left', color: '#64748B', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  <th style={{ padding: '10px 14px' }}>When</th>
                  <th style={{ padding: '10px 14px' }}>File</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Original → Final</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Grade</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Findings</th>
                  <th style={{ padding: '10px 14px' }}>Strategies</th>
                </tr>
              </thead>
              <tbody>
                {visibleRuns.map(r => {
                  const savedPct = r.originalBytes > 0 ? Math.round((1 - r.finalBytes / r.originalBytes) * 100) : 0;
                  return (
                    <tr key={r.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '10px 14px', color: '#475569', whiteSpace: 'nowrap' }}>{fmtDate(r.createdAt)}</td>
                      <td style={{ padding: '10px 14px', color: '#0F172A', fontWeight: 600 }} title={r.filename}>
                        <span style={{ marginRight: 6 }}>{KIND_LABEL[r.kind] || '📁'}</span>
                        {maskFilename(r.filename)}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: '#475569' }}>
                        {fmtBytes(r.originalBytes)} → {fmtBytes(r.finalBytes)}
                        {savedPct > 0 && <span style={{ marginLeft: 6, color: '#059669', fontWeight: 700 }}>−{savedPct}%</span>}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        <span style={{ color: gradeColor(r.grade), fontWeight: 800 }}>{r.grade}/10</span>
                        {r.ready && <span style={{ marginLeft: 4 }}>✓</span>}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: '#64748B' }}>
                        {r.blockers > 0 && <span style={{ color: '#DC2626', fontWeight: 700 }}>{r.blockers}🛑 </span>}
                        {r.majors   > 0 && <span style={{ color: '#D97706', fontWeight: 700 }}>{r.majors}⚠ </span>}
                        {r.minors   > 0 && <span style={{ color: '#94A3B8' }}>{r.minors}·</span>}
                        {r.blockers + r.majors + r.minors === 0 && <span style={{ color: '#059669' }}>clean</span>}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#64748B', fontSize: 11 }}>
                        {r.strategies.length ? r.strategies.join(', ') : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ marginTop: 16, fontSize: 11, color: '#94A3B8', textAlign: 'center' }}>
          Showing last {data.recentRuns.length} runs. Older entries remain in the database.
        </div>
      </main>
    </div>
  );
}
