# Architecture

## Moving pieces

1. **Browser (React + Vite + Tailwind)** — SPA in `client/`. Uses `fetch` to call the API and stores the authenticated Bearer JWT in `localStorage`. Pages cover login, reports, report details, approver queue, find, alerts, and dashboard.

2. **API (Express + TypeScript)** — HTTP JSON API in `server/`. Handles authentication, authorization, report/line CRUD, lifecycle transitions, approver assignments, search/filtering/pagination, bulk decisions, dashboard aggregates, stale alerts, and payment CSV export.

3. **SQLite database** — single SQLite file accessed through Node's built-in `node:sqlite` (`DatabaseSync`). The schema is created on startup and demo data is seeded when the `users` table is empty.

```text
Browser
   │
   │ JSON + Bearer JWT
   ▼
Express API
   │
   │ SQL
   ▼
SQLite file
````

## Where each piece runs

| Piece       | Local                             | Production                                            |
| ----------- | --------------------------------- | ----------------------------------------------------- |
| React UI    | Vite on `:5173` with `/api` proxy | Vercel static build; `VITE_API_URL` points to the API |
| Express API | `tsx` on `:4000`                  | Render Web Service                                    |
| SQLite      | `server/data/app.db`              | Render persistent disk, e.g. `/data/app.db`           |

The production deployment is intentionally small: Vercel serves the frontend, Render runs the API, and the SQLite database lives on Render's persistent disk.

## Authorization model

Authorization is enforced by the API rather than by the frontend.

* `requireAuth` validates the JWT and identifies the current user.
* `requireApprover` restricts approver-only endpoints.
* Employees can access their own reports.
* Approvers can view submitted/approved/paid reports belonging to other users.
* Only an approver assigned to a submitted report can approve or reject it.
* A report owner can manage its approver assignments while the report is in `draft`.
* An approver can never approve or reject their own report.

The frontend hides or shows controls based on role and report state for usability, but the server remains the source of truth.

## Request path: approve a report

1. An approver clicks **Approve** on the report detail page.
2. The client sends `POST /api/reports/:id/approve` with `Authorization: Bearer <jwt>`.
3. `requireAuth` verifies the JWT and attaches the user to the request.
4. `requireApprover` verifies that the user has the `approver` role.
5. The centralized `decide(id, userId, 'approve')` function loads the report and checks:

   * the report exists;
   * the report is in `submitted` state;
   * the approver is assigned to the report;
   * the approver is not the report owner.
6. On success, the API updates the report to `approved` and inserts an append-only `status_events` row.
7. The API returns the updated report.
8. The UI refreshes the report detail and timeline.

Individual and bulk approval/rejection use the same lifecycle decision logic so that authorization and transition rules do not diverge between the two paths.

## Server-side totals

Expense report totals are not accepted from the browser and are not stored as a report column.

The API calculates the total from:

`SUM(expense_lines.amount_cents)`

This means adding, editing, or removing a line automatically changes the authoritative report total, and a client cannot manipulate the total by submitting a different value.

## Lifecycle and history

The current lifecycle state is stored on `expense_reports.status` for efficient queries.

Every status transition also creates an append-only `status_events` record containing the previous status, new status, actor, timestamp, and optional rejection reason.

Rejection is represented as a history event and returns the report to `draft`; `rejected` is therefore not a persistent report state.

Comments are also append-only and form part of the report timeline.

## Search and reporting

Report search, filtering, sorting, and pagination are performed by the API.

The server also returns the total matching count so the frontend can render pagination without loading the complete dataset.

Dashboard aggregates are role-scoped:

* **Employees:** metrics for their own reports.
* **Approvers:** company-wide reimbursement metrics.

## What we did not build

* Stretch goals such as OCR, multi-currency, and complex approval chains
* Email/push notifications
* Redis or other caching infrastructure
* ORM
* Microservices
* Editing or deleting timeline events/comments
* A separate company-wide report browser for employees
* Automated deployment/GitHub workflows from this workspace

Employees use **My Reports**, while approvers use **Find**, **Queue**, and the dashboard for broader visibility.
