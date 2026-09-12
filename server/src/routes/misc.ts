import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireApprover } from '../auth.js';

export const dashboardRouter = Router();

dashboardRouter.get('/', requireAuth, (req, res) => {
  const isEmployee = req.user!.role === 'employee';
  const ownerParams = isEmployee ? [req.user!.id] : [];
  const reportScope = isEmployee ? ' AND r.owner_id = ?' : '';
  const directReportScope = isEmployee ? ' AND owner_id = ?' : '';

  const awaitingApproval = (
    db.prepare(
      `SELECT COUNT(*) AS c FROM expense_reports
       WHERE status = 'submitted' AND archived_at IS NULL${directReportScope}`,
    ).get(...ownerParams) as { c: number }
  ).c;

  const due = (
    db
      .prepare(
        `SELECT COALESCE(SUM(el.amount_cents), 0) AS total
         FROM expense_reports r
         JOIN expense_lines el ON el.report_id = r.id
         WHERE r.status = 'approved' AND r.archived_at IS NULL${reportScope}`,
      )
      .get(...ownerParams) as { total: number }
  ).total;

  const approvedThisWeek = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM status_events se
         JOIN expense_reports r ON r.id = se.report_id
         WHERE se.new_status = 'approved'
           AND se.created_at >= datetime('now', '-7 days')${reportScope}`,
      )
      .get(...ownerParams) as { c: number }
  ).c;

  const paidThisWeek = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM status_events se
         JOIN expense_reports r ON r.id = se.report_id
         WHERE se.new_status = 'paid'
           AND se.created_at >= datetime('now', '-7 days')${reportScope}`,
      )
      .get(...ownerParams) as { c: number }
  ).c;

  const byStatus = db
    .prepare(
      `SELECT status, COUNT(*) AS count FROM expense_reports
       WHERE archived_at IS NULL${directReportScope} GROUP BY status`,
    )
    .all(...ownerParams);

  const byCategory = db
    .prepare(
      `SELECT el.category, COALESCE(SUM(el.amount_cents), 0) AS total_cents
       FROM expense_lines el
       JOIN expense_reports r ON r.id = el.report_id
       WHERE r.archived_at IS NULL${reportScope}
       GROUP BY el.category
       ORDER BY total_cents DESC`,
    )
    .all(...ownerParams);

  const paidRows = db
    .prepare(
      `SELECT strftime('%Y-W%W', se.created_at) AS week,
              COALESCE(SUM(el.amount_cents), 0) AS total_cents
       FROM status_events se
       JOIN expense_reports r ON r.id = se.report_id
       JOIN expense_lines el ON el.report_id = r.id
       WHERE se.new_status = 'paid'
         AND se.created_at >= datetime('now', '-56 days')${reportScope}
       GROUP BY week`,
    )
    .all(...ownerParams) as { week: string; total_cents: number }[];

  const byWeek = new Map(paidRows.map((r) => [r.week, r.total_cents]));
  const paidPerWeek: { week: string; total_cents: number }[] = [];
  for (let i = 7; i >= 0; i--) {
    const label = (
      db.prepare(`SELECT strftime('%Y-W%W', datetime('now', ?)) AS week`).get(`-${i * 7} days`) as {
        week: string;
      }
    ).week;
    paidPerWeek.push({ week: label, total_cents: byWeek.get(label) ?? 0 });
  }

  res.json({
    headlines: { awaitingApproval, reimbursementsDueCents: due, approvedThisWeek, paidThisWeek },
    byStatus,
    byCategory,
    paidPerWeek,
  });
});

export const exportRouter = Router();

exportRouter.get('/reimbursements-due.csv', requireAuth, requireApprover, (_req, res) => {
  const rows = db
    .prepare(
      `SELECT r.id, r.title, u.name AS owner_name, u.email AS owner_email,
              COALESCE(SUM(el.amount_cents), 0) AS total_cents, r.updated_at
       FROM expense_reports r
       JOIN users u ON u.id = r.owner_id
       LEFT JOIN expense_lines el ON el.report_id = r.id
       WHERE r.status = 'approved' AND r.archived_at IS NULL
       GROUP BY r.id
       ORDER BY r.id`,
    )
    .all() as {
    id: number;
    title: string;
    owner_name: string;
    owner_email: string;
    total_cents: number;
    updated_at: string;
  }[];

  const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [
    'report_id,title,owner_name,owner_email,total_cents,total_rupees,approved_at',
    ...rows.map((r) =>
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
});

export const alertsRouter = Router();

alertsRouter.get('/', requireAuth, requireApprover, (req, res) => {
  const days = Number(process.env.STALE_DAYS || 7);
  const reDays = Number(process.env.REDISMISS_DAYS || 3);
  const approverId = req.user!.id;

  const items = db
    .prepare(
      `SELECT r.*, u.name AS owner_name,
              COALESCE(SUM(el.amount_cents), 0) AS total_cents,
              CAST(julianday('now') - julianday(r.submitted_at) AS INTEGER) AS days_waiting
       FROM expense_reports r
       JOIN users u ON u.id = r.owner_id
       LEFT JOIN expense_lines el ON el.report_id = r.id
       LEFT JOIN alert_dismissals ad ON ad.report_id = r.id AND ad.approver_id = ?
       WHERE r.status = 'submitted'
         AND r.archived_at IS NULL
         AND r.submitted_at IS NOT NULL
         AND julianday('now') - julianday(r.submitted_at) > ?
         AND (
           ad.dismissed_at IS NULL
           OR julianday('now') - julianday(ad.dismissed_at) > ?
         )
         AND EXISTS (
           SELECT 1 FROM report_approvers ra
           WHERE ra.report_id = r.id AND ra.approver_id = ?
         )
       GROUP BY r.id
       ORDER BY r.submitted_at`,
    )
    .all(approverId, days, reDays, approverId);

  res.json({ items, count: items.length, staleDays: days, redismissDays: reDays });
});

alertsRouter.post('/:reportId/dismiss', requireAuth, requireApprover, (req, res) => {
  const reportId = Number(req.params.reportId);
  const report = db.prepare(`SELECT * FROM expense_reports WHERE id = ?`).get(reportId) as
    | { id: number; status: string }
    | undefined;
  if (!report) return res.status(404).json({ error: 'Report not found' });
  if (report.status !== 'submitted') {
    return res.status(400).json({ error: 'Only submitted reports can have alerts dismissed' });
  }

  const assigned = db
    .prepare(`SELECT 1 FROM report_approvers WHERE report_id = ? AND approver_id = ?`)
    .get(reportId, req.user!.id);
  if (!assigned) {
    return res.status(403).json({ error: 'You can only dismiss alerts for reports assigned to you' });
  }

  db.prepare(
    `INSERT INTO alert_dismissals (report_id, approver_id, dismissed_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(report_id, approver_id) DO UPDATE SET dismissed_at = datetime('now')`,
  ).run(reportId, req.user!.id);

  res.json({ ok: true });
});
