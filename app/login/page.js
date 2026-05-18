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

        {/* OAuth buttons temporarily hidden — Google redirect URI not yet
            registered for all environments. Re-enable by restoring the block
            from git history once Google Cloud Console is updated. */}

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
