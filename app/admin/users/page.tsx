'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface User {
  id:           string;
  email:        string;
  name:         string | null;
  image:        string | null;
  provider:     string | null;
  is_admin:     boolean;
  has_password: boolean;
  created_at:   string;
  last_login:   string | null;
}

interface Pending {
  email:      string;
  name:       string | null;
  expires_at: string;
  created_at: string;
}

function fmt(d: string | null) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function AdminUsersPanel() {
  const router = useRouter();
  const [users,   setUsers]   = useState<User[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [meId,    setMeId]    = useState<string | null>(null);
  const [me,      setMe]      = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy,    setBusy]    = useState<string | null>(null);
  const [toast,   setToast]   = useState<{ msg: string; ok: boolean } | null>(null);
  const [filter,  setFilter]  = useState('');

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  async function load() {
    const r = await fetch('/api/admin/users');
    if (!r.ok) throw new Error('Failed to load users');
    const d = await r.json();
    setUsers(d.users ?? []);
    setPending(d.pending ?? []);
    setMeId(d.me ?? null);
  }

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.authenticated) { router.replace('/login'); return; }
        if (!d.isAdmin)        { router.replace('/dashboard'); return; }
        setMe(d);
        return load();
      })
      .catch(() => router.replace('/login'))
      .finally(() => setLoading(false));
  }, []);

  async function patch(id: string, body: Record<string, unknown>, successMsg: string) {
    setBusy(id);
    try {
      const r = await fetch(`/api/admin/users/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      await load();
      showToast(successMsg);
    } catch (err: any) {
      showToast(err.message, false);
    } finally {
      setBusy(null);
    }
  }

  async function remove(u: User) {
    if (!confirm(`Delete user ${u.email}?\n\nThis cascades to their briefs, analyses, uploads, and presentations.`)) return;
    setBusy(u.id);
    try {
      const r = await fetch(`/api/admin/users/${u.id}`, { method: 'DELETE' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Failed');
      await load();
      showToast(`Deleted ${u.email}`);
    } catch (err: any) {
      showToast(err.message, false);
    } finally {
      setBusy(null);
    }
  }

  async function resetPassword(u: User) {
    const pwd = prompt(`Set a new password for ${u.email} (min 6 chars):`);
    if (!pwd) return;
    if (pwd.length < 6) { showToast('Password must be at least 6 characters.', false); return; }
    await patch(u.id, { password: pwd }, `Password updated for ${u.email}`);
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#F0F4FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#64748B', fontSize: 15 }}>Loading admin panel…</div>
      </div>
    );
  }

  const q = filter.trim().toLowerCase();
  const visible = !q ? users : users.filter(u =>
    u.email.toLowerCase().includes(q) || (u.name ?? '').toLowerCase().includes(q),
  );
  const adminCount = users.filter(u => u.is_admin).length;

  return (
    <div style={{ minHeight: '100vh', background: '#F0F4FF', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          padding: '12px 20px', borderRadius: 12, fontSize: 13, fontWeight: 600,
          background: toast.ok ? '#059669' : '#DC2626', color: '#fff',
          boxShadow: '0 8px 24px rgba(0,0,0,.2)',
        }}>
          {toast.msg}
        </div>
      )}

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
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>Users</span>
          <Link href="/admin/pages" style={{ marginLeft: 18, color: '#94A3B8', fontSize: 13, textDecoration: 'none' }}>→ Pages</Link>
          <Link href="/admin/audit-log" style={{ marginLeft: 10, color: '#94A3B8', fontSize: 13, textDecoration: 'none' }}>→ Audit Log</Link>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#6366F1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700 }}>
            {(me?.name || me?.email || 'A').slice(0, 2).toUpperCase()}
          </div>
          <Link href="/dashboard" style={{ color: '#94A3B8', fontSize: 13, textDecoration: 'none' }}>← Back to app</Link>
        </div>
      </div>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>

        <div style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 900, color: '#0F172A', letterSpacing: '-.4px', marginBottom: 6 }}>
              Users
            </h1>
            <p style={{ color: '#64748B', fontSize: 14 }}>
              Manage accounts, admin access, and credentials.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ padding: '6px 14px', borderRadius: 20, background: '#EEF2FF', border: '1.5px solid #C7D2FE', fontSize: 12, fontWeight: 700, color: '#4338CA' }}>
              👥 {users.length} Users
            </div>
            <div style={{ padding: '6px 14px', borderRadius: 20, background: '#F5F3FF', border: '1.5px solid #DDD6FE', fontSize: 12, fontWeight: 700, color: '#7C3AED' }}>
              ★ {adminCount} Admins
            </div>
            {pending.length > 0 && (
              <div style={{ padding: '6px 14px', borderRadius: 20, background: '#FFFBEB', border: '1.5px solid #FDE68A', fontSize: 12, fontWeight: 700, color: '#B45309' }}>
                ⏳ {pending.length} Pending
              </div>
            )}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <input
            placeholder="Filter by email or name…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            style={{
              width: '100%', maxWidth: 360, padding: '10px 14px',
              borderRadius: 10, border: '1.5px solid #E2E8F0',
              fontSize: 13, fontFamily: 'inherit', background: '#fff', color: '#0F172A',
            }}
          />
        </div>

        <div style={{ background: '#fff', borderRadius: 20, border: '1.5px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,.06)' }}>

          <div style={{ display: 'grid', gridTemplateColumns: '2.4fr 1fr 1.2fr 1.2fr 110px 240px', gap: 0, padding: '12px 20px', background: '#F8FAFC', borderBottom: '1.5px solid #E2E8F0' }}>
            {['User', 'Provider', 'Created', 'Last login', 'Role', 'Actions'].map(h => (
              <span key={h} style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em', color: '#94A3B8' }}>{h}</span>
            ))}
          </div>

          {visible.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
              No users match.
            </div>
          )}

          {visible.map((u, idx) => {
            const isMe     = u.id === meId;
            const isBusy   = busy === u.id;
            return (
              <div key={u.id} style={{
                display: 'grid', gridTemplateColumns: '2.4fr 1fr 1.2fr 1.2fr 110px 240px',
                gap: 0, padding: '16px 20px', alignItems: 'center',
                borderBottom: idx < visible.length - 1 ? '1px solid #F1F5F9' : 'none',
                background: isBusy ? '#FAFBFF' : '#fff',
                transition: 'background .15s',
              }}>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#2563EB,#7C3AED)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                    {(u.name || u.email).slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {u.name || '—'}
                      {isMe && <span style={{ fontSize: 10, fontWeight: 700, color: '#2563EB', background: '#EFF6FF', padding: '1px 6px', borderRadius: 6 }}>You</span>}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', background: '#F1F5F9', padding: '3px 8px', borderRadius: 6, textTransform: 'capitalize' }}>
                    {u.provider || 'demo'}
                  </span>
                  {u.has_password && (
                    <span title="Has password set" style={{ marginLeft: 6, fontSize: 11 }}>🔑</span>
                  )}
                </div>

                <span style={{ fontSize: 12, color: '#64748B' }}>{fmt(u.created_at)}</span>
                <span style={{ fontSize: 12, color: '#64748B' }}>{fmt(u.last_login)}</span>

                <div>
                  {u.is_admin ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: '#F5F3FF', border: '1.5px solid #DDD6FE', fontSize: 11, fontWeight: 700, color: '#7C3AED' }}>★ Admin</span>
                  ) : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: '#F1F5F9', border: '1.5px solid #CBD5E1', fontSize: 11, fontWeight: 700, color: '#64748B' }}>User</span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => patch(u.id, { isAdmin: !u.is_admin }, `${u.email} ${u.is_admin ? 'demoted' : 'promoted to admin'}`)}
                    disabled={isBusy || (isMe && u.is_admin)}
                    title={isMe && u.is_admin ? 'You cannot demote yourself' : ''}
                    style={{
                      padding: '6px 12px', borderRadius: 8, border: '1.5px solid #E2E8F0',
                      background: '#fff', color: '#475569',
                      fontSize: 12, fontWeight: 700, cursor: (isMe && u.is_admin) ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit', opacity: (isMe && u.is_admin) || isBusy ? .5 : 1,
                    }}
                  >
                    {u.is_admin ? 'Revoke admin' : 'Make admin'}
                  </button>
                  <button
                    onClick={() => resetPassword(u)}
                    disabled={isBusy}
                    style={{
                      padding: '6px 12px', borderRadius: 8, border: '1.5px solid #E2E8F0',
                      background: '#fff', color: '#475569',
                      fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                      opacity: isBusy ? .5 : 1,
                    }}
                  >
                    Reset password
                  </button>
                  <button
                    onClick={() => remove(u)}
                    disabled={isBusy || isMe}
                    title={isMe ? 'You cannot delete yourself' : ''}
                    style={{
                      padding: '6px 12px', borderRadius: 8, border: '1.5px solid #FECACA',
                      background: '#FEF2F2', color: '#B91C1C',
                      fontSize: 12, fontWeight: 700, cursor: isMe ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit', opacity: isMe || isBusy ? .5 : 1,
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {pending.length > 0 && (
          <>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', marginTop: 32, marginBottom: 12 }}>
              Pending verification
            </h2>
            <div style={{ background: '#fff', borderRadius: 20, border: '1.5px solid #E2E8F0', overflow: 'hidden' }}>
              {pending.map((p, idx) => (
                <div key={p.email + idx} style={{
                  display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr',
                  padding: '12px 20px', alignItems: 'center',
                  borderBottom: idx < pending.length - 1 ? '1px solid #F1F5F9' : 'none',
                  fontSize: 13, color: '#475569',
                }}>
                  <span style={{ fontWeight: 700, color: '#0F172A' }}>{p.email}</span>
                  <span>{p.name || '—'}</span>
                  <span style={{ fontSize: 12, color: '#64748B' }}>sent {fmt(p.created_at)}</span>
                  <span style={{ fontSize: 12, color: '#B45309' }}>expires {fmt(p.expires_at)}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <p style={{ marginTop: 20, fontSize: 12, color: '#94A3B8', textAlign: 'center' }}>
          Deleting a user cascades to their owned briefs, analyses, uploads, and presentations.
        </p>
      </main>
    </div>
  );
}
