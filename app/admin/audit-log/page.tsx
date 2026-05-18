'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface AuditEntry {
  id:           number;
  actor_id:     string | null;
  actor_email:  string | null;
  action:       string;
  target_id:    string | null;
  target_email: string | null;
  details:      Record<string, unknown> | null;
  created_at:   string;
}

const ACTION_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  'user.promote':         { label: 'Promoted to admin', color: '#7C3AED', bg: '#F5F3FF' },
  'user.demote':          { label: 'Demoted from admin', color: '#64748B', bg: '#F1F5F9' },
  'user.delete':          { label: 'Deleted user',      color: '#B91C1C', bg: '#FEF2F2' },
  'user.reset_password':  { label: 'Reset password',     color: '#D97706', bg: '#FFFBEB' },
  'user.rename':          { label: 'Renamed user',       color: '#0891B2', bg: '#ECFEFF' },
  'page.publish':         { label: 'Published page',     color: '#059669', bg: '#ECFDF5' },
  'page.unpublish':       { label: 'Unpublished page',   color: '#64748B', bg: '#F1F5F9' },
};

function fmt(d: string) {
  return new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function getActionStyle(action: string) {
  return ACTION_LABEL[action] || { label: action, color: '#475569', bg: '#F8FAFC' };
}

export default function AuditLogPanel() {
  const router = useRouter();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [me,      setMe]      = useState<any>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.authenticated) { router.replace('/login'); return; }
        if (!d.isAdmin)        { router.replace('/dashboard'); return; }
        setMe(d);
        return fetch('/api/admin/audit-log?limit=300');
      })
      .then(r => r?.ok ? r.json() : null)
      .then(d => { if (d?.entries) setEntries(d.entries); })
      .catch(() => router.replace('/login'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#F0F4FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#64748B', fontSize: 15 }}>Loading audit log…</div>
      </div>
    );
  }

  const q = filter.trim().toLowerCase();
  const visible = entries.filter(e => {
    if (actionFilter && e.action !== actionFilter) return false;
    if (!q) return true;
    return (
      (e.actor_email  || '').toLowerCase().includes(q) ||
      (e.target_email || '').toLowerCase().includes(q) ||
      e.action.toLowerCase().includes(q)
    );
  });

  const distinctActions = Array.from(new Set(entries.map(e => e.action))).sort();

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
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>Audit Log</span>
          <Link href="/admin/users" style={{ marginLeft: 18, color: '#94A3B8', fontSize: 13, textDecoration: 'none' }}>→ Users</Link>
          <Link href="/admin/pages" style={{ marginLeft: 10, color: '#94A3B8', fontSize: 13, textDecoration: 'none' }}>→ Pages</Link>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#6366F1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700 }}>
            {(me?.name || me?.email || 'A').slice(0, 2).toUpperCase()}
          </div>
          <Link href="/dashboard" style={{ color: '#94A3B8', fontSize: 13, textDecoration: 'none' }}>← Back to app</Link>
        </div>
      </div>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 900, color: '#0F172A', letterSpacing: '-.4px', marginBottom: 6 }}>
              Audit Log
            </h1>
            <p style={{ color: '#64748B', fontSize: 14 }}>
              Who did what, and when. Last {entries.length} admin actions.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={actionFilter}
              onChange={e => setActionFilter(e.target.value)}
              style={{
                padding: '8px 12px', borderRadius: 10, border: '1.5px solid #E2E8F0',
                fontSize: 13, fontFamily: 'inherit', background: '#fff', color: '#0F172A', cursor: 'pointer',
              }}
            >
              <option value="">All actions</option>
              {distinctActions.map(a => (
                <option key={a} value={a}>{getActionStyle(a).label}</option>
              ))}
            </select>
            <input
              placeholder="Search actor / target / action…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              style={{
                padding: '8px 12px', borderRadius: 10, border: '1.5px solid #E2E8F0',
                fontSize: 13, fontFamily: 'inherit', background: '#fff', color: '#0F172A', width: 280,
              }}
            />
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: 20, border: '1.5px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,.06)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '180px 1.6fr 1.4fr 1.4fr 80px', gap: 0, padding: '12px 20px', background: '#F8FAFC', borderBottom: '1.5px solid #E2E8F0' }}>
            {['When', 'Actor', 'Action', 'Target', 'Details'].map(h => (
              <span key={h} style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em', color: '#94A3B8' }}>{h}</span>
            ))}
          </div>

          {visible.length === 0 && (
            <div style={{ padding: 48, textAlign: 'center', color: '#94A3B8' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {entries.length === 0 ? 'No admin actions logged yet' : 'No entries match your filters'}
              </div>
              {entries.length === 0 && (
                <div style={{ fontSize: 12, marginTop: 6 }}>
                  Promote a user or publish a page on the admin panel and it'll appear here.
                </div>
              )}
            </div>
          )}

          {visible.map((e, idx) => {
            const a = getActionStyle(e.action);
            return (
              <div key={e.id} style={{
                display: 'grid', gridTemplateColumns: '180px 1.6fr 1.4fr 1.4fr 80px',
                gap: 0, padding: '14px 20px', alignItems: 'start',
                borderBottom: idx < visible.length - 1 ? '1px solid #F1F5F9' : 'none',
                fontSize: 13, color: '#334155',
              }}>
                <span style={{ color: '#64748B', fontSize: 12 }}>{fmt(e.created_at)}</span>
                <span>
                  <span style={{ fontWeight: 700, color: '#0F172A', fontSize: 13 }}>{e.actor_email || '—'}</span>
                </span>
                <span>
                  <span style={{
                    display: 'inline-block', padding: '3px 10px', borderRadius: 20,
                    background: a.bg, color: a.color, fontSize: 11, fontWeight: 700,
                    border: `1px solid ${a.color}33`,
                  }}>
                    {a.label}
                  </span>
                </span>
                <span style={{ color: '#475569', fontSize: 13 }}>{e.target_email || e.target_id || '—'}</span>
                <span>
                  {e.details && Object.keys(e.details).length > 0 ? (
                    <button
                      type="button"
                      onClick={() => alert(JSON.stringify(e.details, null, 2))}
                      style={{
                        background: '#F1F5F9', border: '1px solid #E2E8F0',
                        padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                        color: '#475569', cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      View
                    </button>
                  ) : <span style={{ color: '#94A3B8' }}>—</span>}
                </span>
              </div>
            );
          })}
        </div>

        <p style={{ marginTop: 18, fontSize: 12, color: '#94A3B8', textAlign: 'center' }}>
          Audit entries are immutable. Showing latest 300.
        </p>
      </main>
    </div>
  );
}
