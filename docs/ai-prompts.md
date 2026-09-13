# AI Prompts

AI (Codex/Cursor) was used selectively as a development aid during the project, including for scaffolding, debugging, implementation review, documentation, and the SQLite-to-PostgreSQL migration. The developer reviewed and verified the resulting changes through builds, tests, fresh database initialization, API regression checks, and production smoke testing. The prompts below show representative examples of how AI was used during development and how incorrect or unsuitable suggestions were identified and corrected.

## Assignment intake and planning

### Prompt

Paste the BUSY assignment email and README, then identify the required functionality, propose a build order, and plan the implementation using React/Vite/Tailwind, Express/TypeScript, SQLite, JWT, and bcrypt.

### What came back

A phased implementation plan covering authentication, reports and line items, lifecycle/history, approver assignment, search, bulk actions, dashboard, alerts, deployment, and documentation.

### What was refined

The plan was narrowed to the required scope. GitHub repository creation/deployment automation was kept outside the workspace because a colleague was handling the repository history and hosting workflow. The technology stack was fixed early so implementation decisions stayed consistent.

## Scaffold server and client

### Prompt

Help set up the project structure and initial implementation for the agreed stack: React/Vite/Tailwind, Express/TypeScript, SQLite, JWT, and bcrypt. Keep the implementation simple and aligned with the assignment requirements.

### What came back

Initial project structure, database setup, authentication flow, API routes, and frontend page scaffolding.

### What was refined

The implementation was reviewed and adapted as the individual requirements were built out. Several route, typing, authorization, and UI issues were corrected during iteration and manual testing.

Examples included:

- correcting route import paths;
- fixing type-only imports;
- removing unused helpers;
- ensuring parameterized report routes did not conflict with bulk endpoints;
- refining authorization boundaries between employees and approvers;
- preserving required report and line-item editing paths.

## Prompt that produced something wrong

### Prompt

Set up the SQLite database using `better-sqlite3` and configure the seed flow.

### What came back

A database implementation based on `better-sqlite3`.

### What was wrong

The native dependency failed to compile in the Node 25 environment because of the native build/node-gyp toolchain.

### What was corrected

The implementation was switched to Node's built-in `node:sqlite` (`DatabaseSync`), avoiding the native dependency while retaining the SQLite-based design.

The Node engine requirement and database setup were updated accordingly, and the main authentication, report, approval, bulk-action, alert, and pagination flows were re-tested.

## SQLite-to-PostgreSQL migration

### Prompt

Inspect the existing SQLite implementation and produce a staged migration plan to PostgreSQL using `pg`, without introducing an ORM or changing the Express API, business logic, authorization rules, dashboard behavior, alerts, CSV export, or frontend contracts.

### What came back

A staged plan covering PostgreSQL connection infrastructure, schema and seed migration, route-by-route conversion, compatibility cleanup, and full regression verification.

### What was refined

The migration was done in small stages and verified after each stage:

- PostgreSQL connection infrastructure using `pg.Pool` and `DATABASE_URL`;
- PostgreSQL schema and demo seed migration with `INSERT ... RETURNING`;
- authentication route migration;
- report route migration, including lifecycle transactions and server-computed totals;
- dashboard, export, and alert route migration, including role-scoped metrics and stale-alert date arithmetic;
- removal of the temporary SQLite compatibility layer;
- fresh database initialization, seed verification, API regression checks, and production smoke testing.

### Incorrect result / correction

One migration review initially risked treating PostgreSQL week formatting as interchangeable with SQLite `strftime('%Y-W%W')`. That was corrected by preserving the historical SQLite-style week label semantics for the dashboard's 8-week chart while still using PostgreSQL for the underlying paid-report aggregation.

## Implementation review and refinement

### Prompt

Review the completed implementation against the assignment requirements. Check authorization, lifecycle transitions, report totals, search/pagination, bulk actions, dashboard behavior, and edge cases. Keep the implementation simple and appropriate for a take-home project.

### What came back

A review of the implemented workflows with areas requiring additional checks and refinement.

### What was refined

The final implementation was checked to ensure that:

- report totals are calculated from expense lines on the server;
- reports cannot be submitted without expense lines and an assigned approver;
- employees cannot access other users' drafts;
- approvers cannot approve or reject their own reports;
- only assigned approvers can make approval decisions;
- archived reports cannot be acted on through inappropriate lifecycle operations;
- dashboard metrics respect the user's role;
- the dashboard provides consistent 8-week buckets;
- queue results are paginated server-side;
- concurrent approval decisions use conditional updates to prevent an already-decided report from being transitioned again.

## Docs and handoff

### Prompt

Finish the project documentation based on the implemented application. Document the architecture, schema, decisions, build plan, AI usage, local setup, and handoff notes for a colleague. Do not create a GitHub repository.

### What came back

The documentation set was completed, including:

- `GETTING_STARTED.md`
- `docs/plan.md`
- `docs/architecture.md`
- `docs/schema.md`
- `docs/decisions.md`
- `docs/ai-prompts.md`
- `SUBMISSION.md`

### What was refined

The documentation was checked against the final implementation so that the documented lifecycle, authorization model, database design, demo setup, and deployment arrangement match the application rather than the initial plan.
