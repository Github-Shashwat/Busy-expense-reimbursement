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

const statusStyles: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700 ring-slate-500/20',
  submitted: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  approved: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  paid: 'bg-violet-50 text-violet-700 ring-violet-600/20',
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
        json: {
          title,
          period_start: start,
          period_end: end,
        },
      });

      setTitle('');
      setStart('');
      setEnd('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create report');
    }
  }

  return (
    <div className="space-y-7">
      {/* Page heading */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Reimbursements
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
            My reports
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Create drafts, add expenses, then submit them for approval.
          </p>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-600">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Show archived
        </label>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Create report */}
      {!archived && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="font-semibold text-slate-900">Create a report</h2>
            <p className="mt-1 text-xs text-slate-500">
              Start a draft and add expense lines from the report detail page.
            </p>
          </div>

          <form
            onSubmit={create}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            <div className="lg:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Report title
              </label>
              <input
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                placeholder="e.g. September client travel"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Start date
              </label>
              <input
                type="date"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                End date
              </label>
              <input
                type="date"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                required
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-4">
              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
              >
                New draft report
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Reports table */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="font-semibold text-slate-900">
              {archived ? 'Archived reports' : 'Your reports'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {items.length} {items.length === 1 ? 'report' : 'reports'}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Report</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Period</th>
                <th className="px-5 py-3 text-right">Total</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {items.map((report) => (
                <tr
                  key={report.id}
                  className="transition-colors hover:bg-slate-50/70"
                >
                  <td className="px-5 py-4">
                    <Link
                      to={`/reports/${report.id}`}
                      state={{ from: '/reports' }}
                      className="font-medium text-slate-900 hover:text-blue-700"
                    >
                      {report.title}
                    </Link>
                    <div className="mt-0.5 text-xs text-slate-400">
                      Report #{report.id}
                    </div>
                  </td>

                  <td className="px-5 py-4">
                    <span
                      className={[
                        'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ring-inset',
                        statusStyles[report.status] ??
                          'bg-slate-100 text-slate-700 ring-slate-500/20',
                      ].join(' ')}
                    >
                      {report.status}
                    </span>
                  </td>

                  <td className="px-5 py-4 whitespace-nowrap text-slate-600">
                    {report.period_start} → {report.period_end}
                  </td>

                  <td className="px-5 py-4 text-right font-semibold text-slate-900">
                    {money(report.total_cents)}
                  </td>
                </tr>
              ))}

              {items.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-5 py-12 text-center"
                  >
                    <div className="text-sm font-medium text-slate-700">
                      {archived
                        ? 'No archived reports'
                        : 'No reports yet'}
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      {!archived &&
                        'Create your first draft using the form above.'}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
