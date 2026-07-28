'use client';
/**
 * components/DbStatusBanner.jsx
 *
 * Discreet top-of-page banner that appears ONLY when the DB is unreachable.
 * Solves the "why is my data gone?" panic that happens when Supabase Free
 * auto-pauses — instead of the app silently serving mock/fallback data,
 * users see a clear "database is temporarily unavailable" strip.
 *
 * Polls /api/keepalive every 30s. Renders nothing when the DB is healthy
 * (zero visual impact for normal use). When the ping returns 503, shows
 * an orange banner with an explanation + retry button + status link.
 *
 * Drop into any page's layout:  <DbStatusBanner />
 */

import { useEffect, useState } from 'react';

export default function DbStatusBanner() {
  const [status, setStatus] = useState('checking');  // 'checking' | 'ok' | 'down'
  const [lastCheck, setLastCheck] = useState(null);
  const [checking, setChecking] = useState(false);

  async function ping() {
    setChecking(true);
    try {
      const res = await fetch('/api/keepalive', { cache: 'no-store' });
      setStatus(res.ok ? 'ok' : 'down');
    } catch {
      setStatus('down');
    } finally {
      setChecking(false);
      setLastCheck(new Date());
    }
  }

  useEffect(() => {
    ping();
    const t = setInterval(ping, 30_000);  // every 30s
    return () => clearInterval(t);
  }, []);

  if (status !== 'down') return null;

  return (
    <div
      role="status"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        background: 'linear-gradient(90deg, #FEF3C7 0%, #FDE68A 100%)',
        borderBottom: '1px solid #F59E0B',
        color: '#78350F',
        padding: '10px 20px',
        fontSize: 13,
        fontWeight: 500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 16 }}>⚠</span>
        <span>
          <strong>Database temporarily unavailable.</strong>{' '}
          Your data is safe — the display may show placeholder items until the connection is restored (usually 60–90 seconds).
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button
          onClick={ping}
          disabled={checking}
          style={{
            background: '#78350F',
            color: '#fff',
            border: 'none',
            padding: '6px 14px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: checking ? 'wait' : 'pointer',
            opacity: checking ? 0.7 : 1,
          }}
        >
          {checking ? 'Checking…' : 'Retry now'}
        </button>
        <a
          href="https://status.supabase.com"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: '#78350F',
            fontSize: 12,
            textDecoration: 'underline',
            fontWeight: 500,
          }}
        >
          Status ↗
        </a>
      </div>
    </div>
  );
}
