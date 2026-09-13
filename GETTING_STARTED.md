# Getting Started

Expense reimbursement application for BUSY Infotech Assignment 11.

## Requirements

- **Node.js 22+**
- npm
- Docker, or another local PostgreSQL database

## Run locally

The local API uses PostgreSQL through `DATABASE_URL`. `DATABASE_PATH` is no longer used.

If you are using Docker, start a local PostgreSQL database on port `5432` before starting the API. Use your own local password and database name; do not reuse production credentials.

### 1. Start the API

```bash
cd server
Copy-Item .env.example .env
npm install
npm run dev

```

The API runs at `http://localhost:4000`.

On a fresh database, the server creates the schema and seeds the demo data automatically.

The server `.env` file must include:

```text
DATABASE_URL=postgres://<local-user>:<local-password>@localhost:5432/<local-database>
JWT_SECRET=<local-dev-secret>
CLIENT_ORIGIN=http://localhost:5173
STALE_DAYS=7
REDISMISS_DAYS=3

```

### 2. Start the UI

In a second terminal:

```bash
cd client
npm install
npm run dev

```

The UI runs at `http://localhost:5173`.

The local client does not require a `.env` file. Vite proxies local `/api` requests to `http://localhost:4000`, so the browser can call the API without a local `VITE_API_URL`.

Open `http://localhost:5173` and sign in with one of the demo accounts below.

### Reset demo data

To reset the database to the seeded demo state:

```bash
cd server
npm run seed

```

## Demo logins

| Role | Email | Password |
| --- | --- | --- |
| Employee | `aarav.sharma@demo.com` | `password123` |
| Employee | `rohan.mehta@demo.com` | `password123` |
| Approver | `priya.iyer@demo.com` | `password123` |
| Approver | `neha.verma@demo.com` | `password123` |

## Suggested demo flows

The following flows cover the main assignment requirements.

1. **Aarav** — open a draft report, edit its details, add/edit expense lines, and submit it.
2. **Priya** — open an assigned submitted report and approve it. Also try approving her own report; the server should reject the action.
3. **Neha** — review reports in the approver queue and mark an approved report as paid.
4. **Priya** — open the Alerts page, review the stale-report alert, and dismiss it.
5. **Queue** — select multiple submitted reports, including a report that Priya owns, and use bulk approve/reject. Review the per-report results.
6. **Find** — use server-side search, filtering, sorting, and pagination to locate reports.
7. **Payment export** — export approved reports awaiting payment as CSV from the queue page.
8. **Dashboard** — compare the employee dashboard with an approver dashboard to see the role-based metric scope.

## Deploy (free tier)

### 1. Database on Render

Create a Render PostgreSQL database. Copy its internal database URL for the API service's `DATABASE_URL` value.

The current demo deployment uses a free Render PostgreSQL database, which has a limited lifetime. For a longer-lived production deployment, move to a persistent paid database plan.

### 2. API on Render

Create a Render Web Service using the `server/` directory.

* **Build command:** `npm ci && npm run build`
* **Start command:** `npm start`

Set the following environment variables:

```text
JWT_SECRET=<strong-secret>
DATABASE_URL=<render-postgresql-internal-url>
CLIENT_ORIGIN=https://busy-expense-reimbursement.vercel.app
STALE_DAYS=7
REDISMISS_DAYS=3

```

### 3. UI on Vercel

Deploy the `client/` directory as the project root.

Set:

```text
VITE_API_URL=https://expense-reimbursement-api.onrender.com

```

The frontend then sends API requests to the deployed Render service.

### 4. Submission

Add the deployed frontend and API URLs to `SUBMISSION.md`.

The Render free tier may sleep when idle, so the first request after a period of inactivity may take longer while the service wakes up.
