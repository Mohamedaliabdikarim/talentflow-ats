# CLAUDE.md — TalentFlow ATS implementation instructions

Read `docs/spec/TALENTFLOW_MASTER_SPEC_V2.md`, this file and the latest entry of `docs/DAILY_LOG.md` at the start of every significant phase. Load the `supabase` and `supabase-postgres-best-practices` skills (`.claude/skills/`) before touching auth, RLS, migrations or Supabase client code.

## Project in one paragraph

Multi-tenant applicant tracking system. Next.js 16 (App Router, React 19, strict TypeScript, Tailwind CSS 4, shadcn/ui on Radix, Motion for React), Supabase (Auth + PostgreSQL + RLS), Vercel hosting (ADR-043) with Azure OpenAI for AI. Platform admins provision customer organizations and can work inside any customer workspace; customer users manage jobs, candidates and a Kanban pipeline of applications. Tenant isolation is enforced in the database.

## Product principle (owner, 2026-10-20)

> **"Build the first version like it's the last version."**

TalentFlow is a real, production-oriented SaaS product for its first paying customer, not a disposable coding assessment or a visual demo. Prioritize complete end-to-end workflows, security, accessibility, excellent UX, consistent premium design and maintainable architecture. No fake functionality, placeholder buttons, misleading AI claims, or shortcuts that compromise production behaviour. Keep scope disciplined and protect the 2026-10-26 delivery deadline: finish the required ATS workflows before expanding optional features. (ADR-028)

## Non-negotiable rules

1. **English everywhere**: code, comments, UI strings, docs, tests, commits.
2. **Never claim unverified work.** Status words: Planned → In progress → Implemented → Verified. "Verified" requires a recorded command and result in `docs/TEST_PLAN.md` or `docs/DAILY_LOG.md`.
3. **Secrets never enter the repository or the chat.** `.env*` is git-ignored except `.env.example` (names only). The service-role key is used only in `src/lib/supabase/admin.ts` (`server-only`) and `scripts/bootstrap-admin.ts`. Never print key values.
4. **Authorization is server + database.** Every Server Action validates input with Zod and calls `requireUser` / `requireOrgAccess` / `requirePlatformAdmin` from `src/server/auth.ts` before anything else; provisioning actions touch the service role only after `requirePlatformAdmin`. RLS is the final authority; never rely on UI state.
5. **Tenant-owned rows always carry `organization_id`.** New tables get the `can_access_org` policy pair, the `prevent_organization_change` trigger, composite FKs where they reference other tenant rows, explicit `grant select, insert, update, delete on <table> to authenticated, service_role` (API roles get nothing by default, locally and on the hosted project since migration 0004), and `revoke all … from anon`.
6. **Schema changes only through new files in `supabase/migrations/`** (never edit applied migrations). Run `pnpm db:verify` and `pnpm db:types` after any migration change. A migration that still needs the owner's approval waits in `supabase/proposed/` with its own DB test (ADR-026).
7. **Hosted operations need explicit owner approval each time**: `pnpm supabase:hosted push`, `pnpm bootstrap:admin`, creating hosted users, switching the MCP server off read-only, deploying, paid resources. Prepare, dry-run, report, then stop. Supabase Storage buckets/policies (e.g. `supabase/storage/candidate-cvs.sql`) are hosted setup and need the same approval.
8. **Invitation links are secrets**: shown once in the UI or the operator's terminal, never logged or stored; use `redactInviteUrl()` for any log line that could contain one. Audit metadata carries ids only, never emails or names.
9. **Motion is sparse**: only the four sanctioned uses in `docs/DESIGN.md` §5; always inside `MotionConfig reducedMotion="user"`.
10. **Accessibility is a requirement**: visible labels, `aria-describedby` errors, focusable error summary, keyboard paths (Kanban "Move to stage" menu), contrast, live regions, skip link.
11. **Document why, not what.** Short JSDoc/TSDoc on non-obvious code; ADRs in `docs/DECISIONS.md`; dated entries in `docs/DAILY_LOG.md`.

## Commands

| Command                                                   | Purpose                                                                                               |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `pnpm dev`                                                | Local dev server (needs Supabase keys in `.env.local`)                                                |
| `pnpm lint` / `pnpm typecheck`                            | ESLint / `tsc --noEmit`                                                                               |
| `pnpm test`                                               | Vitest unit tests (Node environment; component tests opt into jsdom per file)                         |
| `pnpm db:verify`                                          | Embedded PostgreSQL: apply shim + migrations, run `tests/db`                                          |
| `TALENTFLOW_DB_HOSTED_LIKE=1 pnpm db:verify`              | Same suite on the measured hosted default privileges plus `supabase/proposed/*.sql`                   |
| `pnpm db:types`                                           | Regenerate `src/lib/supabase/database.types.ts` from the migrations                                   |
| `pnpm db:fingerprint`                                     | Hash of the local schema; compare with the same query run read-only on the hosted project             |
| `pnpm build` / `pnpm start`                               | Standalone production build / run it                                                                  |
| `pnpm test:e2e`                                           | Playwright against the standalone build (`pnpm exec playwright install chromium` once)                |
| `pnpm check`                                              | lint + typecheck + test + db:verify + build                                                           |
| `pnpm supabase:hosted <link\|list-remote\|dry-run\|push>` | Hosted migrations via the CLI; `push` only with approval                                              |
| `pnpm bootstrap:admin --email … --project-ref …`          | First platform admin: dry run by default; `--apply` (and `--link-file`) only with approval            |
| `pnpm env:check [bootstrap]`                              | Which `.env.local` names are set (never values) and whether an operation's prerequisites are present  |
| `pnpm ai:smoke`                                           | Azure OpenAI connectivity probe (synthetic prompt; reads `.env.local`); calls the paid API, not in CI |

## Code conventions

- Server Components by default; `"use client"` only for interactivity (forms with `useActionState`, navigation state, clipboard).
- Data access in `src/server/data/*`, mutations in `src/server/actions/*` wrapped in `runAction`, shared Zod schemas in `src/lib/validation/*` (used by both client forms and actions). Action results use `ActionState` from `src/lib/action-state.ts`.
- Supabase clients: `createServerSupabase()` (cookies, RLS, typed), `createBrowserSupabase()`, `createAdminSupabase()` (service role, server-only).
- Page props: type `params`/`searchParams` explicitly as Promises; do not rely on the generated `PageProps`/`LayoutProps` globals (absent on a clean checkout).
- URL state for filters (`?job=<id>&q=<name>`) so views are shareable.
- Errors: return `{ status: "error", message, fieldErrors }` from actions for expected failures; throw only for bugs. Never leak other tenants' existence (same copy for hidden and missing).
- Tests: `tests/unit` (pure logic, guards and actions with mocked clients), `tests/db` (RLS, embedded Postgres, scope assertions to the file's own seed ids), `tests/e2e` (Playwright). Name tests by behaviour, in English.
- AI Candidate Insights: contracts, lifecycle, the runner, GitHub evidence and the optional-CV creation flow with AI prefill are specified in `docs/AI_INSIGHTS.md` (ADR-035/036/037/038/039). CV upload is always optional; choosing a CV never records AI-use authorization.
- Roles: Owner and Member are equal inside a workspace; only platform admins invite, resend, change roles, deactivate or reactivate memberships (ADR-040, `src/server/actions/memberships.ts`). Do not add owner-managed invitations or new roles without an ADR. The runner (`src/server/insights/runner.ts`, behind `POST /api/insights/run` + `INSIGHTS_RUNNER_SECRET`) is the only service-role consumer outside provisioning; it must keep scoping every statement by `organization_id` and re-checking `cv_ai_authorized` before any CV content is used.
- Commits: imperative, scoped (`feat(auth): …`, `fix(rls): …`, `docs: …`). End with the attribution line required by the session.

## Phase gate checklist (run before reporting a phase complete)

- [ ] `pnpm check` and `pnpm test:e2e` pass; outputs recorded in `docs/DAILY_LOG.md`.
- [ ] Requirement statuses in `docs/PRD.md` updated with evidence links.
- [ ] New decisions recorded as ADRs; assumptions updated.
- [ ] Security review note for anything touching auth, RLS, service role, invitations or external content.
- [ ] No secrets, no personal data, no non-English strings; CI green on GitHub.
