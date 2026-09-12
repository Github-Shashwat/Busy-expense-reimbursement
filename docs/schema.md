# Schema

SQLite database. Monetary amounts are stored as **integer cents**. Report totals are **never stored**; they are always computed from:

`SUM(expense_lines.amount_cents)`

## Tables

### users

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| email | TEXT UNIQUE | Login lookup is case-insensitive/lowercased |
| password_hash | TEXT | bcrypt hash |
| name | TEXT | |
| role | TEXT | `employee` \| `approver` |
| created_at | TEXT | |

### expense_reports

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| owner_id | INTEGER FK → users | Exactly one owner |
| title | TEXT | |
| period_start / period_end | TEXT | Report date range |
| status | TEXT | `draft` \| `submitted` \| `approved` \| `paid` |
| submitted_at | TEXT NULL | Set when submitted; cleared when rejected back to draft |
| archived_at | TEXT NULL | Soft archive; history is retained |
| created_at / updated_at | TEXT | |

`rejected` is not a persistent report status. A rejection is recorded in `status_events`, and the report returns to `draft`.

### expense_lines

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| report_id | INTEGER FK | `ON DELETE CASCADE` |
| spent_on | TEXT | Expense date |
| amount_cents | INTEGER ≥ 0 | Monetary value in cents |
| category | TEXT | `travel` \| `meals` \| `supplies` \| `lodging` \| `other` |
| description | TEXT | |
| created_at | TEXT | |

The report total is calculated from these rows on the server. The client cannot set or override the report total.

### report_approvers (many-to-many)

| Column | Type | Notes |
|--------|------|-------|
| report_id | INTEGER PK part, FK | |
| approver_id | INTEGER PK part, FK → users | |

The composite primary key prevents assigning the same approver to a report more than once.

A report can have any number of assigned approvers. Only an assigned approver can approve or reject the report.

### status_events (append-only)

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| report_id | INTEGER FK | |
| old_status | TEXT NULL | `NULL` for the initial event |
| new_status | TEXT | New lifecycle state |
| actor_id | INTEGER FK → users | User who caused the transition |
| reason | TEXT NULL | Required for rejection |
| created_at | TEXT | |

Every lifecycle transition creates a status event. Rejection records the reason and the transition back to `draft`.

### comments (append-only)

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| report_id | INTEGER FK | |
| author_id | INTEGER FK | User who added the comment |
| body | TEXT | |
| created_at | TEXT | |

Comments are retained as part of the report timeline.

### alert_dismissals

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| report_id | INTEGER FK | |
| approver_id | INTEGER FK → users | |
| dismissed_at | TEXT | Updated when dismissed |

`report_id + approver_id` is unique, so each approver has one dismissal record per report. A stale alert becomes visible again after `REDISMISS_DAYS`.

## Relationships

- **1:N** user → reports (owner)
- **1:N** report → expense lines
- **1:N** report → status events
- **1:N** report → comments
- **N:M** reports ↔ approvers via `report_approvers`
- **1:N** approver/report relationship → alert dismissal records

## DB vs application constraints

| In the database | In application code |
|-----------------|---------------------|
| Foreign keys | Lifecycle transition rules |
| Unique email | Cannot approve/reject own report |
| Role CHECK | Only assigned approvers can decide |
| Status CHECK | Draft-only report/line editing |
| Category CHECK | Rejection reason is required |
| Non-negative amounts | Reports must contain a positive total before submission |
| Unique report/approver pair | At least one approver is required before submission |
| Unique report/approver dismissal pair | Alert eligibility and stale-period calculations |

The database handles structural and data-integrity constraints. Workflow rules remain in application code because they depend on the current user, report state, assignments, and the requested action, and need clear API-level error messages.

## Denormalisation

There is no denormalised report total. Totals are calculated from `expense_lines` whenever required.

The report's current `status` is stored directly on `expense_reports`, while the complete transition history is stored in `status_events`. Storing the current status avoids repeatedly deriving the current state from the latest history row and keeps filtering and lifecycle queries straightforward.

## What breaks first at 100× data

1. **Dashboard aggregates** — repeated full-table aggregations will become increasingly expensive; date-based indexing/partitioning or pre-aggregated reporting data may become appropriate.

2. **Title search** — `LIKE '%title%'` does not scale well for large datasets; SQLite FTS or another search strategy would be preferable.

3. **SQLite write concurrency** — a single SQLite writer can become a bottleneck under heavy concurrent approval activity; PostgreSQL would be the natural next step if concurrent production traffic makes this a real constraint.

The current design deliberately favors a small, understandable SQLite application over premature infrastructure complexity.