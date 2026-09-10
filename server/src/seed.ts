import 'dotenv/config';
import path from 'path';
import bcrypt from 'bcryptjs';
import { db, migrate } from './db.js';

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function statusEvent(
  reportId: number,
  oldStatus: string | null,
  newStatus: string,
  actorId: number,
  reason?: string | null,
  createdAt?: string,
) {
  if (createdAt) {
    db.prepare(
      `INSERT INTO status_events (report_id, old_status, new_status, actor_id, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(reportId, oldStatus, newStatus, actorId, reason ?? null, createdAt);
  } else {
    db.prepare(
      `INSERT INTO status_events (report_id, old_status, new_status, actor_id, reason)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(reportId, oldStatus, newStatus, actorId, reason ?? null);
  }
}

/** Insert demo users + reports. Pass force=true to wipe existing data first. */
export function seedDemoData(force = false) {
  migrate();

  const count = (db.prepare(`SELECT COUNT(*) AS c FROM users`).get() as { c: number }).c;
  if (count > 0 && !force) return false;

  if (force || count > 0) {
    db.exec(`
      DELETE FROM alert_dismissals;
      DELETE FROM comments;
      DELETE FROM status_events;
      DELETE FROM report_approvers;
      DELETE FROM expense_lines;
      DELETE FROM expense_reports;
      DELETE FROM users;
    `);
  }

  const hash = (p: string) => bcrypt.hashSync(p, 10);
  const insertUser = db.prepare(
    `INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)`,
  );

  const alice = Number(
    insertUser.run('alice@demo.com', hash('password123'), 'Alice Employee', 'employee').lastInsertRowid,
  );
  const bob = Number(
    insertUser.run('bob@demo.com', hash('password123'), 'Bob Employee', 'employee').lastInsertRowid,
  );
  const cara = Number(
    insertUser.run('cara@demo.com', hash('password123'), 'Cara Approver', 'approver').lastInsertRowid,
  );
  const dan = Number(
    insertUser.run('dan@demo.com', hash('password123'), 'Dan Approver', 'approver').lastInsertRowid,
  );

  const insertReport = db.prepare(
    `INSERT INTO expense_reports (owner_id, title, period_start, period_end, status, submitted_at, archived_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertLine = db.prepare(
    `INSERT INTO expense_lines (report_id, spent_on, amount_cents, category, description)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const assign = db.prepare(`INSERT INTO report_approvers (report_id, approver_id) VALUES (?, ?)`);
  const comment = db.prepare(`INSERT INTO comments (report_id, author_id, body) VALUES (?, ?, ?)`);

  const r1 = Number(
    insertReport.run(alice, 'March office supplies', '2026-03-01', '2026-03-15', 'draft', null, null)
      .lastInsertRowid,
  );
  insertLine.run(r1, '2026-03-03', 4500, 'supplies', 'Printer paper and pens');
  insertLine.run(r1, '2026-03-10', 1200, 'other', 'USB cable');
  assign.run(r1, cara);
  statusEvent(r1, null, 'draft', alice, 'Report created');

  const r2 = Number(
    insertReport.run(bob, 'Client visit — Mumbai', '2026-03-01', '2026-03-05', 'submitted', daysAgo(2), null)
      .lastInsertRowid,
  );
  insertLine.run(r2, '2026-03-01', 85000, 'travel', 'Flight DEL-BOM');
  insertLine.run(r2, '2026-03-02', 32000, 'lodging', 'Hotel 2 nights');
  insertLine.run(r2, '2026-03-02', 4500, 'meals', 'Client dinner');
  assign.run(r2, cara);
  assign.run(r2, dan);
  statusEvent(r2, null, 'draft', bob, 'Report created');
  statusEvent(r2, 'draft', 'submitted', bob);
  comment.run(r2, bob, 'Receipts uploaded to shared drive.');

  const r3 = Number(
    insertReport.run(cara, 'Conference travel — Cara', '2026-02-10', '2026-02-14', 'submitted', daysAgo(1), null)
      .lastInsertRowid,
  );
  insertLine.run(r3, '2026-02-11', 120000, 'travel', 'Round-trip airfare');
  insertLine.run(r3, '2026-02-12', 15000, 'meals', 'Conference meals');
  assign.run(r3, dan);
  statusEvent(r3, null, 'draft', cara, 'Report created');
  statusEvent(r3, 'draft', 'submitted', cara);

  const r4 = Number(
    insertReport.run(alice, 'Team lunch', '2026-02-20', '2026-02-20', 'approved', daysAgo(10), null)
      .lastInsertRowid,
  );
  insertLine.run(r4, '2026-02-20', 7800, 'meals', 'Team lunch after sprint');
  assign.run(r4, cara);
  statusEvent(r4, null, 'draft', alice, 'Report created');
  statusEvent(r4, 'draft', 'submitted', alice);
  statusEvent(r4, 'submitted', 'approved', cara);

  const r5 = Number(
    insertReport.run(bob, 'Taxi to airport', '2026-01-15', '2026-01-15', 'paid', daysAgo(40), null)
      .lastInsertRowid,
  );
  insertLine.run(r5, '2026-01-15', 2500, 'travel', 'Airport taxi');
  assign.run(r5, dan);
  statusEvent(r5, null, 'draft', bob, 'Report created');
  statusEvent(r5, 'draft', 'submitted', bob);
  statusEvent(r5, 'submitted', 'approved', dan);
  statusEvent(r5, 'approved', 'paid', dan, null, daysAgo(35));

  const r6 = Number(
    insertReport.run(alice, 'Keyboard', '2026-02-01', '2026-02-01', 'paid', daysAgo(25), null)
      .lastInsertRowid,
  );
  insertLine.run(r6, '2026-02-01', 6500, 'supplies', 'Mechanical keyboard');
  assign.run(r6, cara);
  statusEvent(r6, null, 'draft', alice, 'Report created');
  statusEvent(r6, 'draft', 'submitted', alice);
  statusEvent(r6, 'submitted', 'approved', cara);
  statusEvent(r6, 'approved', 'paid', cara, null, daysAgo(20));

  const r7 = Number(
    insertReport.run(bob, 'Stale: printer toner', '2026-01-01', '2026-01-05', 'submitted', daysAgo(12), null)
      .lastInsertRowid,
  );
  insertLine.run(r7, '2026-01-03', 3900, 'supplies', 'Toner cartridge');
  assign.run(r7, cara);
  statusEvent(r7, null, 'draft', bob, 'Report created');
  statusEvent(r7, 'draft', 'submitted', bob);

  const r8 = Number(
    insertReport.run(alice, 'Old unused draft', '2025-12-01', '2025-12-05', 'draft', null, daysAgo(5))
      .lastInsertRowid,
  );
  insertLine.run(r8, '2025-12-02', 1000, 'other', 'Misc');
  statusEvent(r8, null, 'draft', alice, 'Report created');

  return true;
}

const isDirectRun = process.argv[1]?.includes('seed');
if (isDirectRun) {
  seedDemoData(true);
  const dbPath = process.env.DATABASE_PATH || './data/app.db';
  console.log('Seeded demo users (password for all: password123)');
  console.log('  alice@demo.com  employee');
  console.log('  bob@demo.com    employee');
  console.log('  cara@demo.com   approver (also owns a submitted report)');
  console.log('  dan@demo.com    approver');
  console.log(`Database: ${path.resolve(dbPath)}`);
}
