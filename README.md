# TalentFlow ATS

Multi-tenant applicant tracking system: platform admins provision customer organizations; customer users manage jobs, candidates and a compact Kanban pipeline; tenant isolation is enforced in PostgreSQL with row level security.

**Project status (2026-10-19):** Phase 0 complete and Phase 1 (authentication, authorization, provisioning, audit) implemented and verified locally. Nothing has been applied to the hosted Supabase project yet and nothing is deployed. See `docs/PRD.md` for requirement status and `docs/DAILY_LOG.md` for verified evidence.

## Stack

| Layer      | Choice                                                                                |
| ---------- | ------------------------------------------------------------------------------------- |
| Framework  | Next.js 16 (App Router), React 19, TypeScript (strict)                                |
| UI         | Tailwind CSS 4, shadcn/ui (Radix base), Motion for React, lucide icons                |
| Backend    | Supabase Auth + PostgreSQL with RLS; SQL migrations in `supabase/migrations/`         |
| Validation | Zod (shared between forms and Server Actions)                                         |
| Tests      | Vitest (unit + RLS on embedded PostgreSQL), Playwright (E2E)                          |
| Hosting    | Azure App Service (Linux, Node 22) running the standalone build (not provisioned yet) |

## Local setup

Requirements: Node 22, pnpm 10 (`corepack enable` or `npm i -g pnpm`).

```bash
pnpm install
cp .env.example .env.local        # add the Supabase keys locally; never commit them
pnpm dev                          # http://localhost:3000
```

Everything except the authenticated application runs without Supabase credentials:

```bash
pnpm lint          # ESLint
pnpm typecheck     # tsc --noEmit
pnpm test          # unit tests (Vitest)
pnpm db:verify     # embedded PostgreSQL 17: apply migrations, run the RLS suite
pnpm db:types      # regenerate src/lib/supabase/database.types.ts from the migrations
pnpm db:fingerprint # hash of the local schema, compared with the hosted project read-only
TALENTFLOW_DB_HOSTED_LIKE=1 pnpm db:verify  # same suite on hosted default privileges + supabase/proposed/*.sql
pnpm build         # production build (standalone) + asset copy
pnpm start         # node .next/standalone/server.js
pnpm test:e2e      # Playwright smoke suite against the standalone build (pnpm exec playwright install chromium once)
pnpm check         # lint + typecheck + test + db:verify + build
```

**Local preview without an account:** `pnpm dev` then open `http://localhost:3000/preview` (synthetic data, real components, Kanban moves kept in memory; disabled forms). Unreachable in production unless `TALENTFLOW_PREVIEW=1` is set.

Hosted operations are explicit and approval-gated: `pnpm supabase:hosted <link|list-remote|dry-run|push>` and `pnpm bootstrap:admin …` read credentials from `.env.local` only. See `docs/SUPABASE_INTEGRATION.md`.

## Repository layout

```
src/app            routes: / (public landing), app (post-login router), login, auth/*, admin/*, o/[orgSlug]/*, preview/*, api/health
src/proxy.ts       session refresh + optimistic auth redirects (Next.js 16 "proxy")
src/lib            env validation, Supabase clients (typed), Zod schemas, invite links, motion tokens
src/components     ui/ (shadcn primitives), views/ (shared page bodies), landing/, app shell, forms, providers
src/server         auth guards, audit, data access, Server Actions
supabase/          SQL migrations — the only way the schema changes
scripts/db         local auth shim, embedded cluster helpers, type generator, hosted CLI wrapper
scripts/           bootstrap-admin.ts (first platform admin, approval-gated)
tests/unit         Vitest unit tests
tests/db           migration + RLS tests against embedded PostgreSQL
tests/e2e          Playwright
.claude/skills     official Supabase agent skills (reviewed copies)
.mcp.json          project-scoped, read-only Supabase MCP server
docs/              product, architecture, database, security, design, decisions, logs
```

## Architecture in one paragraph

The browser talks only to the Next.js server. Server Components and Server Actions use a user-scoped Supabase client (anon key + session cookie), so every query is filtered by RLS. A separate service-role client exists only for provisioning (creating organizations, inviting users, granting platform admin) and is used solely after a database-backed admin check, with an audit event. Platform admins work inside customer workspaces through the same routes as customers; `can_access_org()` grants them access in the database and the entry is audited. Details: `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/SECURITY.md`.

## Documentation index

| Document                       | Content                                                             |
| ------------------------------ | ------------------------------------------------------------------- |
| `CLAUDE.md`                    | Implementation rules for AI-assisted work                           |
| `docs/PRD.md`                  | Requirements, acceptance criteria, status                           |
| `docs/ARCHITECTURE.md`         | System context, trust model, request flows                          |
| `docs/DATABASE.md`             | Schema, invariants, access matrix, migration workflow               |
| `docs/SECURITY.md`             | Threat model and controls                                           |
| `docs/SUPABASE_INTEGRATION.md` | Hosted project, MCP, skills, migration plan, invitation limitations |
| `docs/DESIGN.md`               | Tokens, layout, components, motion plan, accessibility              |
| `docs/AI_FEATURE.md`           | Optional AI insights design (gated)                                 |
| `docs/DEPLOYMENT.md`           | Azure + Supabase configuration, rollout, rollback                   |
| `docs/TEST_PLAN.md`            | Test inventory and verified results                                 |
| `docs/DECISIONS.md`            | Architecture decision records                                       |
| `docs/ASSUMPTIONS.md`          | Assumptions and why they were needed                                |
| `docs/DAILY_LOG.md`            | Dated engineering log with evidence                                 |
| `docs/TOOLING_INVENTORY.md`    | Tools, skills and integrations available and used                   |
| `docs/AI_WORKFLOW.md`          | How AI tooling is used and reviewed                                 |
| `docs/DEMO_SCRIPT.md`          | Five-minute demo plan                                               |
| `docs/DELIVERY_CHECKLIST.md`   | Final artifacts and evidence                                        |

## Security notes

- Secrets live in `.env.local` (git-ignored) or Azure application settings; `.env.example` lists names only.
- The service-role key is read only by `src/lib/supabase/admin.ts` (`server-only`), after a database-backed platform-admin check. CI greps client bundles for its name.
- Invitation links are single-use, shown once, never logged. Demo credentials are shared privately and never committed.
