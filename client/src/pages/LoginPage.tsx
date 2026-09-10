import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth';

export function LoginPage() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState('alice@demo.com');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <h1 className="mb-1 text-2xl font-semibold">Expense Reimbursement</h1>
      <p className="mb-6 text-sm text-slate-600">Sign in to submit and approve expense reports.</p>
      <form onSubmit={onSubmit} className="space-y-3 rounded border border-slate-200 bg-white p-5 shadow-sm">
        {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <label className="block text-sm">
          Email
          <input
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
          />
        </label>
        <label className="block text-sm">
          Password
          <input
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
          />
        </label>
        <button
          disabled={busy}
          className="w-full rounded bg-slate-900 px-3 py-2 text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="mt-4 text-xs text-slate-500">
        Demo: alice@demo.com / bob@demo.com (employees), cara@demo.com / dan@demo.com (approvers). Password:{' '}
        password123
      </p>
    </div>
  );
}
