import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireAuth, requireApprover } from '../auth.js';
import { query, withPgTransaction } from '../postgres.js';

export const dashboardRouter = Router();

type DashboardStatusRow = {
  status: string;
  count: number;
};

type DashboardCategoryRow = {
  category: string;
  total_cents: number;
};

type DashboardWeekRow = {
  week: string;
  total_cents: number;
};

type ExportRow = {
  id: number;
  title: string;
  owner_name: string;
  owner_email: string;
  total_cents: number;
  updated_at: string;
};

type AlertRow = {
  id: number;
  owner_id: number;
  title: string;
  period_start: string;
  period_end: string;
  status: string;
  submitted_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  owner_name: string;
  total_cents: number;
  days_waiting: number;
};

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function sqliteWeekLabel(date: Date) {
  const year = date.getUTCFullYear();
  const start = new Date(Date.UTC(year, 0, 1));
  const dayOfYearZeroBased = Math.floor((date.getTime() - start.getTime()) / 86_400_000);
  const mondayBasedWeekday = (date.getUTCDay() + 6) % 7;
  const week = Math.floor((dayOfYearZeroBased + 7 - mondayBasedWeekday) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

const timestampSql = (column: string) =>
  `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')`;

const weekLabelSql = (column: string) => `
  (
    EXTRACT(YEAR FROM (${column} AT TIME ZONE 'UTC'))::int::text
    || '-W'
    || lpad(
      FLOOR(
        (
          (EXTRACT(DOY FROM (${column} AT TIME ZONE 'UTC'))::int - 1)
          + 7
          - ((EXTRACT(DOW FROM (${column} AT TIME ZONE 'UTC'))::int + 6) % 7)
        ) / 7.0
      )::int::text,
      2,
      '0'
    )
  )
`;

dashboardRouter.get('/', requireAuth, asyncHandler(async (req, res) => {
  const isEmployee = req.user!.role === 'employee';
  const ownerParams = isEmployee ? [req.user!.id] : [];
  const reportScope = isEmployee ? ' AND r.owner_id = $1' : '';
  const directReportScope = isEmployee ? ' AND owner_id = $1' : '';

  const [
    awaitingApprovalResult,
    dueResult,
    approvedThisWeekResult,
    paidThisWeekResult,
    byStatusResult,
    byCategoryResult,
    paidRowsResult,
  ] = await Promise.all([
    query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM expense_reports
       WHERE status = 'submitted' AND archived_at IS NULL${directReportScope}`,
      ownerParams,
    ),
    query<{ total: number }>(
      `SELECT COALESCE(SUM(el.amount_cents), 0)::int AS total
       FROM expense_reports r
       JOIN expense_lines el ON el.report_id = r.id
       WHERE r.status = 'approved' AND r.archived_at IS NULL${reportScope}`,
      ownerParams,
    ),
    query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM status_events se
       JOIN expense_reports r ON r.id = se.report_id
       WHERE se.new_status = 'approved'
         AND se.created_at >= now() - interval '7 days'${reportScope}`,
      ownerParams,
    ),
    query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM status_events se
       JOIN expense_reports r ON r.id = se.report_id
       WHERE se.new_status = 'paid'
         AND se.created_at >= now() - interval '7 days'${reportScope}`,
      ownerParams,
    ),
    query<DashboardStatusRow>(
      `SELECT status, COUNT(*)::int AS count FROM expense_reports
       WHERE archived_at IS NULL${directReportScope} GROUP BY status`,
      ownerParams,
    ),
    query<DashboardCategoryRow>(
      `SELECT el.category, COALESCE(SUM(el.amount_cents), 0)::int AS total_cents
       FROM expense_lines el
       JOIN expense_reports r ON r.id = el.report_id
       WHERE r.archived_at IS NULL${reportScope}
       GROUP BY el.category
       ORDER BY total_cents DESC`,
      ownerParams,
    ),
    query<DashboardWeekRow>(
      `SELECT ${weekLabelSql('se.created_at')} AS week,
              COALESCE(SUM(el.amount_cents), 0)::int AS total_cents
       FROM status_events se
       JOIN expense_reports r ON r.id = se.report_id
       JOIN expense_lines el ON el.report_id = r.id
       WHERE se.new_status = 'paid'
         AND se.created_at >= now() - interval '56 days'${reportScope}
       GROUP BY week`,
      ownerParams,
    ),
  ]);

  const byWeek = new Map(paidRowsResult.rows.map((r) => [r.week, r.total_cents]));
  const paidPerWeek: DashboardWeekRow[] = [];
  for (let i = 7; i >= 0; i--) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - i * 7);
    const label = sqliteWeekLabel(date);
    paidPerWeek.push({ week: label, total_cents: byWeek.get(label) ?? 0 });
  }

  res.json({
    headlines: {
      awaitingApproval: awaitingApprovalResult.rows[0].c,
      reimbursementsDueCents: dueResult.rows[0].total,
      approvedThisWeek: approvedThisWeekResult.rows[0].c,
      paidThisWeek: paidThisWeekResult.rows[0].c,
    },
    byStatus: byStatusResult.rows,
    byCategory: byCategoryResult.rows,
    paidPerWeek,
  });
}));

export const exportRouter = Router();

exportRouter.get('/reimbursements-due.csv', requireAuth, requireApprover, asyncHandler(async (_req, res) => {
  const result = await query<ExportRow>(
    `SELECT r.id, r.title, u.name AS owner_name, u.email AS owner_email,
            COALESCE(SUM(el.amount_cents), 0)::int AS total_cents,
            ${timestampSql('r.updated_at')} AS updated_at
     FROM expense_reports r
     JOIN users u ON u.id = r.owner_id
     LEFT JOIN expense_lines el ON el.report_id = r.id
     WHERE r.status = 'approved' AND r.archived_at IS NULL
     GROUP BY r.id, u.name, u.email
     ORDER BY r.id`,
  );

  const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [
    'report_id,title,owner_name,owner_email,total_cents,total_rupees,approved_at',
    ...result.rows.map((r) =>
      [
        r.id,
        escape(r.title),
        escape(r.owner_name),
        escape(r.owner_email),
        r.total_cents,
        (r.total_cents / 100).toFixed(2),
        escape(r.updated_at),
      ].join(','),
    ),
  ];

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="reimbursements-due.csv"');
  res.send(lines.join('\n'));
}));

export const alertsRouter = Router();

alertsRouter.get('/', requireAuth, requireApprover, asyncHandler(async (req, res) => {
  const days = Number(process.env.STALE_DAYS || 7);
  const reDays = Number(process.env.REDISMISS_DAYS || 3);
  const approverId = req.user!.id;

  const result = await query<AlertRow>(
    `SELECT r.id,
            r.owner_id,
            r.title,
            r.period_start,
            r.period_end,
            r.status,
            ${timestampSql('r.submitted_at')} AS submitted_at,
            ${timestampSql('r.archived_at')} AS archived_at,
            ${timestampSql('r.created_at')} AS created_at,
            ${timestampSql('r.updated_at')} AS updated_at,
            u.name AS owner_name,
            COALESCE(SUM(el.amount_cents), 0)::int AS total_cents,
            FLOOR(EXTRACT(EPOCH FROM (now() - r.submitted_at)) / 86400)::int AS days_waiting
     FROM expense_reports r
     JOIN users u ON u.id = r.owner_id
     LEFT JOIN expense_lines el ON el.report_id = r.id
     LEFT JOIN alert_dismissals ad ON ad.report_id = r.id AND ad.approver_id = $1
     WHERE r.status = 'submitted'
       AND r.archived_at IS NULL
       AND r.submitted_at IS NOT NULL
       AND now() - r.submitted_at > $2::double precision * interval '1 day'
       AND (
         ad.dismissed_at IS NULL
         OR now() - ad.dismissed_at > $3::double precision * interval '1 day'
       )
       AND EXISTS (
         SELECT 1 FROM report_approvers ra
         WHERE ra.report_id = r.id AND ra.approver_id = $4
       )
     GROUP BY r.id, u.name
     ORDER BY r.submitted_at`,
    [approverId, days, reDays, approverId],
  );

  const items = result.rows;
  res.json({ items, count: items.length, staleDays: days, redismissDays: reDays });
}));

alertsRouter.post('/:reportId/dismiss', requireAuth, requireApprover, asyncHandler(async (req, res) => {
  const reportId = Number(req.params.reportId);
  if (!Number.isFinite(reportId)) return res.status(404).json({ error: 'Report not found' });

  const reportResult = await query<{ id: number; status: string }>(
    `SELECT id, status FROM expense_reports WHERE id = $1`,
    [reportId],
  );
  const report = reportResult.rows[0];

  if (!report) return res.status(404).json({ error: 'Report not found' });
  if (report.status !== 'submitted') {
    return res.status(400).json({ error: 'Only submitted reports can have alerts dismissed' });
  }

  const assignedResult = await query(
    `SELECT 1 FROM report_approvers WHERE report_id = $1 AND approver_id = $2`,
    [reportId, req.user!.id],
  );
  if ((assignedResult.rowCount ?? 0) === 0) {
    return res.status(403).json({ error: 'You can only dismiss alerts for reports assigned to you' });
  }

  await withPgTransaction(async (client) => {
    await client.query(
      `INSERT INTO alert_dismissals (report_id, approver_id, dismissed_at)
       VALUES ($1, $2, now())
       ON CONFLICT(report_id, approver_id) DO UPDATE SET dismissed_at = now()`,
      [reportId, req.user!.id],
    );
  });

  res.json({ ok: true });
}));
