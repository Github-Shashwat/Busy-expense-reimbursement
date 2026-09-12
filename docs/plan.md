# Plan

## Sessions (≈12 hours)

| Session | Goal | Built |
|---------|------|-------|
| 1 | Accounts/roles | Monorepo, SQLite schema/migration, JWT login, seeded employee/approver users |
| 2 | Reports + lines | Report CRUD, line-item CRUD, archive/restore, server-computed SQL totals |
| 3 | Lifecycle + history | Draft → Submitted → Approved/Paid flow, rejection back to Draft, self-approval block, immutable status history, comments |
| 4 | Approvers + queue | Many-to-many approver assignments, assigned approval queue, server-side authorization |
| 5 | Find + pagination | Server-side search, status/owner/approver filters, sorting, pagination, total counts |
| 6 | Bulk + payment export | Bulk approve/reject with per-item results, rejection reasons, approved-awaiting-payment CSV export |
| 7 | Dashboard + frontend integration | Role-aware dashboard metrics, category breakdown, 8-week paid chart, connected frontend workflows |
| 8 | UI polish + final QA | Consistent UI, navigation/back-link behavior, alerts, demo data cleanup, manual smoke testing, documentation |

## Order and why

Auth and schema came first so every later feature could derive identity and enforce authorization on the server.

Reports and line items came before the lifecycle because there must be a persisted report to transition. Totals are computed from line items on the server rather than accepted from the client.

The lifecycle and history model came next because bulk actions and the approval queue depend on the same centralized decision rules. Rejection is modeled as a transition back to `Draft` with a required reason rather than as a persistent `Rejected` status.

Approver assignment was added before the approval queue so that viewing a submitted report and being authorized to decide it could be treated as separate permissions. A report can have multiple assigned approvers, while only an assigned approver can approve or reject it.

Search, filtering, sorting, and pagination were implemented server-side once the report dataset and authorization rules were established. This keeps both access control and result counts on the server.

Bulk approval/rejection reuses the same lifecycle decision logic as individual actions, with a per-report result so one failure does not hide the outcome of the other items. The payment export is limited to approved reports awaiting payment.

The dashboard was added after the underlying report data was stable. Employees see metrics for their own reports, while approvers see company-wide reimbursement activity.

Alerts depend on submitted reports, approver assignments, and elapsed time, so they were added after those pieces were available. Final UI work and QA came last to avoid polishing screens before the underlying workflows were stable.

## Estimate vs actual

| Area | Estimate | Actual (approx.) |
|------|----------|------------------|
| Scaffold + auth | 2h | ~2h |
| Reports/lines/lifecycle | 4h | ~3.5h |
| Approvers/search/bulk/dashboard/alerts | 4h | ~3.5h |
| Frontend polish + docs + review | 2h | ~2h |

Switched from `better-sqlite3` to Node's built-in `node:sqlite` after the native dependency failed to build on Node 25. This removed the native build issue while keeping SQLite and the overall architecture simple.

## What we cut

- Stretch ideas such as OCR and multi-currency support
- ORM; the application uses SQLite directly
- A large automated test suite; validation was performed through targeted manual/API smoke checks
- Advanced UI features beyond what was needed for the reimbursement workflow
- Automated GitHub/deployment work from this workspace