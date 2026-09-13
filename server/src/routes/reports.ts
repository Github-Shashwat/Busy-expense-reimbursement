import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { CATEGORIES, type Status } from '../db.js';
import { requireAuth, requireApprover } from '../auth.js';
import { getExpenseLinePolicyWarning } from '../policy.js';
import { pgPool, query, withPgTransaction } from '../postgres.js';

export const reportsRouter = Router();

type Queryable = {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<T>>;
};

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

type ExpenseLineRow = {
  id: number;
  report_id: number;
  spent_on: string;
  amount_cents: number;
  category: string;
  description: string;
  created_at: string;
};

type DecisionResult = { ok: true } | { ok: false; error: string; code?: string };

const REPORT_COLUMNS = `
  expense_reports.id,
  expense_reports.owner_id,
  expense_reports.title,
  expense_reports.period_start,
  expense_reports.period_end,
  expense_reports.status,
  to_char(expense_reports.submitted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS submitted_at,
  to_char(expense_reports.archived_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS archived_at,
  to_char(expense_reports.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS created_at,
  to_char(expense_reports.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS updated_at
`;

const TOTAL_SQL = `(SELECT COALESCE(SUM(amount_cents), 0)::int FROM expense_lines WHERE report_id = expense_reports.id)`;

const LINE_COLUMNS = `
  id,
  report_id,
  spent_on,
  amount_cents,
  category,
  description,
  to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS created_at
`;

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function nextParam(params: unknown[], value: unknown) {
  params.push(value);
  return `$${params.length}`;
}

async function getReport(id: number, db: Queryable = pgPool): Promise<ReportRow | undefined> {
  const result = await db.query<ReportRow>(
    `SELECT ${REPORT_COLUMNS},
            ${TOTAL_SQL} AS total_cents,
            users.name AS owner_name,
            users.email AS owner_email
     FROM expense_reports
     JOIN users ON users.id = expense_reports.owner_id
     WHERE expense_reports.id = $1`,
    [id],
  );

  return result.rows[0];
}

async function getApprovers(reportId: number, db: Queryable = pgPool) {
  const result = await db.query(
    `SELECT u.id, u.name, u.email
     FROM report_approvers ra
     JOIN users u ON u.id = ra.approver_id
     WHERE ra.report_id = $1
     ORDER BY u.name, u.id`,
    [reportId],
  );

  return result.rows;
}

async function isAssignedApprover(reportId: number, approverId: number, db: Queryable = pgPool) {
  const result = await db.query(
    `SELECT 1
     FROM report_approvers
     WHERE report_id = $1 AND approver_id = $2`,
    [reportId, approverId],
  );

  return (result.rowCount ?? 0) > 0;
}

async function touchReport(id: number, db: Queryable = pgPool) {
  await db.query(`UPDATE expense_reports SET updated_at = now() WHERE id = $1`, [id]);
}

async function addStatusEvent(
  db: Queryable,
  reportId: number,
  oldStatus: string | null,
  newStatus: string,
  actorId: number,
  reason?: string | null,
) {
  await db.query(
    `INSERT INTO status_events (report_id, old_status, new_status, actor_id, reason)
     VALUES ($1, $2, $3, $4, $5)`,
    [reportId, oldStatus, newStatus, actorId, reason ?? null],
  );
}

function serializeLine(line: ExpenseLineRow) {
  return {
    ...line,
    policy_warning: getExpenseLinePolicyWarning(line),
  };
}

function canView(report: ReportRow, userId: number, role: string) {
  if (report.owner_id === userId) return true;
  if (role !== 'approver') return false;
  return report.status === 'submitted' || report.status === 'approved' || report.status === 'paid';
}

async function decide(
  reportId: number,
  actorId: number,
  action: 'approve' | 'reject' | 'pay',
  reason?: string,
): Promise<DecisionResult> {
  if (!Number.isFinite(reportId)) return { ok: false, code: 'not_found', error: 'Report not found' };

  return withPgTransaction(async (client) => {
    const report = await getReport(reportId, client);
    if (!report) return { ok: false, code: 'not_found', error: 'Report not found' };
    if (report.archived_at) return { ok: false, error: 'Archived reports cannot be approved, rejected, or marked paid' };
    if (report.owner_id === actorId) {
      return { ok: false, code: 'self_owner', error: 'You cannot approve, reject, or mark paid a report you own. Another approver must decide.' };
    }
    if (!(await isAssignedApprover(report.id, actorId, client))) {
      return {
        ok: false,
        code: 'not_assigned',
        error: 'You are not assigned to this report. Only an assigned approver can decide it.',
      };
    }

    if (action === 'approve') {
      if (report.status !== 'submitted') {
        return { ok: false, error: `Cannot approve a report in status "${report.status}". Only submitted reports can be approved.` };
      }
      const result = await client.query(
        `UPDATE expense_reports SET status = 'approved', updated_at = now()
         WHERE id = $1 AND status = 'submitted'`,
        [report.id],
      );
      if (result.rowCount === 0) return { ok: false, error: 'Cannot approve this report; it is no longer submitted.' };
      await addStatusEvent(client, report.id, 'submitted', 'approved', actorId);
      return { ok: true };
    }

    if (action === 'reject') {
      if (report.status !== 'submitted') {
        return { ok: false, error: `Cannot reject a report in status "${report.status}". Only submitted reports can be rejected.` };
      }
      if (!reason?.trim()) return { ok: false, error: 'A rejection reason is required' };

      const result = await client.query(
        `UPDATE expense_reports SET status = 'draft', submitted_at = NULL, updated_at = now()
         WHERE id = $1 AND status = 'submitted'`,
        [report.id],
      );
      if (result.rowCount === 0) return { ok: false, error: 'Cannot reject this report; it is no longer submitted.' };

      await addStatusEvent(client, report.id, 'submitted', 'rejected', actorId, reason.trim());
      await addStatusEvent(client, report.id, 'rejected', 'draft', actorId, 'Returned to draft after rejection');
      return { ok: true };
    }

    if (report.status !== 'approved') {
      return { ok: false, error: `Cannot mark paid a report in status "${report.status}". Only approved reports can be marked paid.` };
    }

    const result = await client.query(
      `UPDATE expense_reports SET status = 'paid', updated_at = now()
       WHERE id = $1 AND status = 'approved'`,
      [report.id],
    );
    if (result.rowCount === 0) return { ok: false, error: 'Cannot mark paid; report is no longer approved.' };

    await addStatusEvent(client, report.id, 'approved', 'paid', actorId);
    return { ok: true };
  });
}

async function respondDecide(res: Response, reportId: number, result: DecisionResult) {
  if (!result.ok) {
    const status =
      result.code === 'not_found'
        ? 404
        : result.code === 'self_owner' || result.code === 'not_assigned'
          ? 403
          : 400;
    return res.status(status).json({ error: result.error });
  }
  res.json({ report: await serializeReport(reportId) });
}

function assertDraftOwner(report: ReportRow, userId: number) {
  if (report.owner_id !== userId) return 'You can only change your own reports';
  if (report.archived_at) return 'Restore the report before editing';
  if (report.status !== 'draft') return `Report is ${report.status}; only draft reports can be edited`;
  return null;
}

async function serializeReport(id: number, db: Queryable = pgPool) {
  const report = await getReport(id, db);
  if (!report) return null;

  const lineResult = await db.query<ExpenseLineRow>(
    `SELECT ${LINE_COLUMNS}
     FROM expense_lines
     WHERE report_id = $1
     ORDER BY spent_on, id`,
    [id],
  );

  const approvers = await getApprovers(id, db);

  return {
    ...report,
    lines: lineResult.rows.map(serializeLine),
    approvers,
  };
}

async function loadOwnedDraft(req: Request, res: Response) {
  const report = await getReport(Number(req.params.id));
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

reportsRouter.get('/', requireAuth, asyncHandler(async (req, res) => {
  const user = req.user!;

  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || '').trim();

  const ownerId = req.query.ownerId
    ? Number(req.query.ownerId)
    : null;

  const approverId = req.query.approverId
    ? Number(req.query.approverId)
    : null;

  const assignedToMe =
    req.query.assignedToMe === '1' ||
    req.query.assignedToMe === 'true';

  const archived =
    req.query.archived === '1' ||
    req.query.archived === 'true';

  const mine =
    req.query.mine === '1' ||
    req.query.mine === 'true';

  const sort = String(req.query.sort || 'created_at');

  const order =
    String(req.query.order || 'desc').toLowerCase() === 'asc'
      ? 'ASC'
      : 'DESC';

  const page = Math.max(
    1,
    Number(req.query.page) || 1,
  );

  const pageSize = Math.min(
    50,
    Math.max(1, Number(req.query.pageSize) || 10),
  );

  const offset = (page - 1) * pageSize;

  const where: string[] = [];
  const params: unknown[] = [];

  if (user.role !== 'approver' || mine) {
    where.push(`expense_reports.owner_id = ${nextParam(params, user.id)}`);
  } else {
    where.push(
      `(
        expense_reports.owner_id = ${nextParam(params, user.id)}
        OR expense_reports.status IN ('submitted', 'approved', 'paid')
      )`,
    );
  }

  if (q) {
    const search = `%${q}%`;
    where.push(
      `(
        expense_reports.title ILIKE ${nextParam(params, search)}
        OR users.name ILIKE ${nextParam(params, search)}
        OR users.email ILIKE ${nextParam(params, search)}
      )`,
    );
  }

  if (status) {
    const validStatuses = [
      'draft',
      'submitted',
      'approved',
      'paid',
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: 'Invalid status filter',
      });
    }

    where.push(`expense_reports.status = ${nextParam(params, status)}`);
  }

  if (ownerId !== null) {
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      return res.status(400).json({
        error: 'Invalid ownerId',
      });
    }

    where.push(`expense_reports.owner_id = ${nextParam(params, ownerId)}`);
  }

  if (approverId !== null) {
    if (!Number.isInteger(approverId) || approverId <= 0) {
      return res.status(400).json({
        error: 'Invalid approverId',
      });
    }

    where.push(
      `EXISTS (
        SELECT 1
        FROM report_approvers ra
        WHERE ra.report_id = expense_reports.id
          AND ra.approver_id = ${nextParam(params, approverId)}
      )`,
    );
  }

  if (assignedToMe) {
    if (user.role !== 'approver') {
      return res.status(403).json({
        error: 'Only approvers can use assignedToMe',
      });
    }

    where.push(
      `EXISTS (
        SELECT 1
        FROM report_approvers ra
        WHERE ra.report_id = expense_reports.id
          AND ra.approver_id = ${nextParam(params, user.id)}
      )`,
    );
  }

  where.push(
    archived
      ? 'expense_reports.archived_at IS NOT NULL'
      : 'expense_reports.archived_at IS NULL',
  );

  const sortColumns: Record<string, string> = {
    created_at: 'expense_reports.created_at',
    updated_at: 'expense_reports.updated_at',
    submitted_at: 'expense_reports.submitted_at',
    title: 'expense_reports.title',
    total: 'total_cents',
  };

  const sortColumn =
    sortColumns[sort] || sortColumns.created_at;

  const whereSql = where.length
    ? `WHERE ${where.join(' AND ')}`
    : '';

  const countResult = await query<{ total: number }>(
    `SELECT COUNT(*)::int AS total
     FROM expense_reports
     JOIN users
       ON users.id = expense_reports.owner_id
     ${whereSql}`,
    params,
  );

  const total = Number(countResult.rows[0].total);

  const pageParams = [...params];
  const limitParam = nextParam(pageParams, pageSize);
  const offsetParam = nextParam(pageParams, offset);

  const rows = await query(
    `SELECT ${REPORT_COLUMNS},
            ${TOTAL_SQL} AS total_cents,
            users.name AS owner_name,
            users.email AS owner_email
     FROM expense_reports
     JOIN users
       ON users.id = expense_reports.owner_id
     ${whereSql}
     ORDER BY ${sortColumn} ${order},
              expense_reports.id DESC
     LIMIT ${limitParam}
     OFFSET ${offsetParam}`,
    pageParams,
  );

  res.json({
    items: rows.rows,
    total,
    page,
    pageSize,
  });
}));

reportsRouter.post('/', requireAuth, asyncHandler(async (req, res) => {
  const body = z
    .object({
      title: z.string().min(1),
      period_start: z.string().min(1),
      period_end: z.string().min(1),
    })
    .safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'title, period_start, period_end required' });

  const result = await query<{ id: number }>(
    `INSERT INTO expense_reports (owner_id, title, period_start, period_end, status)
     VALUES ($1, $2, $3, $4, 'draft')
     RETURNING id`,
    [req.user!.id, body.data.title, body.data.period_start, body.data.period_end],
  );

  const id = result.rows[0].id;
  res.status(201).json({ report: await serializeReport(id) });
}));

reportsRouter.get('/queue', requireAuth, requireApprover, asyncHandler(async (req, res) => {
  const assignedToMe =
    req.query.assignedToMe === '1' ||
    req.query.assignedToMe === 'true';

  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number(req.query.pageSize) || 20),
  );

  const params: unknown[] = [];
  const where = assignedToMe
    ? `
      WHERE expense_reports.status = 'submitted'
        AND EXISTS (
          SELECT 1
          FROM report_approvers ra
          WHERE ra.report_id = expense_reports.id
            AND ra.approver_id = ${nextParam(params, req.user!.id)}
        )
    `
    : `
      WHERE expense_reports.status = 'submitted'
    `;

  const countResult = await query<{ total: number }>(
    `SELECT COUNT(*)::int AS total
     FROM expense_reports
     ${where}`,
    params,
  );

  const total = Number(countResult.rows[0].total);

  const pageParams = [...params];
  const limitParam = nextParam(pageParams, pageSize);
  const offsetParam = nextParam(pageParams, (page - 1) * pageSize);

  const rows = await query(
    `SELECT ${REPORT_COLUMNS}, ${TOTAL_SQL} AS total_cents,
            users.name AS owner_name,
            users.email AS owner_email
     FROM expense_reports
     JOIN users ON users.id = expense_reports.owner_id
     ${where}
     ORDER BY expense_reports.submitted_at ASC,
              expense_reports.id ASC
     LIMIT ${limitParam} OFFSET ${offsetParam}`,
    pageParams,
  );

  res.json({
    items: rows.rows,
    total,
    page,
    pageSize,
  });
}));

reportsRouter.get('/:id/approvers', requireAuth, asyncHandler(async (req, res) => {
  const report = await getReport(Number(req.params.id));

  if (!report) {
    return res.status(404).json({ error: 'Report not found' });
  }

  if (!canView(report, req.user!.id, req.user!.role)) {
    return res.status(403).json({ error: 'You cannot view this report' });
  }

  res.json({ approvers: await getApprovers(report.id) });
}));

reportsRouter.post('/bulk-decide', requireAuth, requireApprover, asyncHandler(async (req, res) => {
  const body = z
    .object({
      reportIds: z.array(z.number().int().positive()).min(1).max(100),
      action: z.enum(['approve', 'reject']),
      reason: z.string().trim().optional(),
    })
    .safeParse(req.body);

  if (!body.success) {
    return res.status(400).json({
      error: 'Invalid bulk decision request',
    });
  }

  const { reportIds, action, reason } = body.data;

  if (action === 'reject' && !reason) {
    return res.status(400).json({
      error: 'Rejection reason is required',
    });
  }

  const results = [];
  for (const reportId of reportIds) {
    const result = await decide(
      reportId,
      req.user!.id,
      action,
      reason,
    );

    results.push({
      reportId,
      ok: result.ok,
      ...(result.ok ? {} : { error: result.error }),
    });
  }

  const succeeded = results.filter((result) => result.ok).length;
  const failed = results.length - succeeded;

  return res.json({
    action,
    results,
    succeeded,
    failed,
  });
}));

reportsRouter.get('/payment-export', requireAuth, requireApprover, asyncHandler(async (_req, res) => {
  const result = await query<{
    id: number;
    title: string;
    period_start: string;
    period_end: string;
    owner_name: string;
    owner_email: string;
    total_cents: number;
    status: string;
    submitted_at: string | null;
    updated_at: string;
  }>(
    `SELECT
       expense_reports.id,
       expense_reports.title,
       expense_reports.period_start,
       expense_reports.period_end,
       users.name AS owner_name,
       users.email AS owner_email,
       ${TOTAL_SQL} AS total_cents,
       expense_reports.status,
       to_char(expense_reports.submitted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS submitted_at,
       to_char(expense_reports.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS updated_at
     FROM expense_reports
     JOIN users
       ON users.id = expense_reports.owner_id
     WHERE expense_reports.status = 'approved'
       AND expense_reports.archived_at IS NULL
     ORDER BY expense_reports.updated_at DESC,
              expense_reports.id DESC`,
  );

  const rows = result.rows;

  const escapeCsv = (value: unknown) => {
    const text = String(value ?? '');

    if (
      text.includes(',') ||
      text.includes('"') ||
      text.includes('\n') ||
      text.includes('\r')
    ) {
      return `"${text.replace(/"/g, '""')}"`;
    }

    return text;
  };

  const header = [
    'report_id',
    'title',
    'period_start',
    'period_end',
    'owner_name',
    'owner_email',
    'total_cents',
    'status',
    'submitted_at',
    'updated_at',
  ];

  const csvRows = rows.map((row) => [
    row.id,
    row.title,
    row.period_start,
    row.period_end,
    row.owner_name,
    row.owner_email,
    row.total_cents,
    row.status,
    row.submitted_at,
    row.updated_at,
  ]);

  const csv = [header, ...csvRows]
    .map((row) => row.map(escapeCsv).join(','))
    .join('\r\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');

  res.setHeader(
    'Content-Disposition',
    'attachment; filename="approved-awaiting-payment.csv"',
  );

  return res.send(csv);
}));

reportsRouter.post('/:id/approvers', requireAuth, asyncHandler(async (req, res) => {
  const report = await getReport(Number(req.params.id));

  if (!report) {
    return res.status(404).json({ error: 'Report not found' });
  }

  if (report.owner_id !== req.user!.id) {
    return res.status(403).json({
      error: 'Only the report owner can manage approvers',
    });
  }

  if (report.status !== 'draft') {
    return res.status(400).json({
      error: 'Approvers can only be assigned while the report is a draft',
    });
  }

  const body = z
    .object({
      approver_id: z.number().int().positive(),
    })
    .safeParse(req.body);

  if (!body.success) {
    return res.status(400).json({
      error: 'approver_id is required',
    });
  }

  const approverResult = await query<{ id: number; role: string }>(
    `SELECT id, role
     FROM users
     WHERE id = $1`,
    [body.data.approver_id],
  );
  const approver = approverResult.rows[0];

  if (!approver) {
    return res.status(404).json({
      error: 'Approver not found',
    });
  }

  if (approver.role !== 'approver') {
    return res.status(400).json({
      error: 'Only users with the approver role can be assigned',
    });
  }

  await withPgTransaction(async (client) => {
    await client.query(
      `INSERT INTO report_approvers (report_id, approver_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [report.id, approver.id],
    );

    await touchReport(report.id, client);
  });

  res.json({
    approvers: await getApprovers(report.id),
  });
}));

reportsRouter.patch('/:id', requireAuth, asyncHandler(async (req, res) => {
  const report = await loadOwnedDraft(req, res);
  if (!report) return;

  const body = z
    .object({
      title: z.string().min(1).optional(),
      period_start: z.string().min(1).optional(),
      period_end: z.string().min(1).optional(),
    })
    .safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'Invalid fields' });

  await query(
    `UPDATE expense_reports SET
       title = COALESCE($1, title),
       period_start = COALESCE($2, period_start),
       period_end = COALESCE($3, period_end),
       updated_at = now()
     WHERE id = $4`,
    [body.data.title ?? null, body.data.period_start ?? null, body.data.period_end ?? null, report.id],
  );

  res.json({ report: await serializeReport(report.id) });
}));

reportsRouter.get('/:id', requireAuth, asyncHandler(async (req, res) => {
  const report = await getReport(Number(req.params.id));
  if (!report) return res.status(404).json({ error: 'Report not found' });

  if (!canView(report, req.user!.id, req.user!.role)) {
    return res.status(403).json({ error: 'You cannot view this report' });
  }

  res.json({ report: await serializeReport(report.id) });
}));

reportsRouter.delete('/:id/approvers/:approverId', requireAuth, asyncHandler(async (req, res) => {
  const report = await getReport(Number(req.params.id));

  if (!report) {
    return res.status(404).json({ error: 'Report not found' });
  }

  if (report.owner_id !== req.user!.id) {
    return res.status(403).json({
      error: 'Only the report owner can manage approvers',
    });
  }

  if (report.status !== 'draft') {
    return res.status(400).json({
      error: 'Approvers can only be changed while the report is a draft',
    });
  }

  const approverId = Number(req.params.approverId);

  let rowCount = 0;
  await withPgTransaction(async (client) => {
    const result = await client.query(
      `DELETE FROM report_approvers
       WHERE report_id = $1 AND approver_id = $2`,
      [report.id, approverId],
    );

    rowCount = result.rowCount ?? 0;
    if (rowCount > 0) {
      await touchReport(report.id, client);
    }
  });

  if (rowCount === 0) {
    return res.status(404).json({
      error: 'Approver assignment not found',
    });
  }

  res.json({
    approvers: await getApprovers(report.id),
  });
}));

reportsRouter.post('/:id/archive', requireAuth, asyncHandler(async (req, res) => {
  const report = await getReport(Number(req.params.id));
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

  await query(
    `UPDATE expense_reports SET archived_at = now(), updated_at = now() WHERE id = $1`,
    [report.id],
  );

  res.json({ report: await serializeReport(report.id) });
}));

reportsRouter.post('/:id/restore', requireAuth, asyncHandler(async (req, res) => {
  const report = await getReport(Number(req.params.id));
  if (!report) return res.status(404).json({ error: 'Report not found' });
  if (report.owner_id !== req.user!.id) {
    return res.status(403).json({ error: 'Only the owner can restore a report' });
  }
  if (!report.archived_at) {
    return res.status(400).json({ error: 'Report is not archived' });
  }

  await query(
    `UPDATE expense_reports SET archived_at = NULL, updated_at = now() WHERE id = $1`,
    [report.id],
  );

  res.json({ report: await serializeReport(report.id) });
}));

const lineSchema = z.object({
  spent_on: z.string().min(1),
  amount_cents: z.number().int().nonnegative(),
  category: z.enum(CATEGORIES as unknown as [string, ...string[]]),
  description: z.string().min(1),
});

reportsRouter.post('/:id/lines', requireAuth, asyncHandler(async (req, res) => {
  const report = await loadOwnedDraft(req, res);
  if (!report) return;

  const body = lineSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'Invalid line fields' });

  const line = await withPgTransaction(async (client) => {
    const result = await client.query<ExpenseLineRow>(
      `INSERT INTO expense_lines (report_id, spent_on, amount_cents, category, description)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${LINE_COLUMNS}`,
      [report.id, body.data.spent_on, body.data.amount_cents, body.data.category, body.data.description],
    );

    await touchReport(report.id, client);
    return result.rows[0];
  });

  res.status(201).json({ line: serializeLine(line), total_cents: (await getReport(report.id))!.total_cents });
}));

reportsRouter.patch('/:id/lines/:lineId', requireAuth, asyncHandler(async (req, res) => {
  const report = await loadOwnedDraft(req, res);
  if (!report) return;

  const body = lineSchema.partial().safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'Invalid line fields' });

  const lineResult = await query<{ id: number }>(
    `SELECT id FROM expense_lines WHERE id = $1 AND report_id = $2`,
    [Number(req.params.lineId), report.id],
  );
  const line = lineResult.rows[0];
  if (!line) return res.status(404).json({ error: 'Line not found' });

  const updated = await withPgTransaction(async (client) => {
    const result = await client.query<ExpenseLineRow>(
      `UPDATE expense_lines SET
         spent_on = COALESCE($1, spent_on),
         amount_cents = COALESCE($2, amount_cents),
         category = COALESCE($3, category),
         description = COALESCE($4, description)
       WHERE id = $5
       RETURNING ${LINE_COLUMNS}`,
      [
        body.data.spent_on ?? null,
        body.data.amount_cents ?? null,
        body.data.category ?? null,
        body.data.description ?? null,
        line.id,
      ],
    );

    await touchReport(report.id, client);
    return result.rows[0];
  });

  res.json({ line: serializeLine(updated), total_cents: (await getReport(report.id))!.total_cents });
}));

reportsRouter.delete('/:id/lines/:lineId', requireAuth, asyncHandler(async (req, res) => {
  const report = await loadOwnedDraft(req, res);
  if (!report) return;

  let rowCount = 0;
  await withPgTransaction(async (client) => {
    const result = await client.query(
      `DELETE FROM expense_lines WHERE id = $1 AND report_id = $2`,
      [Number(req.params.lineId), report.id],
    );
    rowCount = result.rowCount ?? 0;
    if (rowCount > 0) {
      await touchReport(report.id, client);
    }
  });

  if (rowCount === 0) return res.status(404).json({ error: 'Line not found' });

  res.json({ ok: true, total_cents: (await getReport(report.id))!.total_cents });
}));

reportsRouter.post('/:id/submit', requireAuth, asyncHandler(async (req, res) => {
  const report = await getReport(Number(req.params.id));
  if (!report) return res.status(404).json({ error: 'Report not found' });
  if (report.owner_id !== req.user!.id) return res.status(403).json({ error: 'Only the report owner may submit it' });
  if (report.archived_at) return res.status(400).json({ error: 'Restore the report before submitting' });
  if (report.status !== 'draft') {
    return res.status(400).json({ error: `Cannot submit a report in status "${report.status}". Only draft reports can be submitted.` });
  }
  if (report.total_cents <= 0) return res.status(400).json({ error: 'Add at least one expense line before submitting' });

  const approverCountResult = await query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM report_approvers WHERE report_id = $1`,
    [report.id],
  );
  const approverCount = approverCountResult.rows[0].count;

  if (approverCount === 0) {
    return res.status(400).json({
      error: 'Assign at least one approver before submitting',
    });
  }

  await withPgTransaction(async (client) => {
    await client.query(
      `UPDATE expense_reports SET status = 'submitted', submitted_at = now(), updated_at = now()
       WHERE id = $1 AND status = 'draft'`,
      [report.id],
    );

    await addStatusEvent(client, report.id, 'draft', 'submitted', req.user!.id);
  });

  res.json({ report: await serializeReport(report.id) });
}));

reportsRouter.post('/:id/approve', requireAuth, asyncHandler(async (req, res) => {
  if (req.user!.role !== 'approver') return res.status(403).json({ error: 'Approver role required' });
  const id = Number(req.params.id);
  await respondDecide(res, id, await decide(id, req.user!.id, 'approve'));
}));

reportsRouter.post('/:id/reject', requireAuth, asyncHandler(async (req, res) => {
  if (req.user!.role !== 'approver') return res.status(403).json({ error: 'Approver role required' });
  const id = Number(req.params.id);
  const reason = typeof req.body?.reason === 'string' ? req.body.reason : '';
  await respondDecide(res, id, await decide(id, req.user!.id, 'reject', reason));
}));

reportsRouter.post('/:id/pay', requireAuth, asyncHandler(async (req, res) => {
  if (req.user!.role !== 'approver') return res.status(403).json({ error: 'Approver role required' });
  const id = Number(req.params.id);
  await respondDecide(res, id, await decide(id, req.user!.id, 'pay'));
}));

reportsRouter.get('/:id/history', requireAuth, asyncHandler(async (req, res) => {
  const report = await getReport(Number(req.params.id));
  if (!report) return res.status(404).json({ error: 'Report not found' });
  if (!canView(report, req.user!.id, req.user!.role)) return res.status(403).json({ error: 'You cannot view this report' });

  const events = await query(
    `SELECT
       se.id,
       se.report_id,
       se.old_status,
       se.new_status,
       se.actor_id,
       se.reason,
       to_char(se.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS created_at,
       u.name AS actor_name
     FROM status_events se
     JOIN users u ON u.id = se.actor_id
     WHERE se.report_id = $1 ORDER BY se.created_at, se.id`,
    [report.id],
  );

  const comments = await query(
    `SELECT
       c.id,
       c.report_id,
       c.author_id,
       c.body,
       to_char(c.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS created_at,
       u.name AS author_name
     FROM comments c
     JOIN users u ON u.id = c.author_id
     WHERE c.report_id = $1 ORDER BY c.created_at, c.id`,
    [report.id],
  );

  res.json({ events: events.rows, comments: comments.rows });
}));

reportsRouter.post('/:id/comments', requireAuth, asyncHandler(async (req, res) => {
  const report = await getReport(Number(req.params.id));
  if (!report) return res.status(404).json({ error: 'Report not found' });
  if (!canView(report, req.user!.id, req.user!.role)) return res.status(403).json({ error: 'You cannot comment on this report' });

  const body = z.object({ body: z.string().min(1) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'Comment body required' });

  const result = await query(
    `INSERT INTO comments (report_id, author_id, body)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [report.id, req.user!.id, body.data.body],
  );

  const comment = await query(
    `SELECT
       c.id,
       c.report_id,
       c.author_id,
       c.body,
       to_char(c.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS created_at,
       u.name AS author_name
     FROM comments c
     JOIN users u ON u.id = c.author_id WHERE c.id = $1`,
    [result.rows[0].id],
  );

  res.status(201).json({ comment: comment.rows[0] });
}));
