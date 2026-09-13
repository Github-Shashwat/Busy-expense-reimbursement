# Decisions

## Decision 1 — Database implementation

- **Chose:** PostgreSQL using the `pg` package
- **Previously used:** Node.js built-in `node:sqlite` (`DatabaseSync`)
- **Why:** SQLite was useful during the initial take-home build, especially after `better-sqlite3` failed to compile on Node 25. The final deployed application uses PostgreSQL so the production API runs against managed database infrastructure rather than a local SQLite file.

## Decision 2 — Authentication

- **Chose:** JWT in the `Authorization: Bearer` header with the token stored in `localStorage`
- **Rejected:** httpOnly cookie-based sessions
- **Why:** The frontend and API are intended to run on separate origins (Vercel and Render). Bearer authentication keeps the SPA/API boundary straightforward and avoids cross-origin cookie/session configuration. This is appropriate for the scope of the take-home application.

## Decision 3 — Money representation and totals

- **Chose:** Store monetary values as integer cents and calculate report totals in SQL
- **Rejected:** Floating-point monetary values and client-supplied report totals
- **Why:** Integer cents avoid floating-point rounding issues. Computing totals from `expense_lines.amount_cents` on the server ensures the client cannot manipulate the authoritative report total.

## Decision 4 — Centralized lifecycle decisions

- **Chose:** A single `decide()` helper for approve, reject, and pay operations, reused by bulk actions
- **Rejected:** Duplicating transition and authorization checks across individual routes
- **Why:** Lifecycle rules such as valid transitions, self-approval prevention, and approver assignment remain consistent. Bulk operations can reuse the same rules and return the same per-item errors as individual decisions.

## Decision 5 — Automatic demo seeding

- **Chose:** Seed demo users/data automatically when the `users` table is empty; retain an explicit `npm run seed` command for resetting demo data
- **Rejected:** Requiring a separate seed command before the first `npm run dev`
- **Why:** A fresh clone should be runnable with minimal setup. Automatic seeding makes local startup simpler while the explicit seed command remains useful when a clean demo dataset is needed.

## Decision 6 — Rejection returns directly to Draft

- **Chose:** Record the rejection in `status_events` and return the report to `draft`
- **Rejected:** Keeping the report in a persistent `rejected` state until the owner explicitly reopens it
- **Why:** The required workflow says rejection returns the report to Draft for editing and resubmission. The rejection reason and transition history remain visible through the append-only timeline, while the current report state stays simple.

## Decision 7 — Approver assignment as many-to-many

- **Chose:** Store report/approver assignments in a separate `report_approvers` join table
- **Rejected:** A single `approver_id` column on `expense_reports`
- **Why:** A report may have multiple approvers, and an approver may be assigned to many reports. The join table directly models this relationship and allows the approval queue to distinguish between general report visibility and permission to make a decision.

## Decision 8 — Server-side report querying

- **Chose:** Search, filtering, sorting, pagination, and total counts on the API
- **Rejected:** Loading all reports into the browser and filtering client-side
- **Why:** Authorization and result selection remain server-controlled, and the approach scales better as the report dataset grows. The API returns the matching total count so the UI can build pagination without retrieving every row.

## Decision 9 — Role-scoped dashboard

- **Chose:** Employees see metrics for their own reports; approvers see company-wide reimbursement metrics
- **Rejected:** One unrestricted dashboard dataset for every role
- **Why:** Dashboard aggregates must follow the same access model as report data. This prevents employees from receiving company-wide reimbursement information while still giving approvers the overview required for their role.
