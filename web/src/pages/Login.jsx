import { useState } from 'react';
import { useAuth } from '../AuthContext.jsx';
import { Logo } from '../components/ui.jsx';

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await login(username.trim(), password);
      // AuthProvider flips user → app re-renders into the dashboard.
    } catch (e2) {
      setErr(e2?.message || 'Login failed.');
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg text-ink flex items-center justify-center p-6">
      <div className="w-full max-w-[400px]">
        <div className="flex items-center justify-center gap-3 mb-8">
          <Logo size={40} />
          <span className="font-display text-2xl font-extrabold tracking-tight">Parley</span>
        </div>

        <div className="card p-7">
          <h1 className="font-display text-[22px] font-extrabold leading-tight mb-1">Sign in</h1>
          <p className="text-sm text-muted mb-6">Enter your credentials to access the dashboard.</p>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-[13px] font-medium text-ink mb-1.5">Username</label>
              <input
                className="input" value={username} autoFocus autoComplete="username"
                onChange={(e) => setUsername(e.target.value)} placeholder="admin" />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-ink mb-1.5">Password</label>
              <input
                className="input" type="password" value={password} autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
            {err && <p className="text-sm text-error bg-error-soft rounded-sm px-3 py-2">{err}</p>}
            <button type="submit" disabled={busy || !username.trim() || !password}
              className="btn btn-primary !py-2.5 w-full justify-center">
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-[11px] text-faint text-center leading-relaxed mt-5">
          First time? The default account is <code className="text-muted">admin</code> / <code className="text-muted">admin</code>.
          Change it from Settings after you sign in.
        </p>
      </div>
    </div>
  );
}
