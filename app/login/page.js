'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const ERROR_MESSAGES = {
  invalid_token: 'That verification link is invalid or has already been used.',
  expired_token: 'That verification link has expired. Please sign up again.',
  server_error:  'Something went wrong. Please try again.',
};

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [name,     setName]     = useState('');
  const [error,    setError]    = useState(() => ERROR_MESSAGES[searchParams.get('error')] ?? null);
  const [busy,     setBusy]     = useState(false);
  const [providers, setProviders] = useState({ google: false, linkedin: false });

  // Auto-redirect if already signed in. Also checks which OAuth providers
  // the server has env vars configured for, so we can show the right CTAs.
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.authenticated) router.replace('/dashboard'); })
      .catch(() => {});
    fetch('/api/auth/providers')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setProviders(d); })
      .catch(() => {});
  }, [router]);

  async function handleEmailLogin(e) {
    e?.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password, name }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      router.replace('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen screen-login fade-in">
      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-icon">P</div>
          <div className="login-logo-text">PRISM</div>
        </div>
        <p className="login-tagline">Agency Intelligence Platform — insights powered by live data</p>

        {/* ── OAuth buttons ──
            Server-driven via /api/auth/providers — the button only renders
            when the corresponding env vars are configured server-side.
            So Google Cloud Console + Vercel env work is a "flip the switch"
            change, no re-deploy needed. */}
        {(providers.google || providers.linkedin) && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
              {providers.google && (
                <a
                  href="/api/auth/oauth/google"
                  className="btn-oauth"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                    padding: '11px 16px', borderRadius: 10,
                    border: '1px solid #DADCE0', background: '#fff', color: '#3C4043',
                    fontSize: 14, fontWeight: 600, textDecoration: 'none',
                    fontFamily: "'Inter', system-ui, sans-serif",
                    boxShadow: '0 1px 2px rgba(60,64,67,.08)',
                    transition: 'background .15s, box-shadow .15s',
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.background = '#F8F9FA'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(60,64,67,.15)'; }}
                  onMouseOut={(e)  => { e.currentTarget.style.background = '#fff';    e.currentTarget.style.boxShadow = '0 1px 2px rgba(60,64,67,.08)'; }}
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                    <path fill="#4285F4" d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
                    <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
                    <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
                    <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
                  </svg>
                  Continue with Google
                </a>
              )}
              {providers.linkedin && (
                <a
                  href="/api/auth/oauth/linkedin"
                  className="btn-oauth"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                    padding: '11px 16px', borderRadius: 10,
                    border: '1px solid #0A66C2', background: '#0A66C2', color: '#fff',
                    fontSize: 14, fontWeight: 600, textDecoration: 'none',
                    fontFamily: "'Inter', system-ui, sans-serif",
                  }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.063 2.063 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                  </svg>
                  Continue with LinkedIn
                </a>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700 }}>
              <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
              or with email
              <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
            </div>
          </>
        )}

        <form onSubmit={handleEmailLogin}>
          <div className="form-group">
            <label>Work Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          {error && (
            <div style={{
              background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B',
              padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 10,
            }}>{error}</div>
          )}
          <button className="btn btn-primary btn-full" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign In →'}
          </button>

          <div style={{ textAlign: 'center', marginTop: 4, fontSize: 12 }}>
            <a href="/forgot-password" style={{ color: '#6B7280', textDecoration: 'none' }}>
              Forgot password?
            </a>
          </div>
        </form>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#6B7280' }}>
          Don't have an account? <a href="/signup" style={{ color: '#2563EB', fontWeight: 600, textDecoration: 'none' }}>Sign Up</a>
        </div>
      </div>
    </div>
  );
}

export default function Login() {
  return (
    <Suspense fallback={<div className="screen screen-login" />}>
      <LoginInner />
    </Suspense>
  );
}
