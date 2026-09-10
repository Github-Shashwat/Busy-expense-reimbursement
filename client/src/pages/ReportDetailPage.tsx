import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, CATEGORIES, money } from '../api';

type Line = {
  id: number;
  spent_on: string;
  amount_cents: number;
  category: string;
  description: string;
};

type Report = {
  id: number;
  title: string;
  status: string;
  owner_id: number;
  owner_name: string;
  period_start: string;
  period_end: string;
  total_cents: number;
  archived_at: string | null;
  lines: Line[];
};

const emptyLine = { spent_on: '', amount: '', category: 'travel', description: '' };

export function ReportDetailPage() {
  const { id } = useParams();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [line, setLine] = useState(emptyLine);
  const [editingLineId, setEditingLineId] = useState<number | null>(null);

  async function load() {
    const data = await api<{ report: Report }>(`/api/reports/${id}`);
    setReport(data.report);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [id]);

  if (!report) return <p className="text-slate-500">{error || 'Loading…'}</p>;

  const isDraft = report.status === 'draft';
  const canEditDraft = isDraft && !report.archived_at;

  async function run(fn: () => Promise<unknown>, successMsg?: string) {
    setError('');
    setMsg('');
    try {
      await fn();
      await load();
      if (successMsg) setMsg(successMsg);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  function post(path: string, json?: unknown) {
    return api(path, { method: 'POST', json });
  }

  async function addLine(e: FormEvent) {
    e.preventDefault();
    const payload = {
      spent_on: line.spent_on,
      amount_cents: Math.round(Number(line.amount) * 100),
      category: line.category,
      description: line.description,
    };

    await run(async () => {
      if (editingLineId) {
        await api(`/api/reports/${id}/lines/${editingLineId}`, { method: 'PATCH', json: payload });
      } else {
        await post(`/api/reports/${id}/lines`, payload);
      }
      setLine(emptyLine);
      setEditingLineId(null);
    }, editingLineId ? 'Line updated' : 'Line added');
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/reports" className="text-sm text-blue-700 hover:underline">← Back</Link>
        <h1 className="mt-2 text-xl font-semibold">{report.title}</h1>
        <p className="text-sm text-slate-600">
          {report.owner_name} · <span className="capitalize">{report.status}</span> · {money(report.total_cents)} ·{' '}
          {report.period_start} → {report.period_end}
        </p>
      </div>

      {canEditDraft && (
        <form
          className="grid gap-2 rounded border border-slate-200 bg-white p-4 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run(
              () =>
                api(`/api/reports/${id}`, {
                  method: 'PATCH',
                  json: {
                    title: String(fd.get('title') || ''),
                    period_start: String(fd.get('period_start') || ''),
                    period_end: String(fd.get('period_end') || ''),
                  },
                }),
              'Report updated',
            );
          }}
        >
          <input name="title" className="rounded border px-2 py-1 sm:col-span-3" defaultValue={report.title} required />
          <input name="period_start" type="date" className="rounded border px-2 py-1" defaultValue={report.period_start} required />
          <input name="period_end" type="date" className="rounded border px-2 py-1" defaultValue={report.period_end} required />
          <button className="rounded border px-3 py-1 text-sm sm:w-fit">Save title / dates</button>
        </form>
      )}

      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {msg && <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</p>}

      <div className="flex flex-wrap gap-2">
        {(report.status === 'draft' || report.status === 'paid') && !report.archived_at && (
          <button className="rounded border px-3 py-1.5 text-sm" onClick={() => run(() => post(`/api/reports/${id}/archive`), 'Archived')}>
            Archive
          </button>
        )}
        {report.archived_at && (
          <button className="rounded border px-3 py-1.5 text-sm" onClick={() => run(() => post(`/api/reports/${id}/restore`), 'Restored')}>
            Restore
          </button>
        )}
      </div>

      <section className="rounded border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-medium">Expense lines</h2>
        <table className="mb-4 w-full text-left text-sm">
          <thead>
            <tr className="text-slate-500">
              <th className="py-1">Date</th>
              <th>Category</th>
              <th>Description</th>
              <th>Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {report.lines.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="py-1">{l.spent_on}</td>
                <td className="capitalize">{l.category}</td>
                <td>{l.description}</td>
                <td>{money(l.amount_cents)}</td>
                <td className="space-x-2">
                  {canEditDraft && (
                    <>
                      <button
                        className="text-blue-700"
                        onClick={() => {
                          setEditingLineId(l.id);
                          setLine({
                            spent_on: l.spent_on,
                            amount: String(l.amount_cents / 100),
                            category: l.category,
                            description: l.description,
                          });
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="text-red-600"
                        onClick={() => run(() => api(`/api/reports/${id}/lines/${l.id}`, { method: 'DELETE' }))}
                      >
                        Remove
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {canEditDraft && (
          <form onSubmit={addLine} className="grid gap-2 sm:grid-cols-5">
            <input type="date" className="rounded border px-2 py-1" value={line.spent_on} onChange={(e) => setLine({ ...line, spent_on: e.target.value })} required />
            <select className="rounded border px-2 py-1" value={line.category} onChange={(e) => setLine({ ...line, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input className="rounded border px-2 py-1 sm:col-span-2" placeholder="Description" value={line.description} onChange={(e) => setLine({ ...line, description: e.target.value })} required />
            <input className="rounded border px-2 py-1" placeholder="Amount (₹)" type="number" step="0.01" min="0" value={line.amount} onChange={(e) => setLine({ ...line, amount: e.target.value })} required />
            <button className="rounded bg-slate-800 px-3 py-1 text-white sm:col-span-5 sm:w-fit">
              {editingLineId ? 'Save line' : 'Add line'}
            </button>
            {editingLineId && (
              <button type="button" className="rounded border px-3 py-1 text-sm sm:w-fit" onClick={() => { setEditingLineId(null); setLine(emptyLine); }}>
                Cancel edit
              </button>
            )}
          </form>
        )}
      </section>
    </div>
  );
}
