# AI Prompts

AI (Cursor) was used selectively as a development aid during the project, primarily for scaffolding, debugging, implementation review, and documentation. The prompts below show representative examples of how AI was used during development and how incorrect or unsuitable suggestions were identified and corrected.

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

Finish the project documentation based on the implemented application. Document the architecture, schema, decisions, build plan, AI usage, local setup, and an incremental Git commit guide for a colleague. Do not create a GitHub repository.

### What came back

The documentation set was completed, including:

- `GETTING_STARTED.md`
- `docs/plan.md`
- `docs/architecture.md`
- `docs/schema.md`
- `docs/decisions.md`
- `docs/ai-prompts.md`
- `docs/COMMIT_GUIDE.md`
- `SUBMISSION.md`

### What was refined

The documentation was checked against the final implementation so that the documented lifecycle, authorization model, database design, demo setup, and deployment arrangement match the application rather than the initial plan.