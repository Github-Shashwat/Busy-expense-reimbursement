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
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Stale approval alerts</h1>
        <p className="text-sm text-slate-600">
          Submitted reports waiting more than {meta.staleDays} days. Dismiss hides an alert for{' '}
          {meta.redismissDays} days; it returns if still undecided.
        </p>
      </div>
      {error && <p className="text-red-600">{error}</p>}
      {msg && <p className="text-emerald-700">{msg}</p>}

      <ul className="space-y-3">
        {items.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded border border-amber-200 bg-amber-50 p-4">
            <div>
              <Link to={`/reports/${a.id}`} className="font-medium text-blue-800 hover:underline">
                {a.title}
              </Link>
              <div className="text-sm text-slate-700">
                {a.owner_name} · {money(a.total_cents)} · waiting {a.days_waiting} days (since {a.submitted_at})
              </div>
            </div>
            <button
              className="rounded border border-amber-400 bg-white px-3 py-1.5 text-sm"
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
          </li>
        ))}
        {items.length === 0 && <p className="text-slate-500">No stale alerts for reports assigned to you.</p>}
      </ul>
    </div>
  );
}
