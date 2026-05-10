'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Page {
  id:          string;
  name:        string;
  slug:        string;
  description: string;
  icon:        string;
  status:      'draft' | 'published';
  show_in_nav: boolean;
  protected:   boolean;
  sort_order:  number;
  updated_at:  string;
}

export default function AdminPagesPanel() {
  const router = useRouter();
  const [pages,   setPages]   = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState<string | null>(null); // page id being saved
  const [toast,   setToast]   = useState<{ msg: string; ok: boolean } | null>(null);
  const [me,      setMe]      = useState<any>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  // ── Auth + fetch ──────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.authenticated) { router.replace('/login'); return; }
        if (!d.isAdmin)        { router.replace('/dashboard'); return; }
        setMe(d);
        return fetch('/api/admin/pages');
      })
      .then(r => r?.ok ? r.json() : null)
      .then(d => { if (d?.pages) setPages(d.pages); })
      .catch(() => router.replace('/login'))
      .finally(() => setLoading(false));
  }, []);

  // ── Single page toggle ────────────────────────────────────────
  async function toggle(page: Page, newStatus: 'published' | 'draft') {
    setSaving(page.id);
    try {
      const res = await fetch(`/api/admin/pages/${page.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setPages(prev => prev.map(p => p.id === page.id ? { ...p, status: newStatus } : p));
      showToast(`"${page.name}" ${newStatus === 'published' ? 'published ✓' : 'set to draft'}`);
    } catch (err: any) {
      showToast(err.message, false);
    } finally {
      setSaving(null);
    }
  }

  // ── Bulk action ───────────────────────────────────────────────
  async function bulk(action: 'publish_all' | 'unpublish_all') {
    setSaving('bulk');
    try {
      const res = await fetch('/api/admin/pages', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error('Bulk action failed');
      // Refetch
      const d = await (await fetch('/api/admin/pages')).json();
      if (d?.pages) setPages(d.pages);
      showToast(action === 'publish_all' ? 'All pages published ✓' : 'Non-protected pages set to draft');
    } catch (err: any) {
      showToast(err.message, false);
    } finally {
      setSaving(null);
    }
  }

  const published = pages.filter(p => p.status === 'published').length;
  const draft     = pages.filter(p => p.status === 'draft').length;

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#F0F4FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#64748B', fontSize: 15 }}>Loading admin panel…</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F0F4FF', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          padding: '12px 20px', borderRadius: 12, fontSize: 13, fontWeight: 600,
          background: toast.ok ? '#059669' : '#DC2626', color: '#fff',
          boxShadow: '0 8px 24px rgba(0,0,0,.2)',
          animation: 'fadeIn .2s ease',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Admin Header */}
      <div style={{ background: 'linear-gradient(135deg,#0F172A,#1E1B4B)', padding: '20px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link href="/dashboard" style={{ textDecoration: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#6366F1,#7C3AED)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 14 }}>P</div>
              <span style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>PRISM</span>
            </div>
          </Link>
          <span style={{ color: 'rgba(255,255,255,.3)', fontSize: 14 }}>/</span>
          <span style={{ color: '#C7D2FE', fontWeight: 700, fontSize: 14 }}>Admin</span>
          <span style={{ color: 'rgba(255,255,255,.3)', fontSize: 14 }}>/</span>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>Pages</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#6366F1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700 }}>
            {(me?.name || me?.email || 'A').slice(0, 2).toUpperCase()}
          </div>
          <Link href="/dashboard" style={{ color: '#94A3B8', fontSize: 13, textDecoration: 'none' }}>← Back to app</Link>
        </div>
      </div>

      <main style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>

        {/* Title + stats */}
        <div style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 900, color: '#0F172A', letterSpacing: '-.4px', marginBottom: 6 }}>
              Pages
            </h1>
            <p style={{ color: '#64748B', fontSize: 14 }}>
              Control which screens are visible in the navigation.
            </p>
          </div>
          {/* Stats chips */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ padding: '6px 14px', borderRadius: 20, background: '#ECFDF5', border: '1.5px solid #A7F3D0', fontSize: 12, fontWeight: 700, color: '#059669' }}>
              ● {published} Published
            </div>
            <div style={{ padding: '6px 14px', borderRadius: 20, background: '#F1F5F9', border: '1.5px solid #CBD5E1', fontSize: 12, fontWeight: 700, color: '#64748B' }}>
              ○ {draft} Draft
            </div>
          </div>
        </div>

        {/* Bulk actions */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <button
            onClick={() => bulk('publish_all')}
            disabled={saving === 'bulk'}
            style={{
              padding: '9px 20px', borderRadius: 10, border: 'none', cursor: saving === 'bulk' ? 'not-allowed' : 'pointer',
              background: 'linear-gradient(135deg,#059669,#065F46)', color: '#fff',
              fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
              opacity: saving === 'bulk' ? .6 : 1,
            }}
          >
            ✓ Publish All
          </button>
          <button
            onClick={() => bulk('unpublish_all')}
            disabled={saving === 'bulk'}
            style={{
              padding: '9px 20px', borderRadius: 10, border: '1.5px solid #E2E8F0', cursor: saving === 'bulk' ? 'not-allowed' : 'pointer',
              background: '#fff', color: '#475569',
              fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
              opacity: saving === 'bulk' ? .6 : 1,
            }}
          >
            ○ Unpublish All
          </button>
        </div>

        {/* Pages table */}
        <div style={{ background: '#fff', borderRadius: 20, border: '1.5px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,.06)' }}>

          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.4fr 2.5fr 130px 180px', gap: 0, padding: '12px 20px', background: '#F8FAFC', borderBottom: '1.5px solid #E2E8F0' }}>
            {['Page', 'Slug', 'Description', 'Status', 'Actions'].map(h => (
              <span key={h} style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em', color: '#94A3B8' }}>{h}</span>
            ))}
          </div>

          {/* Rows */}
          {pages.map((page, idx) => {
            const isPublished = page.status === 'published';
            const isSaving    = saving === page.id;
            return (
              <div key={page.id} style={{
                display: 'grid', gridTemplateColumns: '2fr 1.4fr 2.5fr 130px 180px',
                gap: 0, padding: '16px 20px', alignItems: 'center',
                borderBottom: idx < pages.length - 1 ? '1px solid #F1F5F9' : 'none',
                background: isSaving ? '#FAFBFF' : '#fff',
                transition: 'background .15s',
              }}>

                {/* Name + icon */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 18 }}>{page.icon}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{page.name}</div>
                    {page.protected && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#7C3AED', background: '#F5F3FF', padding: '1px 6px', borderRadius: 6 }}>Protected</span>
                    )}
                  </div>
                </div>

                {/* Slug */}
                <code style={{ fontSize: 12, color: '#475569', background: '#F8FAFC', padding: '3px 8px', borderRadius: 6, fontFamily: "'DM Mono', monospace" }}>
                  {page.slug}
                </code>

                {/* Description */}
                <span style={{ fontSize: 13, color: '#64748B' }}>{page.description}</span>

                {/* Status badge */}
                <div>
                  {isPublished ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 20, background: '#ECFDF5', border: '1.5px solid #A7F3D0', fontSize: 12, fontWeight: 700, color: '#059669' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#059669', display: 'inline-block' }} />
                      Published
                    </span>
                  ) : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 20, background: '#F1F5F9', border: '1.5px solid #CBD5E1', fontSize: 12, fontWeight: 700, color: '#64748B' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#94A3B8', display: 'inline-block' }} />
                      Draft
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8 }}>
                  {isPublished ? (
                    <button
                      onClick={() => toggle(page, 'draft')}
                      disabled={isSaving || !!page.protected}
                      title={page.protected ? 'This page is protected' : 'Set to Draft'}
                      style={{
                        padding: '6px 14px', borderRadius: 8, border: '1.5px solid #E2E8F0',
                        background: '#fff', color: page.protected ? '#CBD5E1' : '#475569',
                        fontSize: 12, fontWeight: 700, cursor: page.protected ? 'not-allowed' : 'pointer',
                        fontFamily: 'inherit', transition: 'all .15s',
                        opacity: isSaving ? .5 : 1,
                      }}
                    >
                      {isSaving ? '…' : 'Unpublish'}
                    </button>
                  ) : (
                    <button
                      onClick={() => toggle(page, 'published')}
                      disabled={isSaving}
                      style={{
                        padding: '6px 14px', borderRadius: 8, border: 'none',
                        background: 'linear-gradient(135deg,#2563EB,#7C3AED)', color: '#fff',
                        fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        fontFamily: 'inherit', boxShadow: '0 2px 8px rgba(37,99,235,.3)',
                        opacity: isSaving ? .5 : 1,
                      }}
                    >
                      {isSaving ? '…' : 'Publish'}
                    </button>
                  )}
                  <Link
                    href={page.slug}
                    target="_blank"
                    style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid #E2E8F0', background: '#F8FAFC', color: '#64748B', fontSize: 12, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                    title="Preview page"
                  >
                    ↗
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer note */}
        <p style={{ marginTop: 20, fontSize: 12, color: '#94A3B8', textAlign: 'center' }}>
          Protected pages (Login, Dashboard) cannot be unpublished. · Changes apply immediately.
        </p>
      </main>

      <style>{`@keyframes fadeIn { from { opacity:0; transform:translateY(-6px) } to { opacity:1; transform:none } }`}</style>
    </div>
  );
}
