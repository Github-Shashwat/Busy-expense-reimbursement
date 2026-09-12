# Submission

## Links

- **GitHub repository:** <public repo URL>
- **Live application:** <deployed URL>

## Notes for the reviewer

- The application can be run locally using the `server` + `client` setup described in `GETTING_STARTED.md`.
- Requires **Node.js 22+** because the application uses Node's built-in `node:sqlite`.
- Demo data is automatically seeded when the database is empty.
- To reset the demo data, run `cd server && npm run seed`.
- If deployed on Render's free tier, the API may sleep when idle; the first request after inactivity may take longer.
- SQLite is stored on the Render persistent disk in production.

## Demo credentials

| Role | Email | Password |
|------|-------|----------|
| Employee | `aarav.sharma@demo.com` | `password123` |
| Employee | `rohan.mehta@demo.com` | `password123` |
| Approver | `priya.iyer@demo.com` | `password123` |
| Approver | `neha.verma@demo.com` | `password123` |

## Stack

| Layer | What you used | Why |
|-------|---------------|-----|
| Frontend | React + Vite + TypeScript + Tailwind + React Router | Fast SPA with a simple, maintainable UI |
| Backend | Node.js + Express + TypeScript | Straightforward REST API |
| Database | SQLite via `node:sqlite` | File-based and requires no separate database server |
| Hosting | Render (API) + Vercel (UI) | Simple free-tier deployment matching the assignment |

## Goal checklist

| # | Goal | Status | Notes |
|---|------|--------|-------|
| 1 | Accounts and roles | Done | Employee/approver roles; authorization enforced server-side |
| 2 | Expense reports | Done | Title, date range, ownership, archive/restore |
| 3 | Expense lines | Done | Fixed categories; totals calculated server-side from line items |
| 4 | Report lifecycle | Done | Draft → Submitted → Approved → Paid; rejection returns to Draft with reason; self-approval blocked |
| 5 | Assigned approvers | Done | Many-to-many assignments; full queue and assigned-to-me filtering |
| 6 | Finding reports | Done | Server-side search, filtering, sorting, pagination, and total count |
| 7 | Bulk + CSV | Done | Per-item bulk results; approve/reject; approved-awaiting-payment CSV export |
| 8 | Dashboard | Done | Headlines, status/category breakdowns, and 8-week paid chart |
| 9 | Immutable history | Done | Append-only status events and comments; no edit/delete APIs |
| 10 | Stale-approval alerts | Done | Configurable `STALE_DAYS` / `REDISMISS_DAYS`; navigation badge and dismissal |

## How much time did you actually spend?

About **12 hours** across planning, implementation, documentation, and review.

## What would you do next, with another 12 hours?

I would add automated API tests for lifecycle and authorization edge cases, improve production database scalability with PostgreSQL if needed, and add receipt file uploads with appropriate storage and access controls.

## What are you least happy with in this codebase, and why?

The dashboard and report-list queries are intentionally straightforward rather than heavily optimized. They are appropriate for the scale of this take-home, but at larger data volumes I would add targeted indexes and full-text search where useful, and consider PostgreSQL for higher concurrent workloads.