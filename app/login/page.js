'use client';
import { useRouter } from 'next/navigation';

export default function Login() {
  const router = useRouter();

  const handleLogin = () => {
    router.push('/dashboard');
  };

  return (
    <div className="screen screen-login fade-in">
      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-icon">P</div>
          <div className="login-logo-text">PRISM</div>
        </div>
        <p className="login-tagline">Agency Intelligence Platform — insights powered by live data</p>
        
        <div className="form-group">
          <label>Work Email</label>
          <input type="email" defaultValue="sarah@wunderman.com" />
        </div>
        
        <div className="form-group">
          <label>Password</label>
          <input type="password" defaultValue="demo1234" />
        </div>
        
        <button className="btn btn-primary btn-full" onClick={handleLogin}>
          Sign In to PRISM →
        </button>
        
        <div className="demo-hint">
          🔑 <strong>Demo credentials</strong><br />
          sarah@wunderman.com &nbsp;/&nbsp; demo1234
        </div>
      </div>
    </div>
  );
}
