import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money } from '../api';

type AlertItem = {
  id: number;
  title: string;
  owner_name: string;
  total_cents: number;
  submitted_at: string;
  days_waiting: number;
};

const secondaryButtonClass =
  'rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200';

export function AlertsPage() {
  const [items, setItems] = useState<AlertItem[]>([]);
  const [meta, setMeta] = useState({ staleDays: 7, redismissDays: 3 });
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    const data = await api<{ items: AlertItem[]; staleDays: number; redismissDays: number }>('/api/alerts');
    setItems(data.items);
    setMeta({ staleDays: data.staleDays, redismissDays: data.redismissDays });
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  return (
    <div className="space-y-7">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          Attention center
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
          Alerts
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Submitted approvals waiting more than {meta.staleDays} days need attention. Dismiss hides an alert for{' '}
          {meta.redismissDays} days; it returns if still undecided.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {msg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {msg}
        </div>
      )}

      <ul className="space-y-3">
        {items.map((a) => (
          <li
            key={a.id}
            className="rounded-xl border border-amber-200 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                    {a.days_waiting} days waiting
                  </span>
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-600/20">
                    Submitted
                  </span>
                </div>

                <Link
                  to={`/reports/${a.id}`}
                  state={{ from: '/alerts' }}
                  className="mt-3 block truncate text-base font-semibold text-slate-950 transition hover:text-blue-700"
                >
                  {a.title}
                </Link>

                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                  <span>{a.owner_name}</span>
                  <span className="font-semibold text-slate-900">{money(a.total_cents)}</span>
                  <span>Submitted {a.submitted_at}</span>
                  <span>Assigned approval route</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  to={`/reports/${a.id}`}
                  state={{ from: '/alerts' }}
                  className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
                >
                  View report
                </Link>
                <button
                  className={secondaryButtonClass}
                  onClick={async () => {
                    try {
                      await api(`/api/alerts/${a.id}/dismiss`, { method: 'POST' });
                      setMsg(`Dismissed alert for #${a.id}`);
                      await load();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Failed');
                    }
                  }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          </li>
        ))}
        {items.length === 0 && (
          <li className="rounded-xl border border-slate-200 bg-white px-5 py-12 text-center shadow-sm">
            <div className="text-sm font-semibold text-slate-800">You're all caught up</div>
            <p className="mt-1 text-xs text-slate-500">
              No stale approvals need your attention.
            </p>
          </li>
        )}
      </ul>
    </div>
  );
}
