# CLAUDE.md — TalentFlow ATS implementation instructions

Read `TALENTFLOW_MASTER_SPEC_V2.md` (in the parent folder of this repository or the copy in `docs/spec/`) and this file at the start of every significant phase.

## Project in one paragraph

Multi-tenant applicant tracking system. Next.js 16 (App Router, React 19, strict TypeScript, Tailwind CSS 4, shadcn/ui on Radix, Motion for React), Supabase (Auth + PostgreSQL + RLS), Azure App Service hosting. Platform admins provision customer organizations and can work inside any customer workspace; customer users manage jobs, candidates and a Kanban pipeline of applications. Tenant isolation is enforced in the database.

## Non-negotiable rules

1. **English everywhere**: code, comments, UI strings, docs, tests, commits.
2. **Never claim unverified work.** Status words: Planned → In progress → Implemented → Verified. "Verified" requires a recorded command and result in `docs/TEST_PLAN.md` or `docs/DAILY_LOG.md`.
3. **Secrets never enter the repository.** `.env*` is git-ignored; `.env.example` has names only. The service-role key is used only in `src/lib/supabase/admin.ts`, which imports `server-only`.
4. **Authorization is server + database.** Every Server Action validates input with Zod and calls `requireUser` / `requireOrgAccess` / `requirePlatformAdmin` from `src/server/auth.ts`. RLS is the final authority; never rely on UI state.
5. **Tenant-owned rows always carry `organization_id`.** New tables get the `can_access_org` policy pair, the `prevent_organization_change` trigger, and composite FKs where they reference other tenant rows.
6. **Schema changes only through `supabase/migrations/`.** Run `pnpm db:verify` after any migration change.
7. **No paid resources, deployments, credential use or public publication without the owner's explicit approval.** Stop and ask.
8. **Motion is sparse**: only the four sanctioned uses in `docs/DESIGN.md` §5; always inside `MotionConfig reducedMotion="user"`.
9. **Accessibility is a requirement**, not polish: labels, focus, keyboard paths (Kanban "Move to stage" menu), contrast, live regions.
10. **Document why, not what.** Short JSDoc/TSDoc on non-obvious code; ADRs in `docs/DECISIONS.md`; dated entries in `docs/DAILY_LOG.md`.

## Commands

| Command          | Purpose                                                     |
| ---------------- | ----------------------------------------------------------- |
| `pnpm dev`       | Local dev server (needs `.env.local` with Supabase values)  |
| `pnpm lint`      | ESLint                                                      |
| `pnpm typecheck` | `tsc --noEmit`                                              |
| `pnpm test`      | Vitest unit tests                                           |
| `pnpm db:verify` | Embedded PostgreSQL: apply shim + migrations, run RLS tests |
| `pnpm test:e2e`  | Playwright (requires running app and hosted Supabase)       |
| `pnpm build`     | Production build (standalone output)                        |
| `pnpm check`     | lint + typecheck + test + build                             |

## Code conventions

- Server Components by default; `"use client"` only for interactivity.
- Data access in `src/server/data/*` (one module per aggregate), mutations in `src/server/actions/*`, shared Zod schemas in `src/lib/validation/*` (used by both client forms and actions).
- Supabase clients: `createServerSupabase()` (cookies, RLS), `createBrowserSupabase()`, `createAdminSupabase()` (service role, server-only).
- URL state for filters (`?job=<id>&q=<name>`) so views are shareable.
- Errors: return `{ ok: false, error }` from actions for expected failures; throw only for bugs. Never leak other tenants' existence.
- Tests: `tests/unit` (pure logic, schemas), `tests/db` (RLS, needs embedded Postgres), `tests/e2e` (Playwright). Name tests by behaviour, in English.
- Commits: imperative, scoped (`feat(kanban): …`, `fix(rls): …`, `docs: …`). End with the attribution line required by the session.

## Phase gate checklist (run before reporting a phase complete)

- [ ] `pnpm check` passes; outputs recorded in `docs/DAILY_LOG.md`.
- [ ] Requirement statuses in `docs/PRD.md` updated with evidence links.
- [ ] New decisions recorded as ADRs; assumptions updated.
- [ ] Security review note for anything touching auth, RLS, service role, or external content.
- [ ] No secrets, no personal data, no non-English strings.
