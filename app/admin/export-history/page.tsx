'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import HistoryControls, { filterByRange, rangeCounts } from '@/components/admin/HistoryControls';

interface Run {
  id: string;
  analysisId: string | null;
  format: 'pdf' | 'xlsx';
  action: 'allow' | 'ask' | 'block';
  confidence: number | null;
  bytes: number;
  inspectorBlockers: number;
  inspectorMajors: number;
  contentBlockers: number;
  contentMajors: number;
  reasoning: string;
  elapsedMs: number;
  createdAt: string;
}

interface History {
  totals: { runs: number; allowed: number; ask: number; blocked: number; avgConfidence: number; totalBytes: number };
  byFormat: { format: string; runs: number; avgConfidence: number }[];
  recentRuns: Run[];
  trend30d: { day: string; runs: number; blocked: number }[];
}

const ACTION_COLOR = { allow: '#059669', ask: '#D97706', block: '#DC2626' } as const;
const ACTION_BG    = { allow: '#ECFDF5', ask: '#FFFBEB', block: '#FEF2F2' } as const;
const ACTION_ICON  = { allow: '✓', ask: '?', block: '🛑' } as const;

function fmtBytes(n: number) {
  if (!n || n < 1024) return `${n || 0} B`;
  if (n < 1e6) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1e9) return `${(n / 1e6).toFixed(1)} MB`;
  return `${(n / 1e9).toFixed(2)} GB`;
}
function fmtDate(d: string) {
  return new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function ExportHistoryPage() {
  const router = useRouter();
  const [data,    setData]    = useState<History | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState<'all' | 'allow' | 'ask' | 'block'>('all');
  const [range,   setRange]   = useState<'24h' | '7d' | '30d' | '90d' | 'all'>('all');

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.authenticated) { router.replace('/login'); return; }
        if (!d.isAdmin)        { router.replace('/dashboard'); return; }
        return fetch('/api/admin/export-history');
      })
      .then(r => r?.ok ? r.json() : null)
      .then((d: History) => { if (d) setData(d); })
      .catch(() => router.replace('/login'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ minHeight: '100vh', background: '#F0F4FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', fontSize: 15 }}>Loading export history…</div>;
  if (!data)   return null;

  const rangeFiltered: Run[] = filterByRange(data.recentRuns, range, 'createdAt');
  const visible = filter === 'all' ? rangeFiltered : rangeFiltered.filter(r => r.action === filter);
  const maxTrend = Math.max(1, ...data.trend30d.map(d => d.runs));
  const counts = rangeCounts(data.recentRuns, 'createdAt');

  return (
    <div style={{ minHeight: '100vh', background: '#F0F4FF', fontFamily: 'Inter, system-ui, sans-serif' }}>
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
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>Export History</span>
          <Link href="/admin/agents" style={{ marginLeft: 18, color: '#A5F3FC', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>★ Agents</Link>
        </div>
        <Link href="/dashboard" style={{ color: '#94A3B8', fontSize: 13, textDecoration: 'none' }}>← Back to app</Link>
      </div>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: '#0F172A', marginBottom: 6 }}>📤 Export Gatekeeper</h1>
        <p style={{ color: '#64748B', fontSize: 14, marginBottom: 24 }}>
          Dual-agent integrity check on every PDF/XLSX export before download. {data.totals.runs} exports inspected · {fmtBytes(data.totals.totalBytes)} verified · avg confidence {data.totals.avgConfidence.toFixed(0)}%.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 28 }}>
          {[
            { label: 'Total exports', value: data.totals.runs.toString(), color: '#0F172A' },
            { label: 'Allowed',  value: data.totals.allowed.toString(), color: ACTION_COLOR.allow },
            { label: 'Asked',    value: data.totals.ask.toString(),     color: ACTION_COLOR.ask },
            { label: 'Blocked',  value: data.totals.blocked.toString(), color: ACTION_COLOR.block },
            { label: 'Avg confidence', value: `${data.totals.avgConfidence.toFixed(0)}%`, color: '#0F172A' },
          ].map(c => (
            <div key={c.label} style={{ background: '#fff', borderRadius: 14, padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.08em' }}>{c.label}</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: c.color, marginTop: 4 }}>{c.value}</div>
            </div>
          ))}
        </div>

        <div style={{ background: '#fff', borderRadius: 14, padding: '16px 20px', marginBottom: 28, boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
          <h2 style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', marginBottom: 12 }}>By format</h2>
          {data.byFormat.length === 0 ? (
            <div style={{ fontSize: 12, color: '#94A3B8' }}>No exports yet.</div>
          ) : data.byFormat.map(f => {
            const max = Math.max(1, ...data.byFormat.map(x => x.runs));
            return (
              <div key={f.format} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 80px 80px', gap: 10, alignItems: 'center', marginBottom: 6, fontSize: 12 }}>
                <span style={{ color: '#475569', fontWeight: 700 }}>{f.format.toUpperCase()}</span>
                <div style={{ height: 8, background: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(f.runs / max) * 100}%`, background: 'linear-gradient(90deg,#2563EB,#7C3AED)', borderRadius: 4 }} />
                </div>
                <span style={{ textAlign: 'right', fontWeight: 700, color: '#0F172A' }}>{f.runs}</span>
                <span style={{ textAlign: 'right', fontWeight: 600, color: '#059669' }}>{f.avgConfidence.toFixed(0)}%</span>
              </div>
            );
          })}
        </div>

        {data.trend30d.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 14, padding: '16px 20px', marginBottom: 28, boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <h2 style={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>Last 30 days</h2>
              <span style={{ fontSize: 11, color: '#64748B' }}>Daily exports · red overlay = blocks</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 80 }}>
              {data.trend30d.map((d, i) => (
                <div key={i} title={`${d.day}: ${d.runs} export(s), ${d.blocked} blocked`} style={{ flex: 1, position: 'relative' }}>
                  <div style={{ height: `${(d.runs / maxTrend) * 100}%`, minHeight: d.runs > 0 ? 2 : 0, background: d.runs > 0 ? 'linear-gradient(180deg,#7C3AED,#2563EB)' : '#E2E8F0', borderRadius: '3px 3px 0 0' }} />
                  {d.blocked > 0 && (
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${(d.blocked / maxTrend) * 100}%`, background: 'rgba(220, 38, 38, 0.85)', borderRadius: '3px 3px 0 0' }} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <HistoryControls
          range={range}
          onRange={(r: any) => setRange(r)}
          rows={visible}
          filename="prism-export-history"
          counts={counts}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Recent exports</h2>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['all', 'allow', 'ask', 'block'] as const).map(f => {
              const count = f === 'all' ? data.recentRuns.length : data.recentRuns.filter(r => r.action === f).length;
              return (
                <button key={f} onClick={() => setFilter(f)} style={{
                  padding: '5px 12px', borderRadius: 14,
                  border: `1.5px solid ${filter === f ? (f === 'all' ? '#2563EB' : ACTION_COLOR[f]) : '#E2E8F0'}`,
                  background: filter === f ? (f === 'all' ? '#EFF6FF' : ACTION_BG[f]) : '#fff',
                  color: filter === f ? '#0F172A' : '#475569',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}>{f} · {count}</button>
              );
            })}
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,.04)', overflow: 'hidden' }}>
          {visible.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>No exports match this filter yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#F8FAFC', textAlign: 'left', color: '#64748B', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  <th style={{ padding: '10px 14px' }}>When</th>
                  <th style={{ padding: '10px 14px' }}>Format</th>
                  <th style={{ padding: '10px 14px' }}>Action</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Size</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Confidence</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Issues (insp/content)</th>
                  <th style={{ padding: '10px 14px' }}>Reasoning</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(r => (
                  <tr key={r.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '10px 14px', color: '#475569', whiteSpace: 'nowrap' }}>{fmtDate(r.createdAt)}</td>
                    <td style={{ padding: '10px 14px', color: '#0F172A', fontWeight: 700 }}>{r.format.toUpperCase()}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ background: ACTION_BG[r.action], color: ACTION_COLOR[r.action], padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 800, letterSpacing: '.04em' }}>
                        {ACTION_ICON[r.action]} {r.action.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: '#475569' }}>{fmtBytes(r.bytes)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#0F172A' }}>{r.confidence ?? '—'}%</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: '#64748B', fontSize: 11 }}>
                      {(r.inspectorBlockers > 0 || r.inspectorMajors > 0) && <span style={{ color: '#DC2626' }}>{r.inspectorBlockers}🛑/{r.inspectorMajors}⚠ </span>}
                      <span style={{ color: '#94A3B8' }}>·</span>
                      {(r.contentBlockers > 0 || r.contentMajors > 0) && <span style={{ color: '#D97706' }}> {r.contentBlockers}🛑/{r.contentMajors}⚠</span>}
                      {r.inspectorBlockers + r.inspectorMajors + r.contentBlockers + r.contentMajors === 0 && <span style={{ color: '#059669' }}> clean</span>}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#475569', fontSize: 11, maxWidth: 320 }}>{r.reasoning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
