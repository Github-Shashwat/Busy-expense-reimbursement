import { useEffect, useState } from 'react';
import { api, money } from '../api';

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

export function DashboardPage() {
  const [data, setData] = useState<Dash | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Dash>('/api/dashboard')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!data) return <p className="text-slate-500">Loading…</p>;

  const maxWeek = Math.max(1, ...data.paidPerWeek.map((w) => w.total_cents));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-slate-600">Headline numbers across the company.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Awaiting approval', String(data.headlines.awaitingApproval)],
          ['Reimbursements due', money(data.headlines.reimbursementsDueCents)],
          ['Approved this week', String(data.headlines.approvedThisWeek)],
          ['Paid this week', String(data.headlines.paidThisWeek)],
        ].map(([label, value]) => (
          <div key={label} className="rounded border border-slate-200 bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
            <div className="mt-1 text-2xl font-semibold">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded border border-slate-200 bg-white p-4">
          <h2 className="mb-3 font-medium">By status</h2>
          <ul className="space-y-1 text-sm">
            {data.byStatus.map((r) => (
              <li key={r.status} className="flex justify-between">
                <span className="capitalize">{r.status}</span>
                <span>{r.count}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded border border-slate-200 bg-white p-4">
          <h2 className="mb-3 font-medium">By category</h2>
          <ul className="space-y-1 text-sm">
            {data.byCategory.map((r) => (
              <li key={r.category} className="flex justify-between">
                <span className="capitalize">{r.category}</span>
                <span>{money(r.total_cents)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-medium">Reimbursements paid — last 8 weeks</h2>
        {data.paidPerWeek.length === 0 ? (
          <p className="text-sm text-slate-500">No paid reports in this window.</p>
        ) : (
          <div className="flex h-40 items-end gap-2">
            {data.paidPerWeek.map((w) => (
              <div key={w.week} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-slate-700"
                  style={{ height: `${(w.total_cents / maxWeek) * 100}%`, minHeight: 4 }}
                  title={money(w.total_cents)}
                />
                <span className="text-[10px] text-slate-500">{w.week.replace(/^\d+-W/, 'W')}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
