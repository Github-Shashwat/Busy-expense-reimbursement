import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money } from '../api';

type Report = {
  id: number;
  title: string;
  status: string;
  owner_name: string;
  total_cents: number;
  submitted_at: string | null;
};

const inputClass =
  'rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200';

const secondaryButtonClass =
  'rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-45';

export function QueuePage() {
  const [assignedOnly, setAssignedOnly] = useState(false);
  const [items, setItems] = useState<Report[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number[]>([]);
  const [reason, setReason] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const pageSize = 20;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  async function load() {
    const q = new URLSearchParams({
      status: 'submitted',
      sort: 'submitted_at',
      order: 'asc',
      page: String(page),
      pageSize: String(pageSize),
    });
    if (assignedOnly) q.set('assignedToMe', '1');
    const data = await api<{ items: Report[]; total: number }>(`/api/reports?${q}`);
    setItems(data.items);
    setTotal(data.total);
    setSelected([]);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [assignedOnly, page]);

  function toggle(id: number) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function bulk(action: 'approve' | 'reject') {
    setError('');
    setResult('');
    try {
      const data = await api<{
        results: { reportId: number; ok: boolean; error?: string; code?: string }[];
      }>('/api/reports/bulk-decide', {
        method: 'POST',
        json:
          action === 'reject'
            ? { reportIds: selected, action, reason }
            : { reportIds: selected, action },
      });
      setResult(
        data.results
          .map((r) =>
            r.ok
              ? `#${r.reportId}: ok`
              : `#${r.reportId}: ${r.code === 'self_owner' ? 'blocked (you own this report)' : r.error}`,
          )
          .join('\n'),
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  async function exportCsv() {
    const token = localStorage.getItem('token');
    const base = import.meta.env.VITE_API_URL || '';
    const res = await fetch(`${base}/api/exports/reimbursements-due.csv`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      setError('Export failed');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'reimbursements-due.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Approvals
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
            Approver queue
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Review submitted reports, decide in bulk, and export approved reimbursements for payment.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {result && (
        <pre className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {result}
        </pre>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">Queue controls</h2>
            <p className="mt-1 text-xs text-slate-500">
              Filter your assigned decisions or act on selected submitted reports.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300"
              checked={assignedOnly}
              onChange={(e) => {
                setPage(1);
                setAssignedOnly(e.target.checked);
              }}
            />
            Assigned to me only
            </label>

            <button className={secondaryButtonClass} onClick={exportCsv}>
              Export reimbursements due (CSV)
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <button
            disabled={!selected.length}
            className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-45"
            onClick={() => bulk('approve')}
          >
            Bulk approve ({selected.length})
          </button>
          <label className="sr-only" htmlFor="bulk-reject-reason">
            Bulk reject reason
          </label>
          <input
            id="bulk-reject-reason"
            className={`${inputClass} w-64 max-w-full`}
            placeholder="Reason for bulk rejection"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <button
            disabled={!selected.length || !reason.trim()}
            className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-200 disabled:cursor-not-allowed disabled:opacity-45"
            onClick={() => bulk('reject')}
          >
            Bulk reject
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="font-semibold text-slate-900">Submitted reports</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {total} submitted / page {page} of {pages}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-12 px-5 py-3" />
              <th className="px-5 py-3">Title</th>
              <th className="px-5 py-3">Owner</th>
              <th className="px-5 py-3">Submitted</th>
              <th className="px-5 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((r) => (
              <tr key={r.id} className="transition-colors hover:bg-slate-50/70">
                <td className="px-5 py-4 align-middle">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300"
                    checked={selected.includes(r.id)}
                    onChange={() => toggle(r.id)}
                  />
                </td>
                <td className="px-5 py-4">
                  <Link
                    className="font-medium text-slate-900 transition hover:text-blue-700"
                    to={`/reports/${r.id}`}
                    state={{ from: '/queue' }}
                  >
                    {r.title}
                  </Link>
                  <div className="mt-0.5 text-xs text-slate-400">Report #{r.id}</div>
                </td>
                <td className="px-5 py-4 text-slate-600">{r.owner_name}</td>
                <td className="whitespace-nowrap px-5 py-4 text-slate-600">{r.submitted_at}</td>
                <td className="whitespace-nowrap px-5 py-4 text-right font-semibold text-slate-900">
                  {money(r.total_cents)}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center">
                  <div className="text-sm font-medium text-slate-700">Queue empty</div>
                  <p className="mt-1 text-xs text-slate-400">
                    No submitted reports are waiting in this view.
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </section>

      <div className="flex gap-2">
        <button
          className={secondaryButtonClass}
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous
        </button>
        <button
          className={secondaryButtonClass}
          disabled={page >= pages}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
