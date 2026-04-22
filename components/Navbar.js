'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Navbar() {
  const pathname = usePathname();

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
        {pathname === '/dashboard' && (
          <>
            <Link href="/dashboards" className={`nav-link ${pathname === '/dashboards' ? 'active' : ''}`} style={{ textDecoration: 'none' }}>
              Strategic Pillars
            </Link>
            <span className="nav-link">Templates</span>
            <span className="nav-link">Team</span>
            <Link href="/upload" className="nav-link" style={{ textDecoration: 'none' }}>
              Data Mapper
            </Link>
          </>
        )}
      </div>

      <div className="nav-user">
        <div className="avatar">SC</div>
        <span>Sarah Chen</span>
        {pathname === '/dashboard' && (
          <Link href="/login" className="nav-signout" style={{ textDecoration: 'none' }}>
            {' '}· Sign out
          </Link>
        )}
      </div>
    </nav>
  );
}
