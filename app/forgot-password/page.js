'use client';
import { useState } from 'react';
import Link from 'next/link';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [busy,  setBusy]  = useState(false);
  const [sent,  setSent]  = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e?.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await fetch('/api/auth/forgot-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="screen screen-login fade-in">
        <div className="login-card" style={{ maxWidth: 420, textAlign: 'center' }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>📬</div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#111827', marginBottom: 8 }}>Check your inbox</h2>
          <p style={{ fontSize: 14, color: '#6B7280', lineHeight: 1.7, marginBottom: 24 }}>
            If an account exists for <strong style={{ color: '#111827' }}>{email}</strong>, we've sent a reset link.
            <br />The link expires in 1 hour.
          </p>
          <Link href="/login" className="btn btn-outline" style={{ width: '100%', justifyContent: 'center', textDecoration: 'none' }}>
            ← Back to Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="screen screen-login fade-in">
      <div className="login-card" style={{ maxWidth: 420 }}>
        <div className="login-logo">
          <div className="login-logo-icon">P</div>
          <div className="login-logo-text">PRISM</div>
        </div>
        <h2 style={{ textAlign: 'center', marginBottom: 4, color: '#111827', fontSize: 20, fontWeight: 800 }}>
          Reset your password
        </h2>
        <p className="login-tagline" style={{ marginBottom: 24 }}>
          Enter the email you signed up with — we'll send a reset link.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Work Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@agency.com"
              required
              autoComplete="email"
            />
          </div>

          {error && (
            <div style={{
              background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B',
              padding: '8px 12px', borderRadius: 8, fontSize: 12,
            }}>{error}</div>
          )}

          <button className="btn btn-primary btn-full" type="submit" disabled={busy}>
            {busy ? 'Sending…' : 'Send Reset Link →'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#6B7280' }}>
          Remembered it?{' '}
          <Link href="/login" style={{ color: '#2563EB', fontWeight: 600, textDecoration: 'none' }}>
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
