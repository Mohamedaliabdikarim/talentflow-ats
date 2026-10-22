# TalentFlow ATS

## Start here (for reviewers)

**What it is.** A multi-tenant applicant tracking system for recruiting teams. Platform admins provision customer organizations and can work inside any workspace with their own identity; customer users manage jobs, candidates and a compact Kanban pipeline of applications. Tenant isolation is enforced in PostgreSQL with row level security. AI Candidate Insights (advisory, evidence-based, consent-gated) is live.

**Live application.** https://talentflow-ats-two.vercel.app (accounts are created by invitation; demo credentials are shared privately, never in this repository).

**The five most important documents.**

1. `docs/PRD.md` — requirements, acceptance criteria and their verified status.
2. `docs/ARCHITECTURE.md` — system context, trust model, request flows.
3. `docs/SECURITY.md` — threat model, controls, hosted verification.
4. `docs/AI_INSIGHTS.md` — AI Candidate Insights: contracts, lifecycle, consent, GitHub evidence.
5. `docs/DECISIONS.md` — architecture decision records (ADRs); `docs/DAILY_LOG.md` holds the dated evidence behind them.

**Three key decisions.**

- **Authorization lives in the database.** Every tenant table carries `organization_id` and a `can_access_org` RLS policy pair; platform-admin status is a database row, not a JWT claim; the service-role key is used only for provisioning after a database-backed admin check (ADR-005, ADR-006, ADR-007).
- **AI is advisory and evidence-first.** Each requirement is marked supported, needs verification or not evidenced with a cited source; no score, no ranking, no automatic rejection; the analysis runs only with explicit, revocable per-candidate authorization and revoking it deletes the derived insights (ADR-013, ADR-035, ADR-037, ADR-038).
- **Production on Vercel next to the database.** Functions run in Vercel's `dub1` region beside the Supabase project in `eu-west-1`; Azure OpenAI provides the model (ADR-042, ADR-043).

## Overview

Multi-tenant applicant tracking system: platform admins provision customer organizations; customer users manage jobs, candidates and a compact Kanban pipeline; tenant isolation is enforced in PostgreSQL with row level security.

**Project status (2026-10-22):** Phases 1–5 implemented and verified (authentication, provisioning, audit, jobs, candidates, applications, Kanban, CV uploads, AI Candidate Insights with GitHub evidence, membership management). Migrations 0001–0008 are applied to the hosted Supabase project and the application is deployed on Vercel at https://talentflow-ats-two.vercel.app. See `docs/PRD.md` for requirement status and `docs/DAILY_LOG.md` for verified evidence.

## Stack

| Layer      | Choice                                                                               |
| ---------- | ------------------------------------------------------------------------------------ |
| Framework  | Next.js 16 (App Router), React 19, TypeScript (strict)                               |
| UI         | Tailwind CSS 4, shadcn/ui (Radix base), Motion for React, lucide icons               |
| Backend    | Supabase Auth + PostgreSQL with RLS; SQL migrations in `supabase/migrations/`        |
| Validation | Zod (shared between forms and Server Actions)                                        |
| Tests      | Vitest (unit + RLS on embedded PostgreSQL), Playwright (E2E)                         |
| Hosting    | Vercel (functions in `dub1`, Git integration) with Supabase in `eu-west-1`           |
| AI         | Azure OpenAI (server-only client, v1 Responses API); GitHub REST API for public data |

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
| `docs/AI_INSIGHTS.md`          | AI Candidate Insights: contracts, lifecycle, consent, GitHub        |
| `docs/AI_FEATURE.md`           | Original AI design note (superseded by `docs/AI_INSIGHTS.md`)       |
| `docs/DEPLOYMENT.md`           | Vercel + Supabase configuration, rollout, rollback                  |
| `docs/TEST_PLAN.md`            | Test inventory and verified results                                 |
| `docs/DECISIONS.md`            | Architecture decision records                                       |
| `docs/ASSUMPTIONS.md`          | Assumptions and why they were needed                                |
| `docs/DAILY_LOG.md`            | Dated engineering log with evidence                                 |
| `docs/TOOLING_INVENTORY.md`    | Tools, skills and integrations available and used                   |
| `docs/AI_WORKFLOW.md`          | How AI tooling is used and reviewed                                 |
| `docs/DEMO_SCRIPT.md`          | Five-minute demo plan                                               |
| `docs/DELIVERY_CHECKLIST.md`   | Final artifacts and evidence                                        |

## Security notes

- Secrets live in `.env.local` (git-ignored) or Vercel environment variables; `.env.example` lists names only.
- The service-role key is read only by `src/lib/supabase/admin.ts` (`server-only`), after a database-backed platform-admin check. CI greps client bundles for its name.
- Invitation links are single-use, shown once, never logged. Demo credentials are shared privately and never committed.
