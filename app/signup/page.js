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
  const [sent,     setSent]     = useState(false); // success state

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
      const res = await fetch('/api/auth/register', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name, agency, email, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      // Instant-signup mode: server set a session cookie, land on /dashboard.
      // Legacy verify-first mode: show the "check your inbox" screen.
      if (body.mode === 'instant' || body.redirectTo) {
        router.replace(body.redirectTo || '/dashboard');
        return;
      }
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // ── Success state ────────────────────────────────────────────────────────────
  if (sent) {
    return (
      <div className="screen screen-login fade-in">
        <div className="login-card" style={{ maxWidth: 420, textAlign: 'center' }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>📬</div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#111827', marginBottom: 8 }}>
            Check your inbox
          </h2>
          <p style={{ fontSize: 14, color: '#6B7280', lineHeight: 1.7, marginBottom: 24 }}>
            We've sent a verification link to <strong style={{ color: '#111827' }}>{email}</strong>.
            <br />Click the link in that email to activate your account and sign in.
          </p>
          <div style={{
            background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 12,
            padding: '14px 18px', marginBottom: 24, fontSize: 13, color: '#1D4ED8',
          }}>
            ⏰ The link expires in <strong>24 hours</strong>.
            Check your spam folder if you don't see it.
          </div>
          <button
            className="btn btn-outline"
            style={{ width: '100%', justifyContent: 'center', marginBottom: 12 }}
            onClick={() => { setSent(false); setError(null); }}
          >
            ← Use a different email
          </button>
          <div style={{ fontSize: 13, color: '#6B7280' }}>
            Already verified?{' '}
            <Link href="/login" style={{ color: '#2563EB', fontWeight: 600, textDecoration: 'none' }}>
              Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Sign-up form ─────────────────────────────────────────────────────────────
  const pwdStrength = password.length === 0 ? null : password.length >= 10 ? 'strong' : password.length >= 6 ? 'fair' : 'weak';
  const pwdColor    = { strong: '#059669', fair: '#D97706', weak: '#EF4444' };

  return (
    <div className="screen screen-login fade-in">
      <div className="login-card" style={{ maxWidth: 420 }}>
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

          {/* Name + Agency side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Full Name *</label>
              <input
                type="text"
                placeholder="Sarah Jenkins"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                autoComplete="name"
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Agency / Company *</label>
              <input
                type="text"
                placeholder="Wunderman Thompson"
                value={agency}
                onChange={e => setAgency(e.target.value)}
                required
                autoComplete="organization"
              />
            </div>
          </div>

          {/* Work Email */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Work Email *</label>
            <input
              type="email"
              placeholder="sarah@agency.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          {/* Password with show/hide + strength meter */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Password *</label>
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
                  color: '#9CA3AF', padding: 0, lineHeight: 1,
                }}
              >
                {showPwd ? '🙈' : '👁️'}
              </button>
            </div>
            {pwdStrength && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                {['weak','fair','strong'].map((lvl, i) => (
                  <div key={lvl} style={{
                    flex: 1, height: 3, borderRadius: 2,
                    background: ['strong','fair'].includes(pwdStrength) && i <= 1 ? pwdColor[pwdStrength] :
                                pwdStrength === 'strong' && i === 2 ? pwdColor.strong : '#E5E7EB',
                    transition: 'background 0.2s',
                  }} />
                ))}
                <span style={{ fontSize: 10, color: pwdColor[pwdStrength], fontWeight: 700, marginLeft: 2 }}>
                  {pwdStrength.charAt(0).toUpperCase() + pwdStrength.slice(1)}
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
            {busy ? 'Sending verification email…' : 'Create Account →'}
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
          🔒 Your data is encrypted. We'll send you a one-time verification link.
        </div>
      </div>
    </div>
  );
}
