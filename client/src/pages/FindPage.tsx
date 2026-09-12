import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money } from '../api';

type Report = {
  id: number;
  title: string;
  status: string;
  owner_id: number;
  owner_name: string;
  total_cents: number;
  submitted_at: string | null;
};

type UserOpt = { id: number; name: string; email: string };

const statusStyles: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700 ring-slate-500/20',
  submitted: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  approved: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  paid: 'bg-violet-50 text-violet-700 ring-violet-600/20',
};

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200';

const secondaryButtonClass =
  'rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-45';

function statusBadge(status: string) {
  return [
    'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ring-inset',
    statusStyles[status] ?? 'bg-slate-100 text-slate-700 ring-slate-500/20',
  ].join(' ');
}

export function FindPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [approverId, setApproverId] = useState('');
  const [sort, setSort] = useState('submitted_at');
  const [order, setOrder] = useState('desc');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<Report[]>([]);
  const [approvers, setApprovers] = useState<UserOpt[]>([]);
  const [owners, setOwners] = useState<UserOpt[]>([]);
  const [error, setError] = useState('');
  const pageSize = 10;

  useEffect(() => {
    api<{ approvers: UserOpt[] }>('/api/auth/approvers').then((d) => setApprovers(d.approvers));
    api<{ users: UserOpt[] }>('/api/auth/users').then((d) => setOwners(d.users));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      sort,
      order,
    });
    if (q) params.set('q', q);
    if (status) params.set('status', status);
    if (ownerId) params.set('ownerId', ownerId);
    if (approverId) params.set('approverId', approverId);

    api<{ items: Report[]; total: number }>(`/api/reports?${params}`)
      .then((d) => {
        setItems(d.items);
        setTotal(d.total);
      })
      .catch((e) => setError(e.message));
  }, [q, status, ownerId, approverId, sort, order, page]);

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-7">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          Search
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
          Find reports
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Search and filter reimbursement reports across owners, approvers, status, and submission date.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="font-semibold text-slate-900">Search filters</h2>
          <p className="mt-1 text-xs text-slate-500">
            Results update from the server as filters change.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Search
            </span>
            <input
              className={inputClass}
              placeholder="Search by title"
              value={q}
              onChange={(e) => {
                setPage(1);
                setQ(e.target.value);
              }}
            />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Status
            </span>
            <select
              className={inputClass}
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value);
              }}
            >
              <option value="">Any status</option>
              {['draft', 'submitted', 'approved', 'paid'].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Owner
            </span>
            <select
              className={inputClass}
              value={ownerId}
              onChange={(e) => {
                setPage(1);
                setOwnerId(e.target.value);
              }}
            >
              <option value="">Any owner</option>
              {owners.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Approver
            </span>
            <select
              className={inputClass}
              value={approverId}
              onChange={(e) => {
                setPage(1);
                setApproverId(e.target.value);
              }}
            >
              <option value="">Any approver</option>
              {approvers.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Sort
            </span>
            <select
              className={inputClass}
              value={`${sort}:${order}`}
              onChange={(e) => {
                const [s, o] = e.target.value.split(':');
                setSort(s);
                setOrder(o);
              }}
            >
              <option value="submitted_at:desc">Submitted newest</option>
              <option value="submitted_at:asc">Submitted oldest</option>
              <option value="status:asc">Status</option>
              <option value="total:desc">Total high to low</option>
              <option value="total:asc">Total low to high</option>
            </select>
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="font-semibold text-slate-900">Results</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {total} match{total === 1 ? '' : 'es'} / page {page} of {pages}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3">Title</th>
              <th className="px-5 py-3">Owner</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 text-right">Total</th>
              <th className="px-5 py-3">Submitted</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((r) => (
              <tr key={r.id} className="transition-colors hover:bg-slate-50/70">
                <td className="px-5 py-4">
                  <Link
                    className="font-medium text-slate-900 transition hover:text-blue-700"
                    to={`/reports/${r.id}`}
                    state={{ from: '/find' }}
                  >
                    {r.title}
                  </Link>
                  <div className="mt-0.5 text-xs text-slate-400">Report #{r.id}</div>
                </td>
                <td className="px-5 py-4 text-slate-600">
                  {r.owner_name}
                  <div className="mt-0.5 text-xs text-slate-400">Owner #{r.owner_id}</div>
                </td>
                <td className="px-5 py-4">
                  <span className={statusBadge(r.status)}>{r.status}</span>
                </td>
                <td className="whitespace-nowrap px-5 py-4 text-right font-semibold text-slate-900">
                  {money(r.total_cents)}
                </td>
                <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                  {r.submitted_at || 'Not submitted'}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center">
                  <div className="text-sm font-medium text-slate-700">
                    No reports match these filters
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    Adjust the search or filters to broaden the results.
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
