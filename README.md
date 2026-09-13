# Expense Reimbursement

A full-stack expense reimbursement application built for the BUSY Infotech take-home assignment.

## Features

- Employee and approver authentication
- Expense report creation and editing
- Expense line-item management
- Server-calculated report totals
- Draft → Submitted → Approved → Paid lifecycle
- Rejection with reason and return to Draft
- Server-side authorization and self-approval prevention
- Multiple approvers per report
- Server-side search, filtering, sorting and pagination
- Bulk approve/reject with per-report results
- CSV export for approved reports awaiting payment
- Dashboard with reimbursement metrics and 8-week payment trends
- Immutable status history and comments
- Stale approval alerts with configurable thresholds
- Category spending-limit policy warnings

## Tech Stack

- React + TypeScript + Vite
- Tailwind CSS + React Router
- Node.js + Express + TypeScript
- PostgreSQL using `pg`
- Vercel for the frontend
- Render for the API and PostgreSQL database

## Local Development

See [`GETTING_STARTED.md`](./GETTING_STARTED.md) for setup and deployment instructions.

The application requires Node.js 22+.

Live application: https://busy-expense-reimbursement.vercel.app
API: https://expense-reimbursement-api.onrender.com

## Demo Accounts

| Role | Email | Password |
|---|---|---|
| Employee | `aarav.sharma@demo.com` | `password123` |
| Employee | `rohan.mehta@demo.com` | `password123` |
| Approver | `priya.iyer@demo.com` | `password123` |
| Approver | `neha.verma@demo.com` | `password123` |

## Project Documentation

- [`GETTING_STARTED.md`](./GETTING_STARTED.md) — local setup and deployment
- [`SUBMISSION.md`](./SUBMISSION.md) — submission details and requirement checklist
- [`docs/architecture.md`](./docs/architecture.md) — system architecture
- [`docs/schema.md`](./docs/schema.md) — database design
- [`docs/plan.md`](./docs/plan.md) — implementation plan and build order
- [`docs/decisions.md`](./docs/decisions.md) — engineering decisions and trade-offs
- [`docs/ai-prompts.md`](./docs/ai-prompts.md) — representative AI-assisted development prompts

## Deployment

The frontend and API are deployed separately:

- Frontend: Vercel
- API: Render Web Service
- Database: Render PostgreSQL

Production configuration is documented in [`GETTING_STARTED.md`](./GETTING_STARTED.md).
