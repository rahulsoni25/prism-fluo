'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Login() {
  const router = useRouter();
  const [email,    setEmail]    = useState('sarah@wunderman.com');
  const [password, setPassword] = useState('demo1234');
  const [name,     setName]     = useState('');
  const [error,    setError]    = useState(null);
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

        {/* OAuth buttons (rendered conditionally — fall back to disabled state with
            an explanatory tooltip when env vars aren't set on the server). */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          <a
            href="/api/auth/oauth/google"
            onClick={(e) => { if (!providers.google) { e.preventDefault(); setError('Google sign-in is disabled — set AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET on Railway.'); } }}
            className="btn"
            style={{
              background: '#fff', color: '#111827', border: '1.5px solid #E5E7EB',
              fontWeight: 600, justifyContent: 'center', gap: 10,
              opacity: providers.google ? 1 : 0.55, cursor: providers.google ? 'pointer' : 'not-allowed',
              textDecoration: 'none',
            }}
          >
            <span style={{ fontSize: 16 }}>🇬</span>
            Continue with Google
            {!providers.google && <span style={{ fontSize: 10, color: '#6B7280', marginLeft: 6 }}>(not configured)</span>}
          </a>
          <a
            href="/api/auth/oauth/linkedin"
            onClick={(e) => { if (!providers.linkedin) { e.preventDefault(); setError('LinkedIn sign-in is disabled — set AUTH_LINKEDIN_ID and AUTH_LINKEDIN_SECRET on Railway.'); } }}
            className="btn"
            style={{
              background: '#0A66C2', color: '#fff', border: 'none',
              fontWeight: 600, justifyContent: 'center', gap: 10,
              opacity: providers.linkedin ? 1 : 0.55, cursor: providers.linkedin ? 'pointer' : 'not-allowed',
              textDecoration: 'none',
            }}
          >
            <span style={{ fontSize: 14 }}>in</span>
            Continue with LinkedIn
            {!providers.linkedin && <span style={{ fontSize: 10, opacity: 0.85, marginLeft: 6 }}>(not configured)</span>}
          </a>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0', color: '#9CA3AF', fontSize: 11 }}>
          <div style={{ flex: 1, height: 1, background: '#E5E7EB' }} />
          <span>or sign in with email</span>
          <div style={{ flex: 1, height: 1, background: '#E5E7EB' }} />
        </div>

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
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" style={{ flex: 2 }} type="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign In →'}
            </button>
            <button 
              type="button"
              className="btn" 
              style={{ flex: 1, background: '#F3F4F6', color: '#374151', border: '1px solid #D1D5DB' }}
              onClick={() => {
                setEmail('tester@fluo.ai');
                setPassword('debug');
                setTimeout(() => handleEmailLogin(), 50);
              }}
            >
              Dummy 🛠️
            </button>
          </div>
        </form>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#6B7280' }}>
          Don't have an account? <a href="/signup" style={{ color: '#2563EB', fontWeight: 600, textDecoration: 'none' }}>Sign Up</a>
        </div>

        <div className="demo-hint">
          🔑 <strong>Demo credentials</strong><br />
          sarah@wunderman.com &nbsp;/&nbsp; demo1234
        </div>
      </div>
    </div>
  );
}
