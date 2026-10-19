# TalentFlow ATS

Multi-tenant applicant tracking system: platform admins provision customer organizations; customer users manage jobs, candidates and a compact Kanban pipeline; tenant isolation is enforced in PostgreSQL with row level security.

**Project status (2026-10-19):** Phase 0 complete — scaffold, database schema, RLS policies, local verification harness and documentation. No product features are implemented yet. See `docs/PRD.md` for requirement status and `docs/DAILY_LOG.md` for verified evidence.

## Stack

| Layer      | Choice                                                                        |
| ---------- | ----------------------------------------------------------------------------- |
| Framework  | Next.js 16 (App Router), React 19, TypeScript (strict)                        |
| UI         | Tailwind CSS 4, shadcn/ui (Radix base), Motion for React, lucide icons        |
| Backend    | Supabase Auth + PostgreSQL with RLS; SQL migrations in `supabase/migrations/` |
| Validation | Zod (shared between forms and Server Actions)                                 |
| Tests      | Vitest (unit + RLS on embedded PostgreSQL), Playwright (E2E)                  |
| Hosting    | Azure App Service (Linux, Node 22) running the standalone build               |

## Local setup

Requirements: Node 22, pnpm 10 (`corepack enable` or `npm i -g pnpm`).

```bash
pnpm install
cp .env.example .env.local        # fill in Supabase values once a project exists
pnpm dev                          # http://localhost:3000
```

Without a Supabase project you can still run everything except the authenticated app:

```bash
pnpm lint          # ESLint
pnpm typecheck     # tsc --noEmit
pnpm test          # unit tests (Vitest)
pnpm db:verify     # boots embedded PostgreSQL 17, applies migrations, runs the RLS suite
pnpm build         # production build (standalone) + asset copy
pnpm start         # node .next/standalone/server.js
pnpm check         # all of the above except start
```

End-to-end tests (`pnpm test:e2e`) need `pnpm exec playwright install chromium`, a built app and, for authenticated flows, a hosted Supabase project (see `docs/TEST_PLAN.md`).

## Repository layout

```
src/app            routes (App Router); api/health for probes
src/proxy.ts       session refresh + optimistic auth redirects (Next.js 16 "proxy")
src/lib            env validation, Supabase clients, Zod schemas, motion tokens
src/components     ui/ (shadcn primitives), providers, motion
src/server         (Phase 1+) auth guards, data access layer, Server Actions
supabase/          SQL migrations — the only way the schema changes
scripts/db         local auth shim for embedded PostgreSQL verification
tests/unit         Vitest unit tests
tests/db           migration + RLS tests against embedded PostgreSQL
tests/e2e          Playwright
docs/              product, architecture, database, security, design, decisions, logs
```

## Architecture in one paragraph

The browser talks only to the Next.js server. Server Components and Server Actions use a user-scoped Supabase client (anon key + session cookie), so every query is filtered by RLS. A separate service-role client exists only for provisioning (creating organizations, inviting users, granting platform admin) and is used solely after a database-backed admin check, with an audit event. Platform admins work inside customer workspaces through the same routes as customers; `can_access_org()` grants them access in the database. Details: `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/SECURITY.md`.

## Documentation index

| Document                     | Content                                                |
| ---------------------------- | ------------------------------------------------------ |
| `CLAUDE.md`                  | Implementation rules for AI-assisted work              |
| `docs/PRD.md`                | Requirements, acceptance criteria, status              |
| `docs/ARCHITECTURE.md`       | System context, trust model, request flows             |
| `docs/DATABASE.md`           | Schema, invariants, access matrix, migration workflow  |
| `docs/SECURITY.md`           | Threat model and controls                              |
| `docs/DESIGN.md`             | Tokens, layout, components, motion plan, accessibility |
| `docs/AI_FEATURE.md`         | Optional AI insights design (gated)                    |
| `docs/DEPLOYMENT.md`         | Azure + Supabase configuration, rollout, rollback      |
| `docs/TEST_PLAN.md`          | Test inventory and verified results                    |
| `docs/DECISIONS.md`          | Architecture decision records                          |
| `docs/ASSUMPTIONS.md`        | Assumptions and why they were needed                   |
| `docs/DAILY_LOG.md`          | Dated engineering log with evidence                    |
| `docs/TOOLING_INVENTORY.md`  | Tools, skills and integrations available and used      |
| `docs/AI_WORKFLOW.md`        | How AI tooling is used and reviewed                    |
| `docs/DEMO_SCRIPT.md`        | Five-minute demo plan                                  |
| `docs/DELIVERY_CHECKLIST.md` | Final artifacts and evidence                           |

## Security notes

- Secrets live in `.env.local` (git-ignored) or Azure application settings; `.env.example` lists names only.
- The service-role key is read only by `src/lib/supabase/admin.ts` (`server-only`). CI greps client bundles for its name.
- Demo credentials are shared privately and never committed.
