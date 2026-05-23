'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface FallbackEvent {
  id:            number;
  kind:          string;
  severity:      'info' | 'warn' | 'alert';
  surface:       string;
  primary_model: string | null;
  actual_model:  string | null;
  attempts:      number;
  error_message: string | null;
  details:       any;
  created_at:    string;
}

interface AiHealth {
  providerStatus: {
    openRouterKeySet:    boolean;
    openRouterKeyLength: number;
    geminiKeySet:        boolean;
    smtpConfigured:      boolean;
  };
  summary: {
    last1h:  { surface: string; severity: string; n: number }[];
    last24h: { surface: string; severity: string; n: number }[];
  };
  events: FallbackEvent[];
}

const SEV_COLOR = { info: '#0891B2', warn: '#D97706', alert: '#DC2626' };
const SEV_BG    = { info: '#ECFEFF', warn: '#FFFBEB', alert: '#FEF2F2' };

function fmt(d: string) {
  return new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function AiHealthPanel() {
  const router = useRouter();
  const [data,    setData]    = useState<AiHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState<'all' | 'info' | 'warn' | 'alert'>('all');
  const [me,      setMe]      = useState<any>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.authenticated) { router.replace('/login'); return; }
        if (!d.isAdmin)        { router.replace('/dashboard'); return; }
        setMe(d);
        return fetch('/api/admin/ai-health');
      })
      .then(r => r?.ok ? r.json() : null)
      .then((d: AiHealth) => { if (d) setData(d); })
      .catch(() => router.replace('/login'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ minHeight: '100vh', background: '#F0F4FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', fontSize: 15 }}>Loading AI health…</div>;
  if (!data)   return null;

  const events = filter === 'all' ? data.events : data.events.filter(e => e.severity === filter);
  const alert24 = data.summary.last24h.find(s => s.severity === 'alert')?.n ?? 0;
  const warn24  = data.summary.last24h.filter(s => s.severity === 'warn').reduce((n, s) => n + s.n, 0);
  const info24  = data.summary.last24h.filter(s => s.severity === 'info').reduce((n, s) => n + s.n, 0);

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
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>AI Health</span>
          <Link href="/admin/users"       style={{ marginLeft: 18, color: '#94A3B8', fontSize: 13, textDecoration: 'none' }}>→ Users</Link>
          <Link href="/admin/audit-log"   style={{ marginLeft: 10, color: '#94A3B8', fontSize: 13, textDecoration: 'none' }}>→ Audit Log</Link>
          <Link href="/admin/pages"       style={{ marginLeft: 10, color: '#94A3B8', fontSize: 13, textDecoration: 'none' }}>→ Pages</Link>
          <Link href="/admin/verification-history" style={{ marginLeft: 10, color: '#94A3B8', fontSize: 13, textDecoration: 'none' }}>→ Verification</Link>
        </div>
        <Link href="/dashboard" style={{ color: '#94A3B8', fontSize: 13, textDecoration: 'none' }}>← Back to app</Link>
      </div>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: '#0F172A', marginBottom: 6 }}>🛡 AI Health</h1>
        <p style={{ color: '#64748B', fontSize: 14, marginBottom: 24 }}>
          Live monitor for every LLM fallback in the system. Recorded by <code style={{ background: '#fff', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>lib/ai/fallback-monitor</code>.
        </p>

        {/* Actionable banner — fires when OpenRouter key is missing or empty.
            Single-click jump to the right Vercel screen to fix it. */}
        {!data.providerStatus.openRouterKeySet || data.providerStatus.openRouterKeyLength < 20 ? (
          <div style={{
            marginBottom: 24, padding: '16px 20px', borderRadius: 14,
            background: '#FEF2F2', border: '2px solid #FECACA',
            display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 16, alignItems: 'center',
          }}>
            <div style={{ fontSize: 28 }}>🚨</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#991B1B', marginBottom: 2 }}>
                OpenRouter API key missing or empty
              </div>
              <div style={{ fontSize: 12.5, color: '#7F1D1D', lineHeight: 1.5 }}>
                Three features (Trends AI · Brief context summary · Copilot) are degraded.
                Set <code style={{ background: '#fff', padding: '1px 6px', borderRadius: 4, fontSize: 11 }}>OPENROUTER_API_KEY</code> on Vercel → Settings → Environment Variables (Production + Preview), then redeploy.
              </div>
            </div>
            <a href="https://vercel.com/rahul-sonis-projects-94160bba/prism-fluo/settings/environment-variables?q=OPENROUTER_API_KEY"
              target="_blank" rel="noopener noreferrer"
              style={{
                padding: '10px 16px', borderRadius: 10, textDecoration: 'none',
                background: '#DC2626', color: '#fff', fontSize: 12.5, fontWeight: 700,
                whiteSpace: 'nowrap',
              }}>
              Open Vercel →
            </a>
          </div>
        ) : null}

        {/* Provider status */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 28 }}>
          {[
            { label: 'OpenRouter key',  ok: data.providerStatus.openRouterKeySet, detail: `${data.providerStatus.openRouterKeyLength} chars` },
            { label: 'Gemini key',      ok: data.providerStatus.geminiKeySet,     detail: data.providerStatus.geminiKeySet ? 'set' : 'not set' },
            { label: 'SMTP (alerts)',   ok: data.providerStatus.smtpConfigured,   detail: data.providerStatus.smtpConfigured ? 'configured' : 'no SMTP_USER/PASS' },
          ].map(s => (
            <div key={s.label} style={{ background: '#fff', borderRadius: 14, padding: '16px 18px', border: `1.5px solid ${s.ok ? '#A7F3D0' : '#FECACA'}`, boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: s.ok ? '#059669' : '#DC2626', display: 'flex', alignItems: 'center', gap: 6 }}>
                {s.ok ? '✓ Connected' : '✗ Not configured'}
              </div>
              <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{s.detail}</div>
            </div>
          ))}
        </div>

        {/* 24h headline counters */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 28 }}>
          {[
            { label: '24h alerts',  value: alert24, color: SEV_COLOR.alert },
            { label: '24h warns',   value: warn24,  color: SEV_COLOR.warn  },
            { label: '24h info',    value: info24,  color: SEV_COLOR.info  },
            { label: 'Total events',value: data.events.length, color: '#0F172A' },
          ].map(s => (
            <div key={s.label} style={{ background: '#fff', borderRadius: 14, padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' }}>{s.label}</div>
              <div style={{ fontSize: 26, fontWeight: 900, color: s.color, marginTop: 2 }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Surface breakdown */}
        <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginBottom: 10 }}>Last 24 hours · by surface</h2>
        <div style={{ background: '#fff', borderRadius: 14, padding: '14px 18px', marginBottom: 28, boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
          {data.summary.last24h.length === 0 ? (
            <div style={{ color: '#059669', fontSize: 13, fontWeight: 600 }}>✓ No fallbacks in last 24h — AI surfaces are healthy</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8, fontSize: 13 }}>
              <span style={{ fontWeight: 800, color: '#94A3B8', fontSize: 10, textTransform: 'uppercase' }}>Surface</span>
              <span style={{ fontWeight: 800, color: '#94A3B8', fontSize: 10, textTransform: 'uppercase' }}>Severity</span>
              <span style={{ fontWeight: 800, color: '#94A3B8', fontSize: 10, textTransform: 'uppercase', textAlign: 'right' }}>Count</span>
              {data.summary.last24h.map((s, i) => (
                <>
                  <span key={`s${i}`} style={{ color: '#0F172A', fontWeight: 600 }}>{s.surface}</span>
                  <span key={`v${i}`}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: (SEV_COLOR as any)[s.severity], background: (SEV_BG as any)[s.severity], padding: '2px 8px', borderRadius: 10, textTransform: 'uppercase' }}>{s.severity}</span>
                  </span>
                  <span key={`n${i}`} style={{ textAlign: 'right', fontWeight: 700, color: '#0F172A' }}>{s.n}</span>
                </>
              ))}
            </div>
          )}
        </div>

        {/* Events */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Recent events</h2>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['all', 'alert', 'warn', 'info'] as const).map(f => {
              const count = f === 'all' ? data.events.length : data.events.filter(e => e.severity === f).length;
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    padding: '5px 12px', borderRadius: 14,
                    border: `1.5px solid ${filter === f ? ((SEV_COLOR as any)[f] || '#2563EB') : '#E2E8F0'}`,
                    background: filter === f ? ((SEV_BG as any)[f] || '#EFF6FF') : '#fff',
                    color: filter === f ? ((SEV_COLOR as any)[f] || '#1D4ED8') : '#475569',
                    fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize',
                  }}
                >
                  {f} · {count}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
          {events.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#059669' }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>✓</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>No {filter !== 'all' ? filter : ''} events</div>
            </div>
          ) : events.map((e, idx) => (
            <div key={e.id} style={{
              padding: '12px 18px', borderBottom: idx < events.length - 1 ? '1px solid #F1F5F9' : 'none',
              display: 'grid', gridTemplateColumns: '170px 90px 1.5fr 1fr 1fr', gap: 10, alignItems: 'start', fontSize: 12,
            }}>
              <span style={{ color: '#64748B', fontSize: 11 }}>{fmt(e.created_at)}</span>
              <span>
                <span style={{ fontSize: 10, fontWeight: 700, color: (SEV_COLOR as any)[e.severity], background: (SEV_BG as any)[e.severity], padding: '2px 8px', borderRadius: 10, textTransform: 'uppercase' }}>{e.severity}</span>
              </span>
              <span style={{ color: '#0F172A' }}>
                <strong>{e.surface}</strong>
                <div style={{ fontSize: 10.5, color: '#64748B' }}>{e.kind}</div>
              </span>
              <span style={{ color: '#475569', fontSize: 11 }}>
                {e.primary_model && <div>primary: <code>{e.primary_model.split('/').pop()}</code></div>}
                {e.actual_model && e.actual_model !== e.primary_model && <div>fell back to: <code>{e.actual_model.split('/').pop()}</code></div>}
                {e.attempts > 1 && <div>{e.attempts} attempts</div>}
              </span>
              <span style={{ color: '#64748B', fontSize: 11, whiteSpace: 'pre-wrap' }}>
                {e.error_message ? (e.error_message.length > 80 ? e.error_message.slice(0, 78) + '…' : e.error_message) : '—'}
              </span>
            </div>
          ))}
        </div>

        <p style={{ marginTop: 18, fontSize: 11, color: '#94A3B8', textAlign: 'center' }}>
          Burst alerts trigger an email to NOTIFY_EMAIL when 5+ alert-severity events occur in 5 minutes.
          Cooldown: 30 minutes between alerts.
        </p>
      </main>
    </div>
  );
}
