'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function Signup() {
  const router = useRouter();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [name,     setName]     = useState('');
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
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/auth/login', { // Reusing login endpoint which does upsert
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
        <h2 style={{ textAlign: 'center', marginBottom: 8, color: '#111827' }}>Create Account</h2>
        <p className="login-tagline" style={{ marginBottom: 24 }}>Join the PRISM Agency Intelligence Platform</p>

        <form onSubmit={handleSignup}>
          <div className="form-group">
            <label>Full Name</label>
            <input 
              type="text" 
              placeholder="Sarah Jenkins"
              value={name} 
              onChange={e => setName(e.target.value)} 
              required 
            />
          </div>
          <div className="form-group">
            <label>Work Email</label>
            <input 
              type="email" 
              placeholder="sarah@agency.com"
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              required 
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input 
              type="password" 
              placeholder="••••••••"
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              required
            />
          </div>
          {error && (
            <div style={{
              background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B',
              padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 10,
            }}>{error}</div>
          )}
          <button className="btn btn-primary btn-full" type="submit" disabled={busy}>
            {busy ? 'Creating Account…' : 'Create Account →'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#6B7280' }}>
          Already have an account? <Link href="/login" style={{ color: '#2563EB', fontWeight: 600, textDecoration: 'none' }}>Sign In</Link>
        </div>
      </div>
    </div>
  );
}
