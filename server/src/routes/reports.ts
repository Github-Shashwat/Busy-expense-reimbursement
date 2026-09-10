import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { db, CATEGORIES, withTransaction, type Status } from '../db.js';
import { requireAuth, requireApprover } from '../auth.js';

export const reportsRouter = Router();

type ReportRow = {
  id: number;
  owner_id: number;
  title: string;
  period_start: string;
  period_end: string;
  status: Status;
  submitted_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  total_cents: number;
  owner_name: string;
  owner_email: string;
};

const TOTAL_SQL = `(SELECT COALESCE(SUM(amount_cents), 0) FROM expense_lines WHERE report_id = expense_reports.id)`;

function getReport(id: number): ReportRow | undefined {
  return db
    .prepare(
      `SELECT expense_reports.*, ${TOTAL_SQL} AS total_cents,
              users.name AS owner_name, users.email AS owner_email
       FROM expense_reports
       JOIN users ON users.id = expense_reports.owner_id
       WHERE expense_reports.id = ?`,
    )
    .get(id) as ReportRow | undefined;
}

function touchReport(id: number) {
  db.prepare(`UPDATE expense_reports SET updated_at = datetime('now') WHERE id = ?`).run(id);
}

function addStatusEvent(
  reportId: number,
  oldStatus: string | null,
  newStatus: string,
  actorId: number,
  reason?: string | null,
) {
  db.prepare(
    `INSERT INTO status_events (report_id, old_status, new_status, actor_id, reason)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(reportId, oldStatus, newStatus, actorId, reason ?? null);
}



function canView(report: ReportRow, userId: number, role: string) {
  if (report.owner_id === userId) return true;
  if (role !== 'approver') return false;
  return report.status === 'submitted' || report.status === 'approved' || report.status === 'paid';
}

function decide(reportId: number, actorId: number, action: 'approve' | 'reject' | 'pay', reason?: string): { ok: true } | { ok: false; error: string; code?: string } {
  if (!Number.isFinite(reportId)) return { ok: false, code: 'not_found', error: 'Report not found' };

  const report = getReport(reportId);
  if (!report) return { ok: false, code: 'not_found', error: 'Report not found' };
  if (report.archived_at) return { ok: false, error: 'Archived reports cannot be approved, rejected, or marked paid' };
  if (report.owner_id === actorId) {
    return { ok: false, code: 'self_owner', error: 'You cannot approve, reject, or mark paid a report you own. Another approver must decide.' };
  }

  if (action === 'approve') {
    if (report.status !== 'submitted') {
      return { ok: false, error: `Cannot approve a report in status "${report.status}". Only submitted reports can be approved.` };
    }
    const info = db.prepare(
      `UPDATE expense_reports SET status = 'approved', updated_at = datetime('now')
       WHERE id = ? AND status = 'submitted'`,
    ).run(report.id);
    if (info.changes === 0) return { ok: false, error: 'Cannot approve this report; it is no longer submitted.' };
    addStatusEvent(report.id, 'submitted', 'approved', actorId);
    return { ok: true };
  }

  if (action === 'reject') {
    if (report.status !== 'submitted') {
      return { ok: false, error: `Cannot reject a report in status "${report.status}". Only submitted reports can be rejected.` };
    }
    if (!reason?.trim()) return { ok: false, error: 'A rejection reason is required' };

    const info = db.prepare(
      `UPDATE expense_reports SET status = 'draft', submitted_at = NULL, updated_at = datetime('now')
       WHERE id = ? AND status = 'submitted'`,
    ).run(report.id);
    if (info.changes === 0) return { ok: false, error: 'Cannot reject this report; it is no longer submitted.' };

    addStatusEvent(report.id, 'submitted', 'rejected', actorId, reason.trim());
    addStatusEvent(report.id, 'rejected', 'draft', actorId, 'Returned to draft after rejection');
    return { ok: true };
  }

  if (report.status !== 'approved') {
    return { ok: false, error: `Cannot mark paid a report in status "${report.status}". Only approved reports can be marked paid.` };
  }

  const info = db.prepare(
    `UPDATE expense_reports SET status = 'paid', updated_at = datetime('now')
     WHERE id = ? AND status = 'approved'`,
  ).run(report.id);
  if (info.changes === 0) return { ok: false, error: 'Cannot mark paid; report is no longer approved.' };

  addStatusEvent(report.id, 'approved', 'paid', actorId);
  return { ok: true };
}

function respondDecide(res: Response, reportId: number, result: ReturnType<typeof decide>) {
  if (!result.ok) {
    const status = result.code === 'not_found' ? 404 : result.code === 'self_owner' ? 403 : 400;
    return res.status(status).json({ error: result.error });
  }
  res.json({ report: serializeReport(reportId) });
}

function assertDraftOwner(report: ReportRow, userId: number) {
  if (report.owner_id !== userId) return 'You can only change your own reports';
  if (report.archived_at) return 'Restore the report before editing';
  if (report.status !== 'draft') return `Report is ${report.status}; only draft reports can be edited`;
  return null;
}

function serializeReport(id: number) {
  const report = getReport(id);
  if (!report) return null;
  const lines = db
    .prepare(`SELECT * FROM expense_lines WHERE report_id = ? ORDER BY spent_on, id`)
    .all(id);
  return { ...report, lines };
}

function loadOwnedDraft(req: Request, res: Response) {
  const report = getReport(Number(req.params.id));
  if (!report) {
    res.status(404).json({ error: 'Report not found' });
    return null;
  }
  const err = assertDraftOwner(report, req.user!.id);
  if (err) {
    res.status(403).json({ error: err });
    return null;
  }
  return report;
}

reportsRouter.get('/', requireAuth, (req, res) => {
  const archived = req.query.archived === '1' || req.query.archived === 'true';

  const rows = db
    .prepare(
      `SELECT expense_reports.*, ${TOTAL_SQL} AS total_cents,
              users.name AS owner_name, users.email AS owner_email
       FROM expense_reports
       JOIN users ON users.id = expense_reports.owner_id
       WHERE expense_reports.owner_id = ?
         AND ${archived ? 'expense_reports.archived_at IS NOT NULL' : 'expense_reports.archived_at IS NULL'}
       ORDER BY expense_reports.created_at DESC, expense_reports.id DESC`,
    )
    .all(req.user!.id);

  res.json({ items: rows, total: rows.length, page: 1, pageSize: rows.length });
});

reportsRouter.post('/', requireAuth, (req, res) => {
  const body = z
    .object({
      title: z.string().min(1),
      period_start: z.string().min(1),
      period_end: z.string().min(1),
    })
    .safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'title, period_start, period_end required' });

  const info = db
    .prepare(
      `INSERT INTO expense_reports (owner_id, title, period_start, period_end, status)
       VALUES (?, ?, ?, ?, 'draft')`,
    )
    .run(req.user!.id, body.data.title, body.data.period_start, body.data.period_end);

  const id = Number(info.lastInsertRowid);
  res.status(201).json({ report: serializeReport(id) });
});

reportsRouter.patch('/:id', requireAuth, (req, res) => {
  const report = loadOwnedDraft(req, res);
  if (!report) return;

  const body = z
    .object({
      title: z.string().min(1).optional(),
      period_start: z.string().min(1).optional(),
      period_end: z.string().min(1).optional(),
    })
    .safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'Invalid fields' });

  db.prepare(
    `UPDATE expense_reports SET
       title = COALESCE(?, title),
       period_start = COALESCE(?, period_start),
       period_end = COALESCE(?, period_end),
       updated_at = datetime('now')
     WHERE id = ?`,
  ).run(body.data.title ?? null, body.data.period_start ?? null, body.data.period_end ?? null, report.id);

  res.json({ report: serializeReport(report.id) });
});

reportsRouter.get('/:id', requireAuth, (req, res) => {
  const report = getReport(Number(req.params.id));
  if (!report) return res.status(404).json({ error: 'Report not found' });

  if (!canView(report, req.user!.id, req.user!.role)) {
    return res.status(403).json({ error: 'You cannot view this report' });
  }

  res.json({ report: serializeReport(report.id) });
});

reportsRouter.post('/:id/archive', requireAuth, (req, res) => {
  const report = getReport(Number(req.params.id));
  if (!report) return res.status(404).json({ error: 'Report not found' });
  if (report.owner_id !== req.user!.id) {
    return res.status(403).json({ error: 'Only the owner can archive a report' });
  }
  if (report.status !== 'draft' && report.status !== 'paid') {
    return res.status(400).json({
      error: `Cannot archive a report in status "${report.status}". Only draft or paid reports can be archived.`,
    });
  }
  if (report.archived_at) {
    return res.status(400).json({ error: 'Report is already archived' });
  }

  db.prepare(
    `UPDATE expense_reports SET archived_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
  ).run(report.id);

  res.json({ report: serializeReport(report.id) });
});

reportsRouter.post('/:id/restore', requireAuth, (req, res) => {
  const report = getReport(Number(req.params.id));
  if (!report) return res.status(404).json({ error: 'Report not found' });
  if (report.owner_id !== req.user!.id) {
    return res.status(403).json({ error: 'Only the owner can restore a report' });
  }
  if (!report.archived_at) {
    return res.status(400).json({ error: 'Report is not archived' });
  }

  db.prepare(
    `UPDATE expense_reports SET archived_at = NULL, updated_at = datetime('now') WHERE id = ?`,
  ).run(report.id);

  res.json({ report: serializeReport(report.id) });
});

const lineSchema = z.object({
  spent_on: z.string().min(1),
  amount_cents: z.number().int().nonnegative(),
  category: z.enum(CATEGORIES as unknown as [string, ...string[]]),
  description: z.string().min(1),
});

reportsRouter.post('/:id/lines', requireAuth, (req, res) => {
  const report = loadOwnedDraft(req, res);
  if (!report) return;

  const body = lineSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'Invalid line fields' });

  const info = db
    .prepare(
      `INSERT INTO expense_lines (report_id, spent_on, amount_cents, category, description)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(report.id, body.data.spent_on, body.data.amount_cents, body.data.category, body.data.description);

  touchReport(report.id);
  const line = db.prepare(`SELECT * FROM expense_lines WHERE id = ?`).get(info.lastInsertRowid);
  res.status(201).json({ line, total_cents: getReport(report.id)!.total_cents });
});

reportsRouter.patch('/:id/lines/:lineId', requireAuth, (req, res) => {
  const report = loadOwnedDraft(req, res);
  if (!report) return;

  const body = lineSchema.partial().safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'Invalid line fields' });

  const line = db
    .prepare(`SELECT id FROM expense_lines WHERE id = ? AND report_id = ?`)
    .get(Number(req.params.lineId), report.id) as { id: number } | undefined;
  if (!line) return res.status(404).json({ error: 'Line not found' });

  db.prepare(
    `UPDATE expense_lines SET
       spent_on = COALESCE(?, spent_on),
       amount_cents = COALESCE(?, amount_cents),
       category = COALESCE(?, category),
       description = COALESCE(?, description)
     WHERE id = ?`,
  ).run(
    body.data.spent_on ?? null,
    body.data.amount_cents ?? null,
    body.data.category ?? null,
    body.data.description ?? null,
    line.id,
  );

  touchReport(report.id);
  const updated = db.prepare(`SELECT * FROM expense_lines WHERE id = ?`).get(line.id);
  res.json({ line: updated, total_cents: getReport(report.id)!.total_cents });
});

reportsRouter.delete('/:id/lines/:lineId', requireAuth, (req, res) => {
  const report = loadOwnedDraft(req, res);
  if (!report) return;

  const info = db
    .prepare(`DELETE FROM expense_lines WHERE id = ? AND report_id = ?`)
    .run(Number(req.params.lineId), report.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Line not found' });

  touchReport(report.id);
  res.json({ ok: true, total_cents: getReport(report.id)!.total_cents });
});

reportsRouter.post('/:id/submit', requireAuth, (req, res) => {
  const report = getReport(Number(req.params.id));
  if (!report) return res.status(404).json({ error: 'Report not found' });
  if (report.owner_id !== req.user!.id) return res.status(403).json({ error: 'Only the report owner may submit it' });
  if (report.archived_at) return res.status(400).json({ error: 'Restore the report before submitting' });
  if (report.status !== 'draft') {
    return res.status(400).json({ error: `Cannot submit a report in status "${report.status}". Only draft reports can be submitted.` });
  }
  if (report.total_cents <= 0) return res.status(400).json({ error: 'Add at least one expense line before submitting' });

  db.prepare(
    `UPDATE expense_reports SET status = 'submitted', submitted_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ? AND status = 'draft'`,
  ).run(report.id);

  addStatusEvent(report.id, 'draft', 'submitted', req.user!.id);
  res.json({ report: serializeReport(report.id) });
});

reportsRouter.post('/:id/approve', requireAuth, (req, res) => {
  if (req.user!.role !== 'approver') return res.status(403).json({ error: 'Approver role required' });
  const id = Number(req.params.id);
  respondDecide(res, id, decide(id, req.user!.id, 'approve'));
});

reportsRouter.post('/:id/reject', requireAuth, (req, res) => {
  if (req.user!.role !== 'approver') return res.status(403).json({ error: 'Approver role required' });
  const id = Number(req.params.id);
  const reason = typeof req.body?.reason === 'string' ? req.body.reason : '';
  respondDecide(res, id, decide(id, req.user!.id, 'reject', reason));
});

reportsRouter.post('/:id/pay', requireAuth, (req, res) => {
  if (req.user!.role !== 'approver') return res.status(403).json({ error: 'Approver role required' });
  const id = Number(req.params.id);
  respondDecide(res, id, decide(id, req.user!.id, 'pay'));
});

reportsRouter.get('/:id/history', requireAuth, (req, res) => {
  const report = getReport(Number(req.params.id));
  if (!report) return res.status(404).json({ error: 'Report not found' });
  if (!canView(report, req.user!.id, req.user!.role)) return res.status(403).json({ error: 'You cannot view this report' });

  const events = db.prepare(
    `SELECT se.*, u.name AS actor_name FROM status_events se
     JOIN users u ON u.id = se.actor_id
     WHERE se.report_id = ? ORDER BY se.created_at, se.id`,
  ).all(report.id);

  const comments = db.prepare(
    `SELECT c.*, u.name AS author_name FROM comments c
     JOIN users u ON u.id = c.author_id
     WHERE c.report_id = ? ORDER BY c.created_at, c.id`,
  ).all(report.id);

  res.json({ events, comments });
});

reportsRouter.post('/:id/comments', requireAuth, (req, res) => {
  const report = getReport(Number(req.params.id));
  if (!report) return res.status(404).json({ error: 'Report not found' });
  if (!canView(report, req.user!.id, req.user!.role)) return res.status(403).json({ error: 'You cannot comment on this report' });

  const body = z.object({ body: z.string().min(1) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'Comment body required' });

  const info = db.prepare(`INSERT INTO comments (report_id, author_id, body) VALUES (?, ?, ?)`)
    .run(report.id, req.user!.id, body.data.body);

  const comment = db.prepare(
    `SELECT c.*, u.name AS author_name FROM comments c
     JOIN users u ON u.id = c.author_id WHERE c.id = ?`,
  ).get(info.lastInsertRowid);

  res.status(201).json({ comment });
});
