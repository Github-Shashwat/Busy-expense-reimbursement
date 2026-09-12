import { useEffect, useState } from 'react';
import { api, money } from '../api';
import { useAuth } from '../auth';

type Dash = {
  headlines: {
    awaitingApproval: number;
    reimbursementsDueCents: number;
    approvedThisWeek: number;
    paidThisWeek: number;
  };
  byStatus: { status: string; count: number }[];
  byCategory: { category: string; total_cents: number }[];
  paidPerWeek: { week: string; total_cents: number }[];
};

const statusStyles: Record<string, string> = {
  approved: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  submitted: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  paid: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  draft: 'bg-slate-100 text-slate-600 ring-slate-500/20',
};

export function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<Dash | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Dash>('/api/dashboard')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  const maxWeek = Math.max(1, ...data.paidPerWeek.map((w) => w.total_cents));
  const maxCategory = Math.max(
    1,
    ...data.byCategory.map((category) => category.total_cents),
  );

  const headlineCards = [
    {
      label: 'Awaiting approval',
      value: String(data.headlines.awaitingApproval),
      description: 'Reports currently submitted',
    },
    {
      label: 'Reimbursements due',
      value: money(data.headlines.reimbursementsDueCents),
      description: 'Approved and awaiting payment',
    },
    {
      label: 'Approved this week',
      value: String(data.headlines.approvedThisWeek),
      description: 'Reports approved in the last 7 days',
    },
    {
      label: 'Paid this week',
      value: String(data.headlines.paidThisWeek),
      description: 'Reports paid in the last 7 days',
    },
  ];

  return (
    <div className="space-y-7">
      {/* Page heading */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          Overview
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {user?.role === 'employee'
            ? 'A quick view of your reimbursement activity.'
            : 'A quick view of reimbursement activity across the company.'}
        </p>
      </div>

      {/* Headline metrics */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {headlineCards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {card.label}
            </div>

            <div className="mt-3 text-3xl font-bold tracking-tight text-slate-950">
              {card.value}
            </div>

            <div className="mt-2 text-xs text-slate-500">
              {card.description}
            </div>
          </div>
        ))}
      </div>

      {/* Status + category */}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Reports by status</h2>
              <p className="mt-1 text-xs text-slate-500">
                Current report distribution
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {data.byStatus.map((row) => (
              <div
                key={row.status}
                className="flex items-center justify-between gap-4"
              >
                <span
                  className={[
                    'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ring-inset',
                    statusStyles[row.status] ??
                      'bg-slate-100 text-slate-600 ring-slate-500/20',
                  ].join(' ')}
                >
                  {row.status}
                </span>

                <span className="text-sm font-semibold text-slate-800">
                  {row.count}
                </span>
              </div>
            ))}

            {data.byStatus.length === 0 && (
              <p className="text-sm text-slate-500">No reports yet.</p>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <h2 className="font-semibold text-slate-900">Spend by category</h2>
            <p className="mt-1 text-xs text-slate-500">
              Total submitted and processed expenses
            </p>
          </div>

          <div className="mt-5 space-y-4">
            {data.byCategory.map((row) => (
              <div key={row.category}>
                <div className="mb-1.5 flex items-center justify-between gap-4 text-sm">
                  <span className="capitalize text-slate-700">
                    {row.category}
                  </span>
                  <span className="font-medium text-slate-900">
                    {money(row.total_cents)}
                  </span>
                </div>

                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-slate-700 transition-all"
                    style={{
                      width: `${(row.total_cents / maxCategory) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))}

            {data.byCategory.length === 0 && (
              <p className="text-sm text-slate-500">No expense data yet.</p>
            )}
          </div>
        </section>
      </div>

      {/* Paid chart */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-slate-900">
              Reimbursements paid
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Weekly totals over the last 8 weeks
            </p>
          </div>

          <div className="hidden text-right sm:block">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
              8-week total
            </div>
            <div className="mt-0.5 text-sm font-semibold text-slate-800">
              {money(
                data.paidPerWeek.reduce(
                  (sum, week) => sum + week.total_cents,
                  0,
                ),
              )}
            </div>
          </div>
        </div>

        <div className="mt-6">
          <div className="flex h-48 items-end gap-2 border-b border-slate-200 px-1">
            {data.paidPerWeek.map((week) => {
              const height =
                week.total_cents === 0
                  ? 0
                  : Math.max(8, (week.total_cents / maxWeek) * 100);

              return (
                <div
                  key={week.week}
                  className="group flex h-full flex-1 flex-col items-center justify-end"
                >
                  <div className="relative flex w-full flex-1 items-end justify-center">
                    {week.total_cents > 0 && (
                      <div
                        className="w-full max-w-14 rounded-t-md bg-slate-800 transition-all group-hover:bg-slate-600"
                        style={{ height: `${height}%` }}
                        title={`${week.week}: ${money(week.total_cents)}`}
                      />
                    )}

                    {week.total_cents > 0 && (
                      <div className="pointer-events-none absolute bottom-full mb-2 hidden whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white shadow-lg group-hover:block">
                        {money(week.total_cents)}
                      </div>
                    )}
                  </div>

                  <span className="mt-2 text-[10px] font-medium text-slate-400">
                    {week.week.replace(/^\d+-W/, 'W')}
                  </span>
                </div>
              );
            })}
          </div>

          {data.paidPerWeek.every((week) => week.total_cents === 0) && (
            <p className="mt-4 text-center text-sm text-slate-500">
              No paid reports in this window.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
