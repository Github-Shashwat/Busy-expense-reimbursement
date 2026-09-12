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
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Find reports</h1>
        <p className="text-sm text-slate-600">Server-side search, filters, sort, and pagination.</p>
      </div>

      {error && <p className="text-red-600">{error}</p>}

      <div className="grid gap-2 rounded border border-slate-200 bg-white p-4 sm:grid-cols-3 lg:grid-cols-6">
        <input
          className="rounded border px-2 py-1.5 text-sm sm:col-span-2"
          placeholder="Search title"
          value={q}
          onChange={(e) => {
            setPage(1);
            setQ(e.target.value);
          }}
        />
        <select
          className="rounded border px-2 py-1.5 text-sm"
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
        <select
          className="rounded border px-2 py-1.5 text-sm"
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
        <select
          className="rounded border px-2 py-1.5 text-sm"
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
        <select
          className="rounded border px-2 py-1.5 text-sm"
          value={`${sort}:${order}`}
          onChange={(e) => {
            const [s, o] = e.target.value.split(':');
            setSort(s);
            setOrder(o);
          }}
        >
          <option value="submitted_at:desc">Submitted ↓</option>
          <option value="submitted_at:asc">Submitted ↑</option>
          <option value="status:asc">Status</option>
          <option value="total:desc">Total ↓</option>
          <option value="total:asc">Total ↑</option>
        </select>
      </div>

      <p className="text-sm text-slate-600">
        {total} match{total === 1 ? '' : 'es'} · page {page} of {pages}
      </p>

      <div className="overflow-x-auto rounded border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-slate-50">
            <tr>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Owner</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Total</th>
              <th className="px-3 py-2">Submitted</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} className="border-b">
                <td className="px-3 py-2">
                  <Link className="text-blue-700 hover:underline" to={`/reports/${r.id}`}>
                    {r.title}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  {r.owner_name} (#{r.owner_id})
                </td>
                <td className="px-3 py-2 capitalize">{r.status}</td>
                <td className="px-3 py-2">{money(r.total_cents)}</td>
                <td className="px-3 py-2">{r.submitted_at || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2">
        <button
          className="rounded border px-3 py-1 text-sm disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous
        </button>
        <button
          className="rounded border px-3 py-1 text-sm disabled:opacity-40"
          disabled={page >= pages}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
