'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

function initials(nameOrEmail) {
  if (!nameOrEmail) return '··';
  const s = String(nameOrEmail).trim();
  // Name with space → first-letter of first two words
  if (/\s/.test(s)) {
    const parts = s.split(/\s+/).slice(0, 2);
    return parts.map(p => p[0]).join('').toUpperCase();
  }
  // Email → first two letters of local part
  const local = s.includes('@') ? s.split('@')[0] : s;
  return local.slice(0, 2).toUpperCase();
}

export default function Navbar() {
  const pathname = usePathname();
  const router   = useRouter();
  const [me, setMe] = useState(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.authenticated) setMe(d); })
      .catch(() => {});
  }, [pathname]);

  async function handleSignOut(e) {
    e.preventDefault();
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    router.replace('/login');
  }

  return (
    <nav className="nav">
      <Link href="/dashboard" className="nav-brand" style={{ textDecoration: 'none' }}>
        <div className="nav-prism-icon">P</div>
        <span className="nav-prism-text">PRISM</span>
      </Link>
      
      <div className="nav-links">
        <Link
          href="/dashboard"
          className={`nav-link ${pathname === '/dashboard' || pathname.includes('/brief') || pathname.includes('/insights') ? 'active' : ''}`}
        >
          {pathname.includes('/processing') || pathname.includes('/insights') || pathname.includes('/brief/new') ? '← My Briefs' : 'My Briefs'}
        </Link>
        <Link
          href="/presentations"
          className={`nav-link ${pathname === '/presentations' ? 'active' : ''}`}
          style={{ textDecoration: 'none' }}
        >
          🎨 Presentations
        </Link>
        {pathname === '/dashboard' && (
          <>
            <span className="nav-link">Templates</span>
            <span className="nav-link">Team</span>
            <Link href="/upload" className="nav-link" style={{ textDecoration: 'none' }}>
              Data Mapper
            </Link>
          </>
        )}
        <Link href="/culture" className={`nav-link ${pathname === '/culture' ? 'active' : ''}`}>
          Culture
        </Link>
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
