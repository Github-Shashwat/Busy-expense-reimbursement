# Getting started

Expense reimbursement app for BUSY Infotech Assignment 11.

## Requirements

- **Node.js 22+** (uses built-in `node:sqlite`)
- npm

## Run locally

```bash
# Terminal 1 — API (auto-creates DB + demo data on first start)
cd server
cp .env.example .env   # if you don't already have .env
npm install
npm run dev            # http://localhost:4000

# Terminal 2 — UI
cd client
npm install
npm run dev            # http://localhost:5173
```

Open http://localhost:5173 and sign in with a demo account.

Reset demo data anytime:

```bash
cd server && npm run seed
```

## Demo logins

| Role | Email | Password |
|------|-------|----------|
| Employee | alice@demo.com | password123 |
| Employee | bob@demo.com | password123 |
| Approver (also owns a submitted report) | cara@demo.com | password123 |
| Approver | dan@demo.com | password123 |

**Try these flows**

1. Alice — edit draft, add lines, submit.
2. Cara — approve Bob’s report; try approving her **own** report (should fail).
3. Dan — approve Cara’s report; mark an approved report paid.
4. Cara — Alerts badge for the stale toner report; dismiss it.
5. Queue — bulk-select including Cara’s own report; bulk approve and read per-item results.
6. Export CSV of reimbursements due from the queue page.

## Deploy (free tier)

1. **API on Render** — Web Service from `server/`. Build: `npm install && npm run build`. Start: `npm start`. Env: `JWT_SECRET`, `DATABASE_PATH=/data/app.db`, `CLIENT_ORIGIN=<vercel-url>`, `STALE_DAYS=7`, `REDISMISS_DAYS=3`. Attach a persistent disk at `/data`.
2. **UI on Vercel** — Root directory `client`. Env: `VITE_API_URL=https://<render-url>`.
3. Put both URLs in `SUBMISSION.md`.

Render free tier sleeps when idle — note that in `SUBMISSION.md`.


