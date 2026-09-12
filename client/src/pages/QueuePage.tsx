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
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Approver queue</h1>
          <p className="text-sm text-slate-600">Submitted reports awaiting a decision.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={assignedOnly}
              onChange={(e) => {
                setPage(1);
                setAssignedOnly(e.target.checked);
              }}
            />
            Assigned to me only
          </label>
          <button className="rounded border px-3 py-1.5 text-sm" onClick={exportCsv}>
            Export reimbursements due (CSV)
          </button>
        </div>
      </div>

      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {result && <pre className="whitespace-pre-wrap rounded bg-slate-100 px-3 py-2 text-sm">{result}</pre>}

      <div className="flex flex-wrap gap-2">
        <button
          disabled={!selected.length}
          className="rounded bg-emerald-700 px-3 py-1.5 text-sm text-white disabled:opacity-40"
          onClick={() => bulk('approve')}
        >
          Bulk approve ({selected.length})
        </button>
        <input
          className="rounded border px-2 py-1 text-sm"
          placeholder="Bulk reject reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <button
          disabled={!selected.length || !reason.trim()}
          className="rounded bg-red-700 px-3 py-1.5 text-sm text-white disabled:opacity-40"
          onClick={() => bulk('reject')}
        >
          Bulk reject
        </button>
      </div>

      <p className="text-sm text-slate-600">
        {total} submitted · page {page} of {pages}
      </p>

      <div className="overflow-x-auto rounded border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-slate-50">
            <tr>
              <th className="px-3 py-2" />
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Owner</th>
              <th className="px-3 py-2">Submitted</th>
              <th className="px-3 py-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} className="border-b">
                <td className="px-3 py-2">
                  <input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggle(r.id)} />
                </td>
                <td className="px-3 py-2">
                  <Link className="text-blue-700 hover:underline" to={`/reports/${r.id}`}>
                    {r.title}
                  </Link>
                </td>
                <td className="px-3 py-2">{r.owner_name}</td>
                <td className="px-3 py-2">{r.submitted_at}</td>
                <td className="px-3 py-2">{money(r.total_cents)}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                  Queue empty
                </td>
              </tr>
            )}
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
