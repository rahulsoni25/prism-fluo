'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

function initials(nameOrEmail) {
  if (!nameOrEmail) return '··';
  const s = String(nameOrEmail).trim();
  if (/\s/.test(s)) {
    const parts = s.split(/\s+/).slice(0, 2);
    return parts.map(p => p[0]).join('').toUpperCase();
  }
  const local = s.includes('@') ? s.split('@')[0] : s;
  return local.slice(0, 2).toUpperCase();
}

// ── Defaults ──────────────────────────────────────────────────
// Used on first render AND as fallback if /api/pages fails or the
// pages table doesn't exist yet.  Matches the original hard-coded nav
// so there is ZERO flash or regression before the migration runs.
const DEFAULT_PAGES = [
  { slug: '/presentations', show_in_nav: true,  status: 'published' },
  { slug: '/culture',       show_in_nav: true,  status: 'published' },
  { slug: '/analyze',       show_in_nav: true,  status: 'published' },
  // show_in_nav=false but still published → renders in contextual spots
  { slug: '/upload',        show_in_nav: false, status: 'published' },
  { slug: '/dashboard',     show_in_nav: false, status: 'published' },
  { slug: '/insights',      show_in_nav: false, status: 'published' },
];

export default function Navbar() {
  const pathname = usePathname();
  const router   = useRouter();
  const [me,       setMe]       = useState(null);
  // Start with defaults so the nav renders correctly on first paint —
  // no flash, no broken links even if /api/pages is slow.
  const [navPages, setNavPages] = useState(DEFAULT_PAGES);

  useEffect(() => {
    Promise.all([
      fetch('/api/auth/me').then(r => r.ok ? r.json() : null),
      fetch('/api/pages').then(r => r.ok ? r.json() : null),
    ]).then(([meData, pagesData]) => {
      if (meData?.authenticated) setMe(meData);
      // Only replace defaults if the API returned a non-empty array
      if (Array.isArray(pagesData?.pages) && pagesData.pages.length > 0) {
        setNavPages(pagesData.pages);
      }
    }).catch(() => {
      // Keep defaults on network error — app still usable
    });
  }, [pathname]);

  async function handleSignOut(e) {
    e.preventDefault();
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
    router.replace('/login');
  }

  // ── Helpers ─────────────────────────────────────────────────
  // isInNav  → published AND show_in_nav=true  (main nav links)
  // isPageOn → published (any nav placement, e.g. Data Mapper on dashboard)
  const publishedSet = new Set(
    navPages.filter(p => p.status === 'published').map(p => p.slug)
  );
  const navSet = new Set(
    navPages.filter(p => p.status === 'published' && p.show_in_nav).map(p => p.slug)
  );

  const isInNav  = (slug) => navSet.has(slug);
  const isPageOn = (slug) => publishedSet.has(slug);

  const isOnBriefFlow = pathname.includes('/processing') ||
                        pathname.includes('/insights')    ||
                        pathname.includes('/brief/new');

  return (
    <nav className="nav">
      <Link href="/dashboard" className="nav-brand" style={{ textDecoration: 'none' }}>
        <div className="nav-prism-icon">P</div>
        <span className="nav-prism-text">PRISM</span>
      </Link>

      <div className="nav-links">
        {/* My Briefs — structural home link, always visible */}
        <Link
          href="/dashboard"
          className={`nav-link ${pathname === '/dashboard' || pathname.includes('/brief') || pathname.includes('/insights') ? 'active' : ''}`}
        >
          {isOnBriefFlow ? '← My Briefs' : 'My Briefs'}
        </Link>

        {/* Main nav items — controlled by show_in_nav + published status */}
        {isInNav('/presentations') && (
          <Link
            href="/presentations"
            className={`nav-link ${pathname === '/presentations' ? 'active' : ''}`}
            style={{ textDecoration: 'none' }}
          >
            🎨 Presentations
          </Link>
        )}

        {/* Dashboard-only contextual links */}
        {pathname === '/dashboard' && (
          <>
            {/* HIDDEN 2026-05-25: Templates + Team placeholders removed.
                Inert <span>s with no href / no destination — looked like real
                nav items but did nothing on click. Re-add only when the
                actual pages exist. See docs/HIDDEN-FEATURES.md item #5. */}
            {/* Data Mapper: uses isPageOn (not isInNav) — it's published
                but intentionally NOT a persistent nav item */}
            {isPageOn('/upload') && (
              <Link href="/upload" className="nav-link" style={{ textDecoration: 'none' }}>
                Data Mapper
              </Link>
            )}
          </>
        )}

        {isInNav('/culture') && (
          <Link
            href="/culture"
            className={`nav-link ${pathname === '/culture' ? 'active' : ''}`}
          >
            Culture
          </Link>
        )}

        {isInNav('/analyze') && (
          <Link
            href="/analyze"
            className={`nav-link ${pathname === '/analyze' ? 'active' : ''}`}
            style={{ textDecoration: 'none' }}
          >
            ⚡ Analyze
          </Link>
        )}

        {/* Admin link — only for admin users.
            HIDDEN 2026-05-25 from rahulsoni25@gmail.com (owner account):
            owner wanted a clean client-style nav. Admin pages remain fully
            accessible via direct URL (/admin/pages). See docs/HIDDEN-FEATURES.md item #6. */}
        {me?.isAdmin && me?.email !== 'rahulsoni25@gmail.com' && (
          <Link
            href="/admin/pages"
            className={`nav-link ${pathname.startsWith('/admin') ? 'active' : ''}`}
            style={{ textDecoration: 'none', color: pathname.startsWith('/admin') ? '#6366F1' : undefined }}
          >
            ⚙ Admin
          </Link>
        )}
      </div>

      <div className="nav-user">
        <div className="avatar">{initials(me?.name || me?.email)}</div>
        <span>{me?.name || me?.email || '…'}</span>
        <a
          href="#"
          onClick={handleSignOut}
          className="nav-signout"
          style={{ textDecoration: 'none', cursor: 'pointer' }}
        >
          {' '}· Sign out
        </a>
      </div>
    </nav>
  );
}
