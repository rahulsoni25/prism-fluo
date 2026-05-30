'use client';
/**
 * /admin/audit-events
 *
 * Admin-facing view of the broad audit_events log. Powers the procurement-
 * facing "downloadable audit trail" feature (₹10K/mo add-on). Anything a
 * user does that touches data shows up here within seconds.
 *
 * Filters: event kind · user email · date range
 * Export:  one-click CSV download (cap 50k rows)
 */

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface AuditEvent {
  id:          number;
  occurred_at: string;
  user_id:     string | null;
  user_email:  string | null;
  kind:        string;
  target_type: string | null;
  target_id:   string | null;
  ip:          string | null;
  metadata:    Record<string, unknown>;
}

const KIND_META: Record<string, { label: string; color: string }> = {
  'brief.create':          { label: 'Brief · create',          color: '#16a34a' },
  'brief.read':            { label: 'Brief · read',            color: '#0ea5e9' },
  'brief.update':          { label: 'Brief · update',          color: '#0ea5e9' },
  'upload.create':         { label: 'Upload',                  color: '#8b5cf6' },
  'upload.supersede':      { label: 'Upload superseded',       color: '#a78bfa' },
  'analysis.run':          { label: 'Analysis run',            color: '#6366F1' },
  'analysis.export.pptx':  { label: 'Export · PPTX',           color: '#ec4899' },
  'analysis.export.pdf':   { label: 'Export · PDF',            color: '#ec4899' },
  'analysis.export.xlsx':  { label: 'Export · XLSX',           color: '#ec4899' },
  'copilot.ask':           { label: 'Co-Pilot question',       color: '#6366F1' },
  'share.create':          { label: 'Share link created',      color: '#10b981' },
  'share.revoke':          { label: 'Share link revoked',      color: '#dc2626' },
  'share.view':            { label: 'Share link viewed',       color: '#22c55e' },
  'audience_labels.save':  { label: 'Audience labels saved',   color: '#f59e0b' },
};

function fmtDate(s: string): string {
  try { return new Date(s).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return s; }
}

export default function AuditEventsPage() {
  const router = useRouter();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total,  setTotal]  = useState(0);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<any>(null);

  // Filters
  const [kindFilter,   setKindFilter]   = useState('');
  const [userFilter,   setUserFilter]   = useState('');
  const [sinceFilter,  setSinceFilter]  = useState('');
  const [untilFilter,  setUntilFilter]  = useState('');
  const [page,         setPage]         = useState(0);
  const pageSize = 100;

  // Auth check + initial fetch
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

  // Re-fetch when filters / page change
  useEffect(() => {
    if (!me) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (kindFilter)  params.set('kind', kindFilter);
    if (userFilter)  params.set('userId', userFilter);
    if (sinceFilter) params.set('since', new Date(sinceFilter).toISOString());
    if (untilFilter) params.set('until', new Date(untilFilter).toISOString());
    params.set('limit',  String(pageSize));
    params.set('offset', String(page * pageSize));

    fetch(`/api/admin/audit-events?${params.toString()}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        setEvents(d?.events ?? []);
        setTotal(d?.total ?? 0);
      })
      .catch(() => { setEvents([]); setTotal(0); })
      .finally(() => setLoading(false));
  }, [me, kindFilter, userFilter, sinceFilter, untilFilter, page]);

  const kindsSeen = useMemo(() => {
    const s = new Set(events.map(e => e.kind));
    return Array.from(s).sort();
  }, [events]);

  function exportCsv() {
    const params = new URLSearchParams();
    if (kindFilter)  params.set('kind', kindFilter);
    if (userFilter)  params.set('userId', userFilter);
    if (sinceFilter) params.set('since', new Date(sinceFilter).toISOString());
    if (untilFilter) params.set('until', new Date(untilFilter).toISOString());
    params.set('format', 'csv');
    window.location.href = `/api/admin/audit-events?${params.toString()}`;
  }

  if (!me) return <div style={{ padding: 48 }}>Loading…</div>;

  return (
    <div style={{ padding: 32, maxWidth: 1400, margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <Link href="/admin/pages" style={{ fontSize: 13, color: '#6366F1', textDecoration: 'none' }}>
            ← Admin
          </Link>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: '8px 0 6px', letterSpacing: '-0.5px' }}>
            Audit Log
          </h1>
          <p style={{ fontSize: 14, color: '#525252', margin: 0 }}>
            Every user action that touches data. Filterable, exportable. This is the procurement-facing artifact.
          </p>
        </div>
        <button
          onClick={exportCsv}
          style={{
            background: '#0a0a0a', color: '#fff', border: 'none', padding: '10px 16px',
            borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer',
          }}
        >
          ⬇ Export CSV
        </button>
      </div>

      {/* Filters */}
      <div style={{
        background: '#fafafa', border: '1px solid #eaeaea', borderRadius: 10,
        padding: 16, marginBottom: 20, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end',
      }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#737373' }}>
          EVENT KIND
          <select
            value={kindFilter}
            onChange={e => { setKindFilter(e.target.value); setPage(0); }}
            style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid #d4d4d8', minWidth: 200 }}
          >
            <option value="">All kinds</option>
            {Object.entries(KIND_META).map(([k, m]) => (
              <option key={k} value={k}>{m.label}</option>
            ))}
            {kindsSeen.filter(k => !KIND_META[k]).map(k => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#737373' }}>
          USER ID
          <input
            value={userFilter}
            onChange={e => { setUserFilter(e.target.value); setPage(0); }}
            placeholder="UUID"
            style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid #d4d4d8', minWidth: 280 }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#737373' }}>
          SINCE
          <input
            type="datetime-local" value={sinceFilter}
            onChange={e => { setSinceFilter(e.target.value); setPage(0); }}
            style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid #d4d4d8' }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#737373' }}>
          UNTIL
          <input
            type="datetime-local" value={untilFilter}
            onChange={e => { setUntilFilter(e.target.value); setPage(0); }}
            style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid #d4d4d8' }}
          />
        </label>
        <button
          onClick={() => { setKindFilter(''); setUserFilter(''); setSinceFilter(''); setUntilFilter(''); setPage(0); }}
          style={{
            background: '#fff', color: '#525252', border: '1px solid #d4d4d8',
            padding: '7px 12px', borderRadius: 7, fontSize: 13, cursor: 'pointer',
          }}
        >
          Reset
        </button>
      </div>

      <div style={{ fontSize: 13, color: '#737373', marginBottom: 12 }}>
        {loading ? 'Loading…' : `${total.toLocaleString()} events match · showing ${events.length}`}
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid #eaeaea', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#fafafa', borderBottom: '1px solid #eaeaea' }}>
              <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600, color: '#525252' }}>When</th>
              <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600, color: '#525252' }}>Event</th>
              <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600, color: '#525252' }}>User</th>
              <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600, color: '#525252' }}>Target</th>
              <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600, color: '#525252' }}>Details</th>
            </tr>
          </thead>
          <tbody>
            {events.map(ev => {
              const meta = KIND_META[ev.kind] ?? { label: ev.kind, color: '#737373' };
              return (
                <tr key={ev.id} style={{ borderBottom: '1px solid #f4f4f5' }}>
                  <td style={{ padding: '10px 16px', color: '#525252', whiteSpace: 'nowrap' }}>
                    {fmtDate(ev.occurred_at)}
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{
                      display: 'inline-block', padding: '3px 9px', borderRadius: 5,
                      background: `${meta.color}1a`, color: meta.color,
                      fontSize: 12, fontWeight: 600,
                    }}>
                      {meta.label}
                    </span>
                  </td>
                  <td style={{ padding: '10px 16px', color: '#404040' }}>
                    {ev.user_email || (ev.user_id ? <code style={{ fontSize: 11 }}>{ev.user_id.slice(0,8)}…</code> : <em style={{ color: '#a3a3a3' }}>anonymous</em>)}
                  </td>
                  <td style={{ padding: '10px 16px', color: '#525252', fontSize: 12 }}>
                    {ev.target_type ? (
                      <>
                        <span style={{ color: '#a3a3a3' }}>{ev.target_type}</span>
                        {' · '}
                        <code style={{ fontSize: 11 }}>{ev.target_id?.slice(0,12)}…</code>
                      </>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '10px 16px', color: '#737373', fontSize: 12, fontFamily: 'monospace', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ev.metadata && Object.keys(ev.metadata).length > 0
                      ? JSON.stringify(ev.metadata).slice(0, 80)
                      : '—'}
                  </td>
                </tr>
              );
            })}
            {events.length === 0 && !loading && (
              <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: '#a3a3a3' }}>
                No events match this filter.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
        <button
          disabled={page === 0}
          onClick={() => setPage(p => Math.max(0, p - 1))}
          style={{
            padding: '7px 14px', background: '#fff', border: '1px solid #d4d4d8',
            borderRadius: 7, fontSize: 13, cursor: page === 0 ? 'not-allowed' : 'pointer',
            opacity: page === 0 ? 0.5 : 1,
          }}
        >
          ← Previous
        </button>
        <span style={{ fontSize: 13, color: '#737373' }}>
          Page {page + 1} of {Math.max(1, Math.ceil(total / pageSize))}
        </span>
        <button
          disabled={(page + 1) * pageSize >= total}
          onClick={() => setPage(p => p + 1)}
          style={{
            padding: '7px 14px', background: '#fff', border: '1px solid #d4d4d8',
            borderRadius: 7, fontSize: 13,
            cursor: (page + 1) * pageSize >= total ? 'not-allowed' : 'pointer',
            opacity: (page + 1) * pageSize >= total ? 0.5 : 1,
          }}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
