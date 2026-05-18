'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function Signup() {
  const router = useRouter();
  const [name,     setName]     = useState('');
  const [agency,   setAgency]   = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPwd,  setShowPwd]  = useState(false);
  const [error,    setError]    = useState(null);
  const [busy,     setBusy]     = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.authenticated) router.replace('/dashboard'); })
      .catch(() => {});
  }, [router]);

  async function handleSignup(e) {
    e?.preventDefault();
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password, name: agency ? `${name} (${agency})` : name }),
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
      <div className="login-card" style={{ maxWidth: 420 }}>
        {/* Logo */}
        <div className="login-logo">
          <div className="login-logo-icon">P</div>
          <div className="login-logo-text">PRISM</div>
        </div>
        <h2 style={{ textAlign: 'center', marginBottom: 4, color: '#111827', fontSize: 20, fontWeight: 800 }}>
          Create your account
        </h2>
        <p className="login-tagline" style={{ marginBottom: 24 }}>
          Agency Intelligence Platform — insights powered by live data
        </p>

        <form onSubmit={handleSignup} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Row 1: Full Name + Agency */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5, display: 'block' }}>
                Full Name *
              </label>
              <input
                type="text"
                placeholder="Sarah Jenkins"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                autoComplete="name"
                style={{ width: '100%' }}
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5, display: 'block' }}>
                Agency / Company *
              </label>
              <input
                type="text"
                placeholder="Wunderman Thompson"
                value={agency}
                onChange={e => setAgency(e.target.value)}
                required
                autoComplete="organization"
                style={{ width: '100%' }}
              />
            </div>
          </div>

          {/* Row 2: Work Email */}
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5, display: 'block' }}>
              Work Email *
            </label>
            <input
              type="email"
              placeholder="sarah@agency.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          {/* Row 3: Password with show/hide toggle */}
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5, display: 'block' }}>
              Password *
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPwd ? 'text' : 'password'}
                placeholder="Min. 6 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                style={{ paddingRight: 44 }}
              />
              <button
                type="button"
                onClick={() => setShowPwd(p => !p)}
                style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', fontSize: 14,
                  color: '#6B7280', padding: 0, lineHeight: 1,
                }}
              >
                {showPwd ? '🙈' : '👁️'}
              </button>
            </div>
            {password.length > 0 && (
              <div style={{ marginTop: 6, display: 'flex', gap: 3 }}>
                {[1,2,3,4].map(i => (
                  <div key={i} style={{
                    flex: 1, height: 3, borderRadius: 2,
                    background: password.length >= i * 3
                      ? (password.length >= 10 ? '#059669' : password.length >= 6 ? '#D97706' : '#EF4444')
                      : '#E5E7EB',
                    transition: 'background 0.2s',
                  }} />
                ))}
                <span style={{ fontSize: 10, color: '#6B7280', marginLeft: 6, alignSelf: 'center' }}>
                  {password.length >= 10 ? 'Strong' : password.length >= 6 ? 'Fair' : 'Weak'}
                </span>
              </div>
            )}
          </div>

          {error && (
            <div style={{
              background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B',
              padding: '8px 12px', borderRadius: 8, fontSize: 12,
            }}>
              {error}
            </div>
          )}

          <button className="btn btn-primary btn-full" type="submit" disabled={busy} style={{ marginTop: 2 }}>
            {busy ? 'Creating Account…' : 'Create Account →'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#6B7280' }}>
          Already have an account?{' '}
          <Link href="/login" style={{ color: '#2563EB', fontWeight: 600, textDecoration: 'none' }}>
            Sign In
          </Link>
        </div>

        <div style={{
          marginTop: 20, padding: '10px 14px',
          background: '#F8FAFC', borderRadius: 10,
          border: '1px solid #E2E8F0', fontSize: 11, color: '#64748B', textAlign: 'center',
        }}>
          🔒 Your data is encrypted and never shared with third parties.
        </div>
      </div>
    </div>
  );
}
