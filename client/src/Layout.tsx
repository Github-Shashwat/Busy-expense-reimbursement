import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from './auth';

export function Layout() {
  const { user, logout } = useAuth();

  const link = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 rounded text-sm ${
      isActive
        ? 'bg-slate-800 text-white'
        : 'text-slate-700 hover:bg-slate-200'
    }`;

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <Link
            to="/"
            className="mr-2 font-semibold tracking-tight text-slate-900"
          >
            Expense Reimbursement
          </Link>

          <NavLink to="/" end className={link}>
            Home
          </NavLink>

          <NavLink to="/reports" className={link}>
            My reports
          </NavLink>

          <div className="ml-auto flex items-center gap-3 text-sm text-slate-600">
            <span>
              {user?.name} · {user?.role}
            </span>

            <button
              type="button"
              onClick={logout}
              className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-100"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}