import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, money } from '../api';

type Report = {
  id: number;
  title: string;
  status: string;
  total_cents: number;
  period_start: string;
  period_end: string;
  submitted_at: string | null;
  archived_at: string | null;
};

export function MyReportsPage() {
  const [items, setItems] = useState<Report[]>([]);
  const [archived, setArchived] = useState(false);
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const data = await api<{ items: Report[] }>(
      `/api/reports?mine=1&archived=${archived ? '1' : '0'}&sort=created_at&order=desc&pageSize=50`,
    );
    setItems(data.items);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [archived]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/api/reports', {
        method: 'POST',
        json: { title, period_start: start, period_end: end },
      });
      setTitle('');
      setStart('');
      setEnd('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">My reports</h1>
          <p className="text-sm text-slate-600">Create drafts, edit lines, then submit for approval.</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
          Show archived
        </label>
      </div>

      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {!archived && (
        <form onSubmit={create} className="grid gap-3 rounded border border-slate-200 bg-white p-4 sm:grid-cols-4">
          <input
            className="rounded border border-slate-300 px-3 py-2 sm:col-span-2"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <input
            type="date"
            className="rounded border border-slate-300 px-3 py-2"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            required
          />
          <input
            type="date"
            className="rounded border border-slate-300 px-3 py-2"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            required
          />
          <button className="rounded bg-slate-900 px-3 py-2 text-white sm:col-span-4 sm:w-fit">
            New draft report
          </button>
        </form>
      )}

      <div className="overflow-x-auto rounded border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Period</th>
              <th className="px-3 py-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-3 py-2">
                  <Link className="text-blue-700 hover:underline" to={`/reports/${r.id}`}>
                    {r.title}
                  </Link>
                </td>
                <td className="px-3 py-2 capitalize">{r.status}</td>
                <td className="px-3 py-2">
                  {r.period_start} → {r.period_end}
                </td>
                <td className="px-3 py-2">{money(r.total_cents)}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                  No reports
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
