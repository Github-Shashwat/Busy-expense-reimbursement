import 'dotenv/config';
import bcrypt from 'bcryptjs';
import type { PoolClient } from 'pg';
import { migrate } from './db.js';
import { pgPool, withPgTransaction } from './postgres.js';

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

async function statusEvent(
  client: PoolClient,
  reportId: number,
  oldStatus: string | null,
  newStatus: string,
  actorId: number,
  reason?: string | null,
  createdAt?: string,
) {
  if (createdAt) {
    await client.query(
      `INSERT INTO status_events (report_id, old_status, new_status, actor_id, reason, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [reportId, oldStatus, newStatus, actorId, reason ?? null, createdAt],
    );
  } else {
    await client.query(
      `INSERT INTO status_events (report_id, old_status, new_status, actor_id, reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [reportId, oldStatus, newStatus, actorId, reason ?? null],
    );
  }
}

async function insertUser(
  client: PoolClient,
  email: string,
  passwordHash: string,
  name: string,
  role: string,
) {
  const result = await client.query<{ id: number }>(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [email, passwordHash, name, role],
  );

  return result.rows[0].id;
}

async function insertReport(
  client: PoolClient,
  ownerId: number,
  title: string,
  periodStart: string,
  periodEnd: string,
  status: string,
  submittedAt: string | null,
  archivedAt: string | null,
) {
  const result = await client.query<{ id: number }>(
    `INSERT INTO expense_reports (owner_id, title, period_start, period_end, status, submitted_at, archived_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [ownerId, title, periodStart, periodEnd, status, submittedAt, archivedAt],
  );

  return result.rows[0].id;
}

async function insertLine(
  client: PoolClient,
  reportId: number,
  spentOn: string,
  amountCents: number,
  category: string,
  description: string,
) {
  await client.query(
    `INSERT INTO expense_lines (report_id, spent_on, amount_cents, category, description)
     VALUES ($1, $2, $3, $4, $5)`,
    [reportId, spentOn, amountCents, category, description],
  );
}

async function assignApprover(client: PoolClient, reportId: number, approverId: number) {
  await client.query(
    `INSERT INTO report_approvers (report_id, approver_id)
     VALUES ($1, $2)`,
    [reportId, approverId],
  );
}

async function insertComment(
  client: PoolClient,
  reportId: number,
  authorId: number,
  body: string,
) {
  await client.query(
    `INSERT INTO comments (report_id, author_id, body)
     VALUES ($1, $2, $3)`,
    [reportId, authorId, body],
  );
}

/** Insert demo users + reports. Pass force=true to wipe existing data first. */
export async function seedDemoData(force = false) {
  await migrate();

  const countResult = await pgPool.query<{ c: number }>(`SELECT COUNT(*)::int AS c FROM users`);
  const count = countResult.rows[0].c;
  if (count > 0 && !force) return false;

  await withPgTransaction(async (client) => {
    if (force || count > 0) {
      await client.query(`
        TRUNCATE
          alert_dismissals,
          comments,
          status_events,
          report_approvers,
          expense_lines,
          expense_reports,
          users
        RESTART IDENTITY CASCADE
      `);
    }

    const hash = (p: string) => bcrypt.hashSync(p, 10);

    const aarav = await insertUser(client, 'aarav.sharma@demo.com', hash('password123'), 'Aarav Sharma', 'employee');
    const rohan = await insertUser(client, 'rohan.mehta@demo.com', hash('password123'), 'Rohan Mehta', 'employee');
    const priya = await insertUser(client, 'priya.iyer@demo.com', hash('password123'), 'Priya Iyer', 'approver');
    const neha = await insertUser(client, 'neha.verma@demo.com', hash('password123'), 'Neha Verma', 'approver');

    const r1 = await insertReport(client, aarav, 'March office supplies', '2026-03-01', '2026-03-15', 'draft', null, null);
    await insertLine(client, r1, '2026-03-03', 4500, 'supplies', 'Printer paper and pens');
    await insertLine(client, r1, '2026-03-10', 1200, 'other', 'USB cable');
    await assignApprover(client, r1, priya);
    await statusEvent(client, r1, null, 'draft', aarav, 'Report created');

    const r2 = await insertReport(client, rohan, 'Client visit — Mumbai', '2026-03-01', '2026-03-05', 'submitted', daysAgo(2), null);
    await insertLine(client, r2, '2026-03-01', 85000, 'travel', 'Flight DEL-BOM');
    await insertLine(client, r2, '2026-03-02', 32000, 'lodging', 'Hotel 2 nights');
    await insertLine(client, r2, '2026-03-02', 4500, 'meals', 'Client dinner');
    await assignApprover(client, r2, priya);
    await assignApprover(client, r2, neha);
    await statusEvent(client, r2, null, 'draft', rohan, 'Report created');
    await statusEvent(client, r2, 'draft', 'submitted', rohan);
    await insertComment(client, r2, rohan, 'Receipts uploaded to shared drive.');

    const r3 = await insertReport(client, priya, 'Conference travel — Priya', '2026-02-10', '2026-02-14', 'submitted', daysAgo(1), null);
    await insertLine(client, r3, '2026-02-11', 120000, 'travel', 'Round-trip airfare');
    await insertLine(client, r3, '2026-02-12', 15000, 'meals', 'Conference meals');
    await assignApprover(client, r3, neha);
    await statusEvent(client, r3, null, 'draft', priya, 'Report created');
    await statusEvent(client, r3, 'draft', 'submitted', priya);

    const r4 = await insertReport(client, aarav, 'Team lunch', '2026-02-20', '2026-02-20', 'approved', daysAgo(10), null);
    await insertLine(client, r4, '2026-02-20', 7800, 'meals', 'Team lunch after sprint');
    await assignApprover(client, r4, priya);
    await statusEvent(client, r4, null, 'draft', aarav, 'Report created');
    await statusEvent(client, r4, 'draft', 'submitted', aarav);
    await statusEvent(client, r4, 'submitted', 'approved', priya);

    const r5 = await insertReport(client, rohan, 'Taxi to airport', '2026-01-15', '2026-01-15', 'paid', daysAgo(40), null);
    await insertLine(client, r5, '2026-01-15', 2500, 'travel', 'Airport taxi');
    await assignApprover(client, r5, neha);
    await statusEvent(client, r5, null, 'draft', rohan, 'Report created');
    await statusEvent(client, r5, 'draft', 'submitted', rohan);
    await statusEvent(client, r5, 'submitted', 'approved', neha);
    await statusEvent(client, r5, 'approved', 'paid', neha, null, daysAgo(35));

    const r6 = await insertReport(client, aarav, 'Keyboard', '2026-02-01', '2026-02-01', 'paid', daysAgo(25), null);
    await insertLine(client, r6, '2026-02-01', 6500, 'supplies', 'Mechanical keyboard');
    await assignApprover(client, r6, priya);
    await statusEvent(client, r6, null, 'draft', aarav, 'Report created');
    await statusEvent(client, r6, 'draft', 'submitted', aarav);
    await statusEvent(client, r6, 'submitted', 'approved', priya);
    await statusEvent(client, r6, 'approved', 'paid', priya, null, daysAgo(20));

    const r7 = await insertReport(client, rohan, 'Stale: printer toner', '2026-01-01', '2026-01-05', 'submitted', daysAgo(12), null);
    await insertLine(client, r7, '2026-01-03', 3900, 'supplies', 'Toner cartridge');
    await assignApprover(client, r7, priya);
    await statusEvent(client, r7, null, 'draft', rohan, 'Report created');
    await statusEvent(client, r7, 'draft', 'submitted', rohan);

    const r8 = await insertReport(client, aarav, 'Old unused draft', '2025-12-01', '2025-12-05', 'draft', null, daysAgo(5));
    await insertLine(client, r8, '2025-12-02', 1000, 'other', 'Misc');
    await statusEvent(client, r8, null, 'draft', aarav, 'Report created');
  });

  return true;
}

const isDirectRun = process.argv[1]?.includes('seed');
if (isDirectRun) {
  try {
    await seedDemoData(true);
    console.log('Seeded demo users (password for all: password123)');
    console.log('  aarav.sharma@demo.com  employee');
    console.log('  rohan.mehta@demo.com   employee');
    console.log('  priya.iyer@demo.com    approver (also owns a submitted report)');
    console.log('  neha.verma@demo.com    approver');
    console.log('Database: PostgreSQL via DATABASE_URL');
  } finally {
    await pgPool.end();
  }
}
