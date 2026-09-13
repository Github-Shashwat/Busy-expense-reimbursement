import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api, CATEGORIES, money } from '../api';
import { useAuth } from '../auth';

type Line = {
  id: number;
  spent_on: string;
  amount_cents: number;
  category: string;
  description: string;
  policy_warning: {
    category: string;
    limit_cents: number;
    message: string;
  } | null;
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
  approvers: { id: number; name: string; email: string }[];
};

const emptyLine = { spent_on: '', amount: '', category: 'travel', description: '' };

const statusStyles: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700 ring-slate-500/20',
  submitted: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  approved: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  paid: 'bg-violet-50 text-violet-700 ring-violet-600/20',
};

const eventStyles: Record<string, string> = {
  submitted: 'border-blue-200 bg-blue-50 text-blue-700 ring-blue-600/20',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  paid: 'border-violet-200 bg-violet-50 text-violet-700 ring-violet-600/20',
  draft: 'border-slate-200 bg-slate-100 text-slate-700 ring-slate-500/20',
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

function eventTitle(oldStatus: string | null, newStatus: string) {
  if (!oldStatus) return newStatus;
  return `${oldStatus} to ${newStatus}`;
}

export function ReportDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const location = useLocation();
  const backPath =
    (location.state as { from?: string } | null)?.from ?? '/reports';

  const backLabel =
    backPath === '/find'
      ? 'Back to find reports'
      : backPath === '/queue'
        ? 'Back to approver queue'
        : backPath === '/alerts'
          ? 'Back to alerts'
          : 'Back to my reports';
  const [report, setReport] = useState<Report | null>(null);
  const [history, setHistory] = useState<{ events: any[]; comments: any[] }>({ events: [], comments: [] });
  const [approverOptions, setApproverOptions] = useState<{ id: number; name: string }[]>([]);
  const [selectedApprovers, setSelectedApprovers] = useState<number[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [comment, setComment] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [line, setLine] = useState(emptyLine);
  const [editingLineId, setEditingLineId] = useState<number | null>(null);

  async function load() {
    const data = await api<{ report: Report }>(`/api/reports/${id}`);
    setReport(data.report);
    setSelectedApprovers(data.report.approvers.map((a) => a.id));
    setHistory(await api(`/api/reports/${id}/history`));
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
    api<{ approvers: { id: number; name: string }[] }>('/api/auth/approvers')
      .then((d) => setApproverOptions(d.approvers))
      .catch(() => {});
  }, [id]);

  if (!report) return <p className="text-slate-500">{error || 'Loading…'}</p>;

  const isOwner = user?.id === report.owner_id;
  const isDraft = report.status === 'draft';
  const isApprover = user?.role === 'approver';
  const canEditDraft = isOwner && isDraft && !report.archived_at;
  const canDecide = isApprover && !isOwner;

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
    <div className="space-y-7">
      {/* Back + report header */}
      <div>
        <Link
          to={backPath}
          className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition hover:text-slate-900"
        >
          ← {backLabel}
        </Link>

        <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-slate-950">
                {report.title}
              </h1>

              <span className={statusBadge(report.status)}>
                {report.status}
              </span>
            </div>

            <p className="mt-2 text-sm text-slate-500">
              {report.owner_name}
              <span className="mx-2 text-slate-300">•</span>
              {report.period_start} → {report.period_end}
            </p>
          </div>

          <div className="lg:text-right">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Report total
            </div>
            <div className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
              {money(report.total_cents)}
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
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

      {/* Report actions */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-slate-900">Report actions</h2>
            <p className="mt-1 text-xs text-slate-500">
              Available actions depend on the report status and your role.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canEditDraft && (
              <button
                className="rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                onClick={() =>
                  run(
                    () => post(`/api/reports/${id}/submit`),
                    'Submitted',
                  )
                }
              >
                Submit for approval
              </button>
            )}

            {isOwner &&
              !report.archived_at &&
              (isDraft || report.status === 'paid') && (
                <button
                  className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  onClick={() =>
                    run(
                      () => post(`/api/reports/${id}/archive`),
                      'Archived',
                    )
                  }
                >
                  Archive
                </button>
              )}

            {isOwner && report.archived_at && (
              <button
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                onClick={() =>
                  run(
                    () => post(`/api/reports/${id}/restore`),
                    'Restored',
                  )
                }
              >
                Restore
              </button>
            )}

            {canDecide && report.status === 'submitted' && (
              <>
                <button
                  className="rounded-lg bg-emerald-700 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800"
                  onClick={() =>
                    run(
                      () => post(`/api/reports/${id}/approve`),
                      'Approved',
                    )
                  }
                >
                  Approve
                </button>

                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-100 bg-red-50/60 p-2">
                  <label className="sr-only" htmlFor="reject-reason">
                    Rejection reason
                  </label>
                  <input
                    id="reject-reason"
                    className="h-9 w-56 rounded-lg border border-red-200 bg-white px-3 text-sm outline-none transition placeholder:text-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-100"
                    placeholder="Reason for returning to draft"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                  />

                  <button
                    className="rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-200"
                    onClick={() =>
                      run(
                        () =>
                          post(`/api/reports/${id}/reject`, {
                            reason: rejectReason,
                          }),
                        'Rejected to draft',
                      )
                    }
                  >
                    Reject
                  </button>
                </div>
              </>
            )}

            {canDecide && report.status === 'approved' && (
              <button
                className="rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                onClick={() =>
                  run(
                    () => post(`/api/reports/${id}/pay`),
                    'Marked paid',
                  )
                }
              >
                Mark as paid
              </button>
            )}

            {!canEditDraft &&
              !(isOwner && !report.archived_at && (isDraft || report.status === 'paid')) &&
              !(isOwner && report.archived_at) &&
              !(canDecide && report.status === 'submitted') &&
              !(canDecide && report.status === 'approved') && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-500">
                  No actions are available for this report right now.
                </div>
              )}
          </div>
        </div>
      </section>

      {/* Draft metadata editing */}
      {canEditDraft && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="font-semibold text-slate-900">Report details</h2>
            <p className="mt-1 text-xs text-slate-500">
              Update the report title or date range while it is still a draft.
            </p>
          </div>

          <form
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
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
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Title
              </label>
              <input
                name="title"
                className={inputClass}
                defaultValue={report.title}
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Start date
              </label>
              <input
                name="period_start"
                type="date"
                className={inputClass}
                defaultValue={report.period_start}
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                End date
              </label>
              <input
                name="period_end"
                type="date"
                className={inputClass}
                defaultValue={report.period_end}
                required
              />
            </div>

            <button
              type="submit"
              className={`${secondaryButtonClass} sm:w-fit`}
            >
              Save report details
            </button>
          </form>
        </section>
      )}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {/* Section header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="font-semibold text-slate-900">Expense lines</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {report.lines.length}{' '}
              {report.lines.length === 1 ? 'expense' : 'expenses'} recorded
            </p>
          </div>

          <div className="text-right">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Total
            </div>
            <div className="text-lg font-bold text-slate-950">
              {money(report.total_cents)}
            </div>
          </div>
        </div>

        {/* Expense table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3">Description</th>
                <th className="px-5 py-3 text-right">Amount</th>
                {canEditDraft && <th className="px-5 py-3 text-right">Actions</th>}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {report.lines.map((expense) => (
                <tr
                  key={expense.id}
                  className="transition-colors hover:bg-slate-50/60"
                >
                  <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                    {expense.spent_on}
                  </td>

                  <td className="px-5 py-4">
                    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize text-slate-700">
                      {expense.category}
                    </span>
                  </td>

                  <td className="max-w-xs px-5 py-4 text-slate-700">
                    <span className="line-clamp-2">
                      {expense.description}
                    </span>
                    {expense.policy_warning && (
                      <span className="mt-2 block text-xs font-medium text-amber-700">
                        {expense.policy_warning.message}
                      </span>
                    )}
                  </td>

                  <td className="whitespace-nowrap px-5 py-4 text-right font-semibold text-slate-900">
                    {money(expense.amount_cents)}
                  </td>

                  {canEditDraft && (
                    <td className="whitespace-nowrap px-5 py-4 text-right">
                      <div className="flex justify-end gap-3">
                        <button
                          type="button"
                          className="text-sm font-medium text-slate-600 transition hover:text-blue-700"
                          onClick={() => {
                            setEditingLineId(expense.id);
                            setLine({
                              spent_on: expense.spent_on,
                              amount: String(expense.amount_cents / 100),
                              category: expense.category,
                              description: expense.description,
                            });
                          }}
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          className="text-sm font-medium text-red-600 transition hover:text-red-700"
                          onClick={() =>
                            run(() =>
                              api(`/api/reports/${id}/lines/${expense.id}`, {
                                method: 'DELETE',
                              }),
                            )
                          }
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}

              {report.lines.length === 0 && (
                <tr>
                  <td
                    colSpan={canEditDraft ? 5 : 4}
                    className="px-5 py-10 text-center"
                  >
                    <div className="text-sm font-medium text-slate-700">
                      No expenses added yet
                    </div>

                    <p className="mt-1 text-xs text-slate-400">
                      {canEditDraft
                        ? 'Add your first expense using the form below.'
                        : 'This report does not contain any expense lines.'}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Add / edit expense */}
        {canEditDraft && (
          <div className="border-t border-slate-200 bg-slate-50/60 px-5 py-5">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-slate-900">
                {editingLineId ? 'Edit expense' : 'Add an expense'}
              </h3>

              <p className="mt-1 text-xs text-slate-500">
                Enter the expense details. The report total is calculated on the server.
              </p>
            </div>

            <form onSubmit={addLine} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Date
                </label>
                <input
                  type="date"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  value={line.spent_on}
                  onChange={(e) =>
                    setLine({ ...line, spent_on: e.target.value })
                  }
                  required
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Category
                </label>
                <select
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm capitalize outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  value={line.category}
                  onChange={(e) =>
                    setLine({ ...line, category: e.target.value })
                  }
                >
                  {CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2 lg:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Description
                </label>
                <input
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  placeholder="What was this expense for?"
                  value={line.description}
                  onChange={(e) =>
                    setLine({ ...line, description: e.target.value })
                  }
                  required
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Amount (₹)
                </label>
                <input
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  placeholder="0.00"
                  type="number"
                  step="0.01"
                  min="0"
                  value={line.amount}
                  onChange={(e) =>
                    setLine({ ...line, amount: e.target.value })
                  }
                  required
                />
              </div>

              <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-5">
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                >
                  {editingLineId ? 'Save expense' : 'Add expense'}
                </button>

                {editingLineId && (
                  <button
                    type="button"
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-white"
                    onClick={() => {
                      setEditingLineId(null);
                      setLine(emptyLine);
                    }}
                  >
                    Cancel edit
                  </button>
                )}
              </div>
            </form>
          </div>
        )}
      </section>

      {canEditDraft && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-900">Approval routing</h2>
              <p className="mt-1 text-xs text-slate-500">
                Choose who can review and decide this report.
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
              {selectedApprovers.length} {selectedApprovers.length === 1 ? 'approver' : 'approvers'} selected
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {approverOptions.map((a) => (
              <label
                key={a.id}
                className={[
                  'flex cursor-pointer items-start gap-3 rounded-xl border p-4 text-sm transition',
                  selectedApprovers.includes(a.id)
                    ? 'border-slate-900 bg-slate-50 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60',
                ].join(' ')}
              >
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-300"
                  checked={selectedApprovers.includes(a.id)}
                  onChange={(e) => {
                    setSelectedApprovers((prev) =>
                      e.target.checked ? [...prev, a.id] : prev.filter((x) => x !== a.id),
                    );
                  }}
                />
                <span>
                  <span className="block font-semibold text-slate-900">{a.name}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">Assigned approver</span>
                </span>
              </label>
            ))}
          </div>

          <button
            className="mt-4 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
            onClick={() =>
              run(async () => {
                const currentIds = report.approvers.map((a) => a.id);

                const toAdd = selectedApprovers.filter((approverId) => !currentIds.includes(approverId));
                const toRemove = currentIds.filter((approverId) => !selectedApprovers.includes(approverId));

                await Promise.all([
                  ...toAdd.map((approverId) =>
                    api(`/api/reports/${id}/approvers`, {
                      method: 'POST',
                      json: { approver_id: approverId },
                    }),
                  ),
                  ...toRemove.map((approverId) =>
                    api(`/api/reports/${id}/approvers/${approverId}`, {
                      method: 'DELETE',
                    }),
                  ),
                ]);
              }, 'Approvers updated')
            }
          >
            Save approvers
          </button>
        </section>
      )}

      {(!isDraft || report.archived_at) && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="font-semibold text-slate-900">Assigned approvers</h2>
            <p className="mt-1 text-xs text-slate-500">
              These reviewers are assigned to this report's approval route.
            </p>
          </div>
          {report.approvers.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {report.approvers.map((a) => (
                <span
                  key={a.id}
                  className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700"
                >
                  {a.name}
                </span>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
              No approvers are assigned to this report.
            </p>
          )}
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5">
          <h2 className="font-semibold text-slate-900">Activity / Timeline</h2>
          <p className="mt-1 text-xs text-slate-500">Immutable history</p>
        </div>

        <div className="space-y-5">
          <ol className="relative space-y-5 border-l border-slate-200 pl-5 text-sm">
            {history.events.map((ev) => (
              <li key={`e-${ev.id}`} className="relative">
                <span
                  className={[
                    'absolute -left-[29px] top-0.5 h-3.5 w-3.5 rounded-full border-2 ring-4 ring-white',
                    eventStyles[ev.new_status] ?? 'border-slate-200 bg-slate-100 text-slate-700 ring-slate-500/20',
                  ].join(' ')}
                />
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={statusBadge(ev.new_status)}>
                      {eventTitle(ev.old_status, ev.new_status)}
                    </span>
                  </div>
                  <div className="mt-2 text-sm font-medium text-slate-900">
                    {ev.actor_name}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {ev.created_at}
                  </div>
                  {ev.reason && (
                    <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                      {ev.reason}
                    </p>
                  )}
                </div>
              </li>
            ))}

            {history.comments.map((c) => (
              <li key={`c-${c.id}`} className="relative">
                <span className="absolute -left-[29px] top-0.5 h-3.5 w-3.5 rounded-full border-2 border-blue-200 bg-blue-50 ring-4 ring-white" />
                <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                    Comment
                  </div>
                  <div className="mt-2 text-sm font-medium text-slate-900">
                    {c.author_name}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {c.created_at}
                  </div>
                  <p className="mt-3 rounded-lg bg-white px-3 py-2 text-sm text-slate-700">
                    {c.body}
                  </p>
                </div>
              </li>
            ))}

            {history.events.length === 0 && history.comments.length === 0 && (
              <li className="relative">
                <span className="absolute -left-[29px] top-0.5 h-3.5 w-3.5 rounded-full border-2 border-slate-200 bg-slate-100 ring-4 ring-white" />
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                  No activity has been recorded yet.
                </div>
              </li>
            )}
          </ol>
        </div>

        <form
          className="mt-5 flex flex-col gap-2 border-t border-slate-200 pt-5 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await post(`/api/reports/${id}/comments`, { body: comment });
              setComment('');
            });
          }}
        >
          <label className="sr-only" htmlFor="comment">
            Add a comment
          </label>
          <input
            id="comment"
            className={inputClass}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Add a comment"
            required
          />
          <button className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300">
            Post
          </button>
        </form>
      </section>
    </div>
  );
}
