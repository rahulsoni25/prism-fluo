'use client';
/**
 * /admin/inbox
 *
 * The founder's "did anything happen?" page. Single dashboard that
 * answers questions like:
 *   - Did Schbang raise any briefs last week?
 *   - Who signed up but never created a brief?
 *   - Which accounts went quiet?
 *
 * Designed phone-friendly (search box + tap-friendly cards) so the
 * founder can answer client questions from anywhere.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface InboxEvent {
  ts:           string;
  kind:         string;
  user_email:   string | null;
  target_label: string | null;
  meta:         Record<string, unknown>;
}

interface AccountRow {
  domain:         string;
  user_count:     number;
  brief_count:    number;
  analysis_count: number;
  last_activity:  string;
}

interface QuietUser {
  id:            string;
  email:         string;
  name:          string | null;
  created_at:    string;
  last_activity: string;
}

interface StuckBrief {
  id:           string;
  brand:        string;
  objective:    string | null;
  created_at:   string;
  user_email:   string | null;
  upload_count: number;
}

interface InboxData {
  windowDays:    number;
  query:         string | null;
  summary:       { new_signups: number; new_briefs: number; new_analyses: number; new_uploads: number };
  recentEvents:  InboxEvent[];
  byAccount:     AccountRow[];
  quietAccounts: QuietUser[];
  stuckBriefs:   StuckBrief[];
  generatedAt:   string;
}

const KIND_META: Record<string, { icon: string; label: string; color: string }> = {
  'auth.signup':           { icon: '📩', label: 'Signup',         color: '#16a34a' },
  'brief.create':          { icon: '🧾', label: 'Brief created',  color: '#6366F1' },
  'upload.create':         { icon: '📎', label: 'File uploaded',  color: '#8b5cf6' },
  'analysis.run':          { icon: '🧠', label: 'Analysis run',   color: '#ec4899' },
  'analysis.export.pptx':  { icon: '📊', label: 'PPTX export',    color: '#f59e0b' },
  'analysis.export.pdf':   { icon: '📑', label: 'PDF export',     color: '#f59e0b' },
  'share.create':          { icon: '🔗', label: 'Share link',     color: '#10b981' },
  'share.view':            { icon: '👁',  label: 'Share viewed',   color: '#22c55e' },
  'copilot.ask':           { icon: '💬', label: 'Co-Pilot Q',     color: '#0ea5e9' },
};

function timeAgo(s: string): string {
  const ms = Date.now() - new Date(s).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60)        return `${sec}s ago`;
  if (sec < 3600)      return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400)     return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 604800)    return `${Math.floor(sec / 86400)}d ago`;
  return `${Math.floor(sec / 604800)}w ago`;
}
function fmtDate(s: string): string {
  try { return new Date(s).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return s; }
}

export default function AdminInboxPage() {
  const router = useRouter();
  const [data,    setData]    = useState<InboxData | null>(null);
  const [loading, setLoading] = useState(true);
  const [me,      setMe]      = useState<any>(null);
  const [days,    setDays]    = useState(7);
  const [query,   setQuery]   = useState('');
  const [tab,     setTab]     = useState<'timeline' | 'accounts' | 'stuck' | 'quiet'>('timeline');

  // Debounce search input
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Auth + initial load
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.authenticated) { router.replace('/login'); return; }
        if (!d.isAdmin)        { router.replace('/dashboard'); return; }
        setMe(d);
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  // Fetch on filter changes
  useEffect(() => {
    if (!me) return;
    setLoading(true);
    const params = new URLSearchParams({ days: String(days) });
    if (debouncedQuery) params.set('q', debouncedQuery);
    fetch(`/api/admin/inbox?${params.toString()}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [me, days, debouncedQuery]);

  // Group recent events by day
  const eventsByDay = useMemo(() => {
    if (!data) return [] as { day: string; events: InboxEvent[] }[];
    const groups: Record<string, InboxEvent[]> = {};
    for (const e of data.recentEvents) {
      const day = new Date(e.ts).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
      (groups[day] ||= []).push(e);
    }
    return Object.entries(groups).map(([day, events]) => ({ day, events }));
  }, [data]);

  if (!me) return <div style={{ padding: 48 }}>Loading…</div>;

  // ── Styles ────────────────────────────────────────────────────────
  const sx = {
    page: { maxWidth: 1200, margin: '0 auto', padding: 24, fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', color: '#0a0a0a' },
    h1:   { fontSize: 28, fontWeight: 700, margin: '8px 0 6px', letterSpacing: '-0.5px' as const },
    sub:  { fontSize: 14, color: '#525252', margin: 0 },
    summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, margin: '24px 0' },
    statCard:    { background: '#fafafa', border: '1px solid #eaeaea', borderRadius: 12, padding: '16px 18px' },
    statLabel:   { fontSize: 11, fontWeight: 600, letterSpacing: 1, color: '#737373', textTransform: 'uppercase' as const, marginBottom: 6 },
    statValue:   { fontSize: 28, fontWeight: 700, letterSpacing: '-1px' as const, color: '#0a0a0a' },
    controls:    { display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' as const },
    search:      { padding: '10px 14px', borderRadius: 9, border: '1px solid #d4d4d8', fontSize: 14, minWidth: 280, flex: 1 },
    daysSel:     { padding: '10px 12px', borderRadius: 9, border: '1px solid #d4d4d8', fontSize: 14, background: '#fff' },
    tabs:        { display: 'flex', gap: 4, marginBottom: 18, borderBottom: '1px solid #eaeaea', overflowX: 'auto' as const },
    tab:         (active: boolean) => ({
      padding: '10px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
      border: 'none', background: 'transparent',
      color: active ? '#6366F1' : '#737373',
      borderBottom: active ? '2px solid #6366F1' : '2px solid transparent',
      marginBottom: -1, whiteSpace: 'nowrap' as const,
    }),
    dayHeader:   { fontSize: 12, fontWeight: 700, letterSpacing: 1, color: '#737373', textTransform: 'uppercase' as const, margin: '20px 0 8px' },
    eventRow:    { display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', background: '#fff', border: '1px solid #eaeaea', borderRadius: 10, marginBottom: 6 },
    eventIcon:   { fontSize: 18, flexShrink: 0 },
    eventBody:   { flex: 1, minWidth: 0 },
    eventLine1:  { fontSize: 14, fontWeight: 600, color: '#0a0a0a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
    eventLine2:  { fontSize: 12.5, color: '#525252', marginTop: 2 },
    eventMeta:   { fontSize: 11, color: '#a3a3a3', flexShrink: 0, marginLeft: 8 },
    card:        { background: '#fff', border: '1px solid #eaeaea', borderRadius: 12, padding: 16, marginBottom: 10 },
    empty:       { padding: 40, textAlign: 'center' as const, color: '#a3a3a3', background: '#fafafa', borderRadius: 12, border: '1px dashed #d4d4d8' },
  };

  return (
    <div style={sx.page}>
      {/* Header */}
      <Link href="/admin/pages" style={{ fontSize: 13, color: '#6366F1', textDecoration: 'none' }}>
        ← Admin
      </Link>
      <h1 style={sx.h1}>Inbox</h1>
      <p style={sx.sub}>
        Did anything happen? Everything that touched the platform in the last {days} days, grouped, searchable.
      </p>

      {/* Controls */}
      <div style={{ ...sx.controls, marginTop: 20 }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by email or domain (e.g. schbang.com)…"
          style={sx.search}
        />
        <select value={days} onChange={e => setDays(Number(e.target.value))} style={sx.daysSel}>
          <option value={1}>Last 24 hours</option>
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {/* Summary */}
      <div style={sx.summaryGrid}>
        <div style={sx.statCard}>
          <div style={sx.statLabel}>📩 New signups</div>
          <div style={sx.statValue}>{data?.summary.new_signups ?? '—'}</div>
        </div>
        <div style={sx.statCard}>
          <div style={sx.statLabel}>🧾 New briefs</div>
          <div style={sx.statValue}>{data?.summary.new_briefs ?? '—'}</div>
        </div>
        <div style={sx.statCard}>
          <div style={sx.statLabel}>📎 Uploads</div>
          <div style={sx.statValue}>{data?.summary.new_uploads ?? '—'}</div>
        </div>
        <div style={sx.statCard}>
          <div style={sx.statLabel}>🧠 Analyses run</div>
          <div style={sx.statValue}>{data?.summary.new_analyses ?? '—'}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={sx.tabs}>
        <button style={sx.tab(tab === 'timeline')} onClick={() => setTab('timeline')}>
          🕘 Timeline {data ? `(${data.recentEvents.length})` : ''}
        </button>
        <button style={sx.tab(tab === 'accounts')} onClick={() => setTab('accounts')}>
          🏢 By account {data ? `(${data.byAccount.length})` : ''}
        </button>
        <button style={sx.tab(tab === 'stuck')} onClick={() => setTab('stuck')}>
          ⚠ Stuck briefs {data ? `(${data.stuckBriefs.length})` : ''}
        </button>
        <button style={sx.tab(tab === 'quiet')} onClick={() => setTab('quiet')}>
          🔇 Quiet accounts {data ? `(${data.quietAccounts.length})` : ''}
        </button>
      </div>

      {/* Body */}
      {loading && <div style={sx.empty}>Loading…</div>}

      {!loading && tab === 'timeline' && (
        eventsByDay.length === 0 ? (
          <div style={sx.empty}>
            {debouncedQuery
              ? `No activity matching "${debouncedQuery}" in the last ${days} days.`
              : `No activity in the last ${days} days. Pick a longer window or check the filters.`}
          </div>
        ) : eventsByDay.map(group => (
          <div key={group.day}>
            <div style={sx.dayHeader}>{group.day}</div>
            {group.events.map((ev, i) => {
              const meta = KIND_META[ev.kind] ?? { icon: '•', label: ev.kind, color: '#737373' };
              return (
                <div key={`${ev.ts}-${i}`} style={sx.eventRow}>
                  <div style={sx.eventIcon}>{meta.icon}</div>
                  <div style={sx.eventBody}>
                    <div style={sx.eventLine1}>
                      <span style={{ color: meta.color, marginRight: 6, fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>
                        {meta.label.toUpperCase()}
                      </span>
                      {ev.target_label || '—'}
                    </div>
                    <div style={sx.eventLine2}>
                      {ev.user_email ? <strong>{ev.user_email}</strong> : <em>anonymous</em>}
                      {' · '}
                      <span title={fmtDate(ev.ts)}>{timeAgo(ev.ts)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))
      )}

      {!loading && tab === 'accounts' && (
        data?.byAccount.length === 0 ? (
          <div style={sx.empty}>No active accounts in this window.</div>
        ) : data?.byAccount.map(a => (
          <div key={a.domain} style={sx.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#0a0a0a' }}>{a.domain || '(unknown)'}</div>
                <div style={{ fontSize: 12, color: '#737373', marginTop: 2 }}>
                  {a.user_count} {Number(a.user_count) === 1 ? 'user' : 'users'} · last activity {timeAgo(a.last_activity)}
                </div>
              </div>
              <button
                onClick={() => { setQuery(a.domain); setTab('timeline'); }}
                style={{ padding: '6px 11px', fontSize: 12, fontWeight: 500, color: '#6366F1', background: 'rgba(99,102,241,0.08)', border: 'none', borderRadius: 6, cursor: 'pointer' }}
              >
                View activity →
              </button>
            </div>
            <div style={{ display: 'flex', gap: 18, fontSize: 13, color: '#404040', marginTop: 10 }}>
              <span><strong>{a.brief_count}</strong> briefs</span>
              <span><strong>{a.analysis_count}</strong> analyses</span>
            </div>
          </div>
        ))
      )}

      {!loading && tab === 'stuck' && (
        data?.stuckBriefs.length === 0 ? (
          <div style={sx.empty}>No stuck briefs. Everyone's getting their analyses run. 🎉</div>
        ) : data?.stuckBriefs.map(b => (
          <div key={b.id} style={sx.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0a0a0a' }}>
                  {b.brand}
                  {b.objective && <span style={{ color: '#737373', fontWeight: 400 }}> · {b.objective}</span>}
                </div>
                <div style={{ fontSize: 13, color: '#525252', marginTop: 4 }}>
                  {b.user_email || '(no owner)'}
                  {' · '}
                  Created {timeAgo(b.created_at)}
                  {' · '}
                  {b.upload_count} {Number(b.upload_count) === 1 ? 'upload' : 'uploads'}
                </div>
                <div style={{
                  fontSize: 12, marginTop: 8, color: Number(b.upload_count) > 0 ? '#f59e0b' : '#dc2626', fontWeight: 600,
                }}>
                  {Number(b.upload_count) > 0
                    ? '⚠ Files uploaded but analysis not run — likely needs founder attention'
                    : '⚠ Brief created but no files uploaded yet'}
                </div>
              </div>
              <Link
                href={`/brief/${b.id}/mapper`}
                style={{ padding: '6px 12px', fontSize: 12, fontWeight: 500, color: '#fff', background: '#6366F1', textDecoration: 'none', borderRadius: 6, whiteSpace: 'nowrap', marginLeft: 12 }}
              >
                Open →
              </Link>
            </div>
          </div>
        ))
      )}

      {!loading && tab === 'quiet' && (
        data?.quietAccounts.length === 0 ? (
          <div style={sx.empty}>Nobody quiet yet — every active user touched the platform in the last week. 🎉</div>
        ) : data?.quietAccounts.map(u => {
          const lastTs = new Date(u.last_activity).getTime();
          const isNever = !u.last_activity || lastTs < new Date('2000-01-01').getTime();
          return (
            <div key={u.id} style={sx.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#0a0a0a' }}>{u.email}</div>
                  <div style={{ fontSize: 12, color: '#737373', marginTop: 4 }}>
                    {u.name && <span>{u.name} · </span>}
                    Signed up {timeAgo(u.created_at)}
                    {' · '}
                    {isNever
                      ? <strong style={{ color: '#dc2626' }}>Never used the product</strong>
                      : <>Last seen {timeAgo(u.last_activity)}</>}
                  </div>
                </div>
                <a
                  href={`mailto:${u.email}?subject=Checking%20in%20on%20PRISM&body=Hi%20${encodeURIComponent(u.name || '')}%2C%0A%0A`}
                  style={{ padding: '6px 11px', fontSize: 12, fontWeight: 500, color: '#6366F1', background: 'rgba(99,102,241,0.08)', borderRadius: 6, textDecoration: 'none' }}
                >
                  ✉ Email
                </a>
              </div>
            </div>
          );
        })
      )}

      {/* Footer */}
      <div style={{ marginTop: 32, fontSize: 12, color: '#a3a3a3', textAlign: 'center' }}>
        {data && <>Generated {timeAgo(data.generatedAt)} · </>}
        <button
          onClick={() => { setLoading(true); setData(null); setMe({ ...me }); }}
          style={{ background: 'transparent', color: '#6366F1', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontSize: 12 }}
        >
          Refresh
        </button>
      </div>
    </div>
  );
}
