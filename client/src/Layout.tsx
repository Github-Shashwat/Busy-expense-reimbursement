import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from './api';
import { useAuth } from './auth';

export function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();

  const from =
    (location.state as { from?: string } | null)?.from ?? null;

  const isReportDetail = /^\/reports\/\d+$/.test(location.pathname);
  const [alertCount, setAlertCount] = useState(0);

  useEffect(() => {
    if (user?.role !== 'approver') return;

    function refresh() {
      api<{ count: number }>('/api/alerts')
        .then((d) => setAlertCount(d.count))
        .catch(() => setAlertCount(0));
    }

    refresh();
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, [user]);

  const link = ({ isActive }: { isActive: boolean }) =>
    [
      'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
      isActive
        ? 'bg-slate-900 text-white shadow-sm'
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
    ].join(' ');

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center gap-6 px-5">
          <Link to="/" className="shrink-0">
            <div className="text-base font-bold tracking-tight text-slate-950">
              Expense Reimbursement
            </div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Finance workspace
            </div>
          </Link>

          <nav className="flex items-center gap-1 overflow-x-auto">
            <NavLink to="/" end className={link}>
              Dashboard
            </NavLink>

            <NavLink
              to="/reports"
              end
              className={() =>
                link({
                  isActive:
                    location.pathname === '/reports' ||
                    (isReportDetail && from === '/reports'),
                })
              }
            >
              My reports
            </NavLink>

            {user?.role === 'approver' && (
              <>
                <NavLink
                  to="/queue"
                  className={() =>
                    link({
                      isActive:
                        location.pathname === '/queue' ||
                        (isReportDetail && from === '/queue'),
                    })
                  }
                >
                  Approver queue
                </NavLink>

                <NavLink
                  to="/find"
                  className={() =>
                    link({
                      isActive:
                        location.pathname === '/find' ||
                        (isReportDetail && from === '/find'),
                    })
                  }
                >
                  Find reports
                </NavLink>
                <NavLink
                  to="/alerts"
                  className={() =>
                    link({
                      isActive:
                        location.pathname === '/alerts' ||
                        (isReportDetail && from === '/alerts'),
                    })
                  }
                >
                  <span className="flex items-center gap-2">
                    Alerts
                    {alertCount > 0 && (
                      <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-700">
                        {alertCount}
                      </span>
                    )}
                  </span>
                </NavLink>
              </>
            )}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium text-slate-800">
                {user?.name}
              </div>
              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                {user?.role}
              </div>
            </div>

            <button
              type="button"
              onClick={logout}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-8">
        <Outlet />
      </main>
    </div>
  );
}
