import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';

const dbPath = process.env.DATABASE_PATH || './data/app.db';
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('employee', 'approver')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS expense_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'paid'))
        DEFAULT 'draft',
      submitted_at TEXT,
      archived_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS expense_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL REFERENCES expense_reports(id) ON DELETE CASCADE,
      spent_on TEXT NOT NULL,
      amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
      category TEXT NOT NULL CHECK (category IN (
        'travel', 'meals', 'supplies', 'lodging', 'other'
      )),
      description TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS report_approvers (
      report_id INTEGER NOT NULL REFERENCES expense_reports(id) ON DELETE CASCADE,
      approver_id INTEGER NOT NULL REFERENCES users(id),
      PRIMARY KEY (report_id, approver_id)
    );

    CREATE TABLE IF NOT EXISTS status_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL REFERENCES expense_reports(id) ON DELETE CASCADE,
      old_status TEXT,
      new_status TEXT NOT NULL,
      actor_id INTEGER NOT NULL REFERENCES users(id),
      reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL REFERENCES expense_reports(id) ON DELETE CASCADE,
      author_id INTEGER NOT NULL REFERENCES users(id),
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS alert_dismissals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL REFERENCES expense_reports(id) ON DELETE CASCADE,
      approver_id INTEGER NOT NULL REFERENCES users(id),
      dismissed_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (report_id, approver_id)
    );

    CREATE INDEX IF NOT EXISTS idx_reports_owner ON expense_reports(owner_id);
    CREATE INDEX IF NOT EXISTS idx_reports_status ON expense_reports(status);
    CREATE INDEX IF NOT EXISTS idx_reports_submitted ON expense_reports(submitted_at);
    CREATE INDEX IF NOT EXISTS idx_lines_report ON expense_lines(report_id);
  `);
}

export function withTransaction(fn: () => void) {
  db.exec('BEGIN');
  try {
    fn();
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export const CATEGORIES = ['travel', 'meals', 'supplies', 'lodging', 'other'] as const;
export type Role = 'employee' | 'approver';
export type Status = 'draft' | 'submitted' | 'approved' | 'rejected' | 'paid';
