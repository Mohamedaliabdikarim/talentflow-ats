# TalentFlow ATS — Daily Engineering Log

Entries follow the template in the master specification §12. Only verified results are recorded; commands and outputs are quoted from the actual runs.

## 2026-10-19

**Goal:** Phase 0 — initialize the repository, inventory tooling, define architecture, PRD, database schema, authorization model and design direction, and verify the baseline (lint, type-check, tests, build).

**Work completed (verified):**

- Environment inspected: Node 22.16.0, pnpm 10.17.1, git 2.51, gh 2.95 (authenticated), Python 3.12; no Docker, no Azure CLI. Recorded in `docs/TOOLING_INVENTORY.md`.
- Project scaffolded with `create-next-app@16.4.2` (App Router, TypeScript strict, Tailwind 4, ESLint, `src/` layout, pnpm) at `C:\Users\moi-a\Desktop\talentflow-ats`; git repository initialised on `main` (local only, no remote).
- shadcn/ui initialised on the Radix base with the Nova preset; 22 primitives added. Theme tokens replaced with the TalentFlow palette (`src/app/globals.css`).
- Dependencies added: `@supabase/supabase-js`, `@supabase/ssr`, `zod`, `motion`, `server-only`; dev: `vitest`, `@vitejs/plugin-react`, `jsdom`, Testing Library, `@playwright/test`, `supabase` CLI, `prettier`, `embedded-postgres` (PostgreSQL 17), `pg`, `tsx`, `@types/node@22`.
- Migrations written: `20261019120000_initial_schema.sql` (9 tables, enums, triggers, composite tenant FKs, profile sync) and `20261019120100_rls_policies.sql` (helper functions, grants, policies).
- Local verification harness: `scripts/db/local-auth-shim.sql` + `tests/db/global-setup.ts` boot an embedded PostgreSQL, apply shim and migrations, and run `tests/db/rls.test.ts`.
- Application plumbing: `src/lib/env.ts` (Zod-validated env), `src/lib/supabase/{server,client,admin}.ts`, `src/proxy.ts` (session refresh + optimistic redirect), `src/app/api/health/route.ts`, `src/components/providers.tsx` (theme, `MotionConfig reducedMotion="user"`, tooltips, toasts), `src/lib/motion.ts` tokens, `FadeIn` component, Phase 0 landing page with skip link.
- Validation schemas with unit tests: candidate (LinkedIn/GitHub URL host checks), job, organization (slug), application (stages, filters), auth (password, open-redirect guard).
- Documentation set created (17 files, see `docs/`), `CLAUDE.md`, `.env.example`, Prettier config, GitHub Actions CI workflow (not yet executed — no remote).

**Files/commits:** Initial commit on `main` (see `git log --oneline`). No push, no remote configured.

**AI tools/skills used and why:**

- `ui-ux-pro-max` design-system search (`--density 8 --motion 3 --variance 4`) for an initial visual direction and the accessibility checklist. Output persisted to `design-system/talentflow/MASTER.md`; adopted parts and overrides are in `docs/DESIGN.md` §1.
- Bundled Next.js 16 documentation (`node_modules/next/dist/docs`) to confirm the `proxy.ts` convention and the Cache Components semantics before deciding ADR-003.
- Claude Code (Fable 5.1) for all scaffolding, SQL, code and documentation, reviewed against the rules in `docs/AI_WORKFLOW.md`.

**Human decisions and reasoning:** None taken yet by the owner. Decisions requiring approval are listed under "Next actions".

**Tests run and exact results (Windows 11, Node 22.16.0, pnpm 10.17.1, 2026-10-19 local time):**

| Command                                                                                           | Result                                                                                                               |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`                                                                                       | Pass, no findings                                                                                                    |
| `pnpm typecheck` (`tsc --noEmit`)                                                                 | Pass, no errors                                                                                                      |
| `pnpm test` (Vitest, project `unit`)                                                              | 1 file, **48 passed**, 525 ms (after switching the project to the Node environment; first run under jsdom took 46 s) |
| `pnpm db:verify` (Vitest, project `db`)                                                           | Embedded PostgreSQL 17 started on a random port; `[db] applied shim + 2 migration(s)`; 1 file, **22 passed**, 13.2 s |
| `pnpm build` (`next build` + standalone asset copy)                                               | Compiled in 8.5 s; routes `○ /`, `○ /_not-found`, `ƒ /api/health`, `ƒ Proxy (Middleware)`                            |
| Client bundle secret check: `grep -rl SUPABASE_SERVICE_ROLE_KEY .next/static`                     | No match                                                                                                             |
| Standalone smoke (`node .next/standalone/server.js`, placeholder Supabase env): `GET /api/health` | `200 {"status":"ok",...}` ready after 1 s                                                                            |
| Standalone smoke: `GET /`                                                                         | 200, body contains "TalentFlow" and the skip link, no `X-Powered-By` header                                          |
| Standalone smoke: `GET /o/acme/pipeline?job=1` (unauthenticated)                                  | `307` → `/login?next=%2Fo%2Facme%2Fpipeline%3Fjob%3D1`                                                               |
| Standalone smoke: `GET /login`                                                                    | 404 (page is Phase 1 work; route is correctly public)                                                                |
| `pnpm format:check`                                                                               | All matched files use Prettier code style                                                                            |

Not run: Playwright E2E (needs browsers and, for authenticated flows, a hosted Supabase project); CI workflow (needs a GitHub remote).

**Security/privacy review:**

- RLS enabled on all nine tables; `anon` has no table privileges; provisioning tables are not writable by `authenticated`. Negative tests cover cross-tenant read/insert/update/delete, organization creation, admin self-grant, direct audit writes, cross-tenant links and tenant moves (`tests/db/rls.test.ts`).
- Service-role client is `server-only`; its variable name does not appear in client bundles.
- `.env*` is git-ignored; the repository contains no secrets or personal data (synthetic test data only).
- Open items: `profiles_select` lets co-members see each other's email (acceptable for a workspace; documented), `log_audit_event` is callable by any authenticated user for actions matching `area.event` (actor is always `auth.uid()`; rate limiting is not implemented).

**Issues, risks, and compromises:**

- The shell tool truncated long heredoc commands, which caused four parse failures; large files were written with the file tool instead and verified by listing. No partial files were created.
- shadcn 4.22 changed CLI flags (`-b` is now the component library, presets are `nova`…); resolved by reading `--help`. Note that shadcn 4 adds the `shadcn`, `cn` and `radix-ui` runtime packages.
- `create-next-app` enabled Cache Components; disabled (ADR-003).
- Vitest warned about ESM syntax in `vitest.config.ts`; renamed to `.mts`.
- pnpm 10 blocked build scripts for `@embedded-postgres/windows-x64` and `esbuild`; allow-listed in `pnpm-workspace.yaml`. The embedded binaries ship inside the package, so verification works either way.
- The root page is currently static (placeholder); it becomes dynamic in Phase 1 when it reads the session.
- Local RLS verification runs on PostgreSQL 17 with an auth shim, not on Supabase itself; hosted verification is a Phase 1/4 task.

**Next actions:**

1. Owner approvals: create the hosted Supabase project (free tier is sufficient for the demo), approve the Azure App Service plan, approve creating a private GitHub repository.
2. Phase 1: `src/server/auth.ts` guards, login/sign-out, invite link flow, bootstrap-admin script, admin organization provisioning actions with audit events, hosted migration push, E2E for auth.
3. Phase 2: jobs, candidates, applications CRUD in the workspace routes.

## 2026-10-19 (continued) — Phase 1 after the owner's approvals

**Goal:** Act on the Phase 0 approvals (existing Supabase project, private GitHub repository, invitation-link onboarding, palette, fixed stages, no Azure yet), set up the read-only Supabase MCP server and official skills, prepare the hosted integration without applying anything, and implement authentication, authorization, provisioning and audit locally with tests.

**Work completed (verified):**

- Private repository created and pushed with full history: https://github.com/Mohamedaliabdikarim/talentflow-ats. Pre-push scan of `git log -p --all` for key patterns: no matches; no `.env*` tracked. Found and fixed `.env.example` being ignored by the `.env*` rule.
- `.mcp.json` written by `claude mcp add --scope project --transport http supabase "<read-only URL for project zcxmyaxpftzwpzvmhslm>"`; `claude mcp list` shows the server as pending approval (OAuth needs an interactive session; steps in `docs/SUPABASE_INTEGRATION.md` §2). Connectivity not yet verified.
- Official skills `supabase` 0.1.2 and `supabase-postgres-best-practices` 1.1.1 cloned, read (Markdown only), installed with `npx skills add … --yes`, reviewed via `git status`, committed.
- `.env.local` prepared with the project URL only; keys left commented out for the owner (Supabase CLI is not logged in, by design).
- Migration 0003 `activate_my_memberships()`; shared local-cluster helpers (`scripts/db/local-schema.ts`); custom type generator `pnpm db:types` (CLI `gen types --db-url` exits 1 here); typed Supabase clients.
- Server layer: `src/server/auth.ts` (getCurrentUser, requireUser, isPlatformAdmin, requirePlatformAdmin, getMyOrganizations, getOrganizationContext, requireOrgAccess), `src/server/audit.ts`, `runAction` wrapper, `signIn`/`signOut`/`setPassword` actions, `createOrganization`/`inviteUser`/`grantPlatformAdmin` actions (service role only after a database-backed admin check; audit rows with ids only; invite link returned once).
- Routes: `/login`, `/auth/confirm` (verifyOtp on `token_hash`), `/auth/set-password`, `/` router, `/no-access`, `/workspaces`, `/admin` (overview, organizations list/new/detail with invite form, platform admins with grant form, audit log), `/o/[orgSlug]` (overview with live counts, members) with the admin context banner and de-duplicated `admin.context_entered` audit.
- UI: responsive app shell (sidebar / sheet), accessible form fields (labels, `aria-describedby`, focusable error summary, pending submit), one-time link component, permission-denied state.
- Scripts: `scripts/bootstrap-admin.ts` (approval-gated), `scripts/db/hosted.mjs` (`link|list-remote|dry-run|push`, refuses a mismatched project ref), CI extended with Playwright.
- Docs: `docs/SUPABASE_INTEGRATION.md` (identity, MCP, skills, pre-apply review, migration plan, invite limitations), ADR-015 … ADR-020, README, CLAUDE.md, tooling inventory, PRD/assumption/checklist statuses, deployment note on build-time inlining.

**Files/commits:** `1a52dca` (.env.example), `3d0e051` (MCP config + skills), Phase 1 commit on `main` (see `git log --oneline`).

**AI tools/skills used and why:** `supabase` skill security checklist for the migration review; `claude mcp add` for the server config; `gh` for repository and CI; Playwright for E2E; embedded PostgreSQL for RLS tests and type generation.

**Human decisions and reasoning:** Owner approved Phase 0 and decided: reuse the existing project `talentflow-ats`; private repo; invitation links; palette and fonts; fixed stages; no customer self-service invites; no Azure yet; MCP read-only; hosted migrations only after an explicit plan approval.

**Tests run and exact results:**

| Command                                                          | Result                                                                                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm lint`                                                      | Pass                                                                                                                           |
| `pnpm typecheck`                                                 | Pass                                                                                                                           |
| `pnpm test`                                                      | 74 passed / 74 in 4 files                                                                                                      |
| `pnpm db:verify`                                                 | 25 passed / 25 (3 migrations applied); repeated once to confirm file-order independence                                        |
| `pnpm build`                                                     | Pass; 15 routes, all dynamic except `/_not-found`                                                                              |
| `pnpm test:e2e`                                                  | 10 passed / 10 (chromium + mobile), 14.7 s                                                                                     |
| GitHub Actions run #1                                            | Failed: `LayoutProps` not found on clean checkout → fixed                                                                      |
| GitHub Actions run 39292371082 (commit `02980df`, ubuntu-latest) | Success in 1m31s: lint, typecheck, unit, db:verify (embedded PostgreSQL on Linux), build, bundle grep, Playwright install, E2E |

**Security/privacy review:**

- Provisioning actions: `requirePlatformAdmin()` (database-backed) runs before `createAdminSupabase()`; unit tests prove non-admins never reach the service role and signed-out callers are redirected first.
- Invitation tokens: built from `hashed_token`, returned once to the admin UI, never logged; audit metadata holds user ids and roles only (unit test asserts no email/token in the audit call). `redactInviteUrl()` available for logs.
- `/auth/confirm` accepts only `invite|magiclink|recovery|email`, validates `next` with the open-redirect guard, and answers invalid/expired links with the same generic message.
- `activate_my_memberships()` is `SECURITY DEFINER` but scoped to `auth.uid()`; `EXECUTE` revoked from `PUBLIC`; DB tests cover other users' rows and anonymous callers.
- Build-time inlining of `NEXT_PUBLIC_*` discovered through a failing E2E run; documented in `.env.example` and `docs/DEPLOYMENT.md`.
- Open items: audit write is best-effort (no shared transaction with the Auth API); `admin.context_entered` may also fire on link prefetch (de-duplicated per hour); orphaned auth users are possible if a membership insert fails after `generateLink` (re-inviting the same email now resumes as a pending invite).

**Issues, risks, and compromises:**

- MCP connectivity could not be verified in this non-interactive session; the owner's OAuth is required.
- No hosted verification yet: migrations, bootstrap admin and the full invite flow wait for approval.
- `supabase gen types` did not work without Docker; the custom generator covers the current schema and will be diffed against CLI/MCP output after the hosted apply.
- Three of my own test bugs were found and fixed during the run (FormData `null`, cross-file seed leakage, enum ordering); recorded in `docs/AI_WORKFLOW.md` §5.

**Next actions:**

1. Owner: add keys to `.env.local`, approve the project MCP server and complete OAuth, review `docs/SUPABASE_INTEGRATION.md` §6 and approve the dry-run step.
2. After approval: link, dry-run, push, advisors, bootstrap admin, hosted invite flow E2E, record results.
3. Phase 2: jobs, candidates, applications CRUD in the workspace (data layer, actions, pages, tests).

## 2026-10-19 (continued) — MCP approval preparation and Phase 2

**Goal:** Do every technical MCP step that does not need the owner, then implement jobs, candidates, applications and the Kanban board with job and candidate-name filtering, locally, with tests, documentation and CI.

**Work completed (verified):**

- MCP: `claude mcp` has no non-interactive OAuth command (checked `--help`). Pre-approved the project server with `enabledMcpjsonServers: ["supabase"]` in `.claude/settings.local.json` (git-ignored). The user-level `~/.claude.json` has no entry for this project folder yet, so the CLI health check still prints "pending approval" until the owner runs `claude` in the project directory. Remaining owner step: `/mcp` → `supabase` → Authenticate (browser). Connectivity not yet verified.
- Server layer: `src/server/data/{jobs,candidates,pipeline}.ts`, Server Actions for jobs (create, update, delete), candidates (create with optional job, update, delete) and applications (add to pipeline, move stage, remove). Every write takes `organization_id` from the URL context through `requireOrgAccess()`, never from the form.
- Pure helpers in `src/lib/pipeline.ts` (grouping, LIKE escaping, stage age, lenient filter parsing) and `createCandidateSchema`.
- UI: jobs list/new/detail/edit, candidates list (name search)/new/detail/edit, pipeline page with URL filters and the `KanbanBoard` (six columns, menu-based move with optimistic update, live-region announcement, Motion shared-layout movement), `AddToPipelineDialog`, `ConfirmActionDialog`, `StageBadge`, `ExternalLink`; workspace navigation and overview updated.
- Tests: `tests/unit/pipeline.test.ts`, `tests/unit/workspace-actions.test.ts` (tenant pinning, authorization, validation, error mapping), `tests/db/pipeline.test.ts` (tenant-scoped search and filters, stage persistence across requests, cross-tenant move rejected, job delete cascade).
- Docs: ADR-021 … ADR-023, PRD statuses R04–R09 and R20, architecture status, checklist, design component inventory.

**Files/commits:** Phase 2 commit on `main` (see `git log --oneline`).

**AI tools/skills used and why:** `supabase` skill for RLS-aware query shapes (explicit `organization_id` filters, `with check` reliance), React Compiler lint (`react-hooks/purity`) caught `Date.now()` in render; embedded PostgreSQL for the pipeline suite.

**Human decisions and reasoning:** Owner asked for MCP approval guidance with minimal interaction, read-only verification, and Phase 2 locally; no hosted changes.

**Tests run and exact results:**

| Command                                                          | Result                                                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `pnpm lint`                                                      | Pass (after moving the timestamp out of render)                                                   |
| `pnpm typecheck`                                                 | Pass                                                                                              |
| `pnpm test`                                                      | 89 passed / 89 in 6 files                                                                         |
| `pnpm db:verify`                                                 | 31 passed / 31 in 3 files (3 migrations applied)                                                  |
| `pnpm build`                                                     | Pass; all workspace routes dynamic                                                                |
| `pnpm test:e2e`                                                  | 10 passed / 10 (chromium + mobile), 19.5 s                                                        |
| GitHub Actions run 39296039441 (commit `af3e19b`, ubuntu-latest) | Success in 1m35s: lint, typecheck, unit (89), db:verify (31), build, bundle grep, Playwright (10) |

**Security/privacy review:**

- Tenant pinning is unit-tested: a form carrying `organization_id` of another tenant is ignored; RLS `with check` is the second line.
- Cross-tenant stage moves return 0 rows (DB test); deleting cascades only inside the tenant.
- Candidate URLs are validated by host on input and rendered with `rel="noopener noreferrer"` in a new tab; LinkedIn is shown as "Profile provided — manual review".
- Name search escapes `%`, `_` and `\` before `ilike`; filter parsing never throws on user input.
- Destructive actions require a confirmation dialog and submit a real form.

**Issues, risks, and compromises:**

- Pointer drag-and-drop is deferred to Phase 3 (ADR-021); the menu path is the required, accessible mechanism.
- Browser verification of authenticated pages still depends on the hosted project (migrations and a bootstrap admin are approval-gated).
- No manual ordering inside a Kanban column.

**Next actions:**

1. Owner: complete MCP OAuth; approve the hosted migration dry-run (`docs/SUPABASE_INTEGRATION.md` §6), then the push and the bootstrap admin.
2. Phase 3: pointer drag on the board, responsive polish, Playwright flows with real accounts once the hosted project is ready, accessibility review.

## 2026-10-19 (continued) — MCP verification, dry-run plan, Phase 3 start

**Goal:** Verify the Supabase MCP connection read-only after the owner's OAuth, confirm the project, prepare the exact hosted migration dry-run plan, and continue Phase 3 locally (pointer drag on the board, accessibility checks, component tests).

**Work completed (verified):**

- **MCP connection verified (read-only).** `claude mcp list` → `supabase … ✔ Connected`. Because this session started before the server existed, the calls were made through a headless `claude -p` session whose `--allowedTools` contained only the read-only tools. Raw results:
  - `get_project_url` → `{"url":"https://zcxmyaxpftzwpzvmhslm.supabase.co"}` (matches the owner's project ref).
  - `list_tables` (schemas `["public"]`) → `{"tables":[]}`.
  - `list_migrations` → `{"migrations":[]}`.
  - Tools exposed by the project-scoped server (13): `execute_sql`, `generate_typescript_types`, `get_advisors`, `get_edge_function`, `get_project_url`, `get_publishable_keys`, `list_branches`, `list_edge_functions`, `list_extensions`, `list_migrations`, `list_tables`, `query_logs`, `search_docs`. No account-level tool (`get_project`, `list_projects`) is exposed, so the display name `talentflow-ats` is confirmed by the owner's statement plus the matching ref and URL, not by an MCP call. No mutating tool was called; `read_only=true` remains in `.mcp.json`.
- **Hosted migration dry-run plan** written to `docs/HOSTED_MIGRATION_DRY_RUN.md` (target, verified empty state, files, credentials and handling, exact commands with expected output, failure handling, approval checklist). `supabase init` created `supabase/config.toml` locally (project id `talentflow-ats`, PostgreSQL 17); `scripts/db/hosted.mjs` now passes `--linked` explicitly and gained `unlink`.
- **Phase 3 (local):** pointer drag-and-drop on the Kanban (Motion `drag`, drop target detected with `elementsFromPoint`, column highlight, same Server Action and live region as the menu path); axe-core accessibility checks added to the E2E suite for the public pages; `KanbanBoard` component tests (jsdom) covering column rendering, the keyboard move path with optimistic placement and announcement, and the revert on failure.

**Files/commits:** Phase 3a commit on `main` (see `git log --oneline`).

**AI tools/skills used and why:** headless `claude -p` with an explicit tool allow-list for the MCP verification (the only way to call MCP tools from a session that predates the server); `@axe-core/playwright` for WCAG 2.x A/AA rules; Testing Library + user-event for the board test.

**Human decisions and reasoning:** Owner completed MCP OAuth; asked for read-only verification, journal entry, exact dry-run plan, and continued local Phase 3 work; no hosted changes.

**Tests run and exact results:**

| Command                                                          | Result                                                                                             |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `pnpm lint` / `pnpm typecheck`                                   | Pass                                                                                               |
| `pnpm test`                                                      | 92 passed / 92 in 7 files (adds `tests/unit/kanban-board.test.tsx`)                                |
| `pnpm build`                                                     | Pass                                                                                               |
| `pnpm test:e2e`                                                  | 14 passed / 14: 10 smoke + 4 axe (chromium + mobile), 23.1 s                                       |
| `pnpm db:verify`                                                 | unchanged since the Phase 2 run (31 passed); re-run by CI                                          |
| GitHub Actions run 39302083064 (commit `62bbdbd`, ubuntu-latest) | Success: lint, typecheck, unit (92), db:verify (31), build, bundle grep, Playwright (14 incl. axe) |

**Security/privacy review:**

- MCP: read-only flag kept; the headless verification session was restricted to read-only tools by allow-list; no SQL executed.
- Credentials for the dry-run stay in `.env.local` and the OS credential store (written by `supabase link`); the plan recommends a scoped, short-lived token and revocation after the push.
- Drag-and-drop reuses the validated Server Action (stage enum, organization pinning, RLS); the menu path remains for keyboard and assistive technology.

**Issues, risks, and compromises:**

- The MCP server cannot return the project's display name; confirmation of the name relies on the owner and the ref match.
- `execute_sql` is exposed even in read-only mode; the server enforces read-only semantics, and this project does not use it.
- `supabase/config.toml` carries local-dev auth defaults (signup enabled, 6-character passwords) that only apply to a local `supabase start` stack; hosted settings are set in the dashboard (see the plan's step 7 in `docs/SUPABASE_INTEGRATION.md`).
- Drag-and-drop has component coverage for the shared move logic but no browser verification until the hosted project provides test accounts.

**Next actions:**

1. Owner: review `docs/HOSTED_MIGRATION_DRY_RUN.md`, add the three variables to `.env.local`, approve steps 1–3.
2. After the dry-run: separate approval for `push`, then advisors, type diff, bootstrap admin, hosted invite-flow E2E.
3. Phase 3 continued: responsive review at 375/768/1024/1440 px, screenshots and authenticated E2E once accounts exist.

## 2026-10-19 (continued) — Dry-run prerequisites, independent CLI validation, Phase 3 polish

**Goal:** Prepare (not execute) the hosted migration dry-run: validate the Supabase CLI requirements and scoped-token permissions from primary sources, configure every prerequisite that needs no secret, give the owner a secure path for the two secrets, and continue Phase 3 polish.

**Verified (with evidence):**

- **Official permission requirement for `supabase link`** (personal-access-tokens page, fetched directly): "`supabase link` needs **Project Settings**, **API Keys**, and **API Key Secrets**, all with **Read** access." Also: "Database commands using your database password aren't limited by the token's permissions"; scoped tokens "start with `sbp_fc`"; the CLI reads `SUPABASE_ACCESS_TOKEN`, which "takes precedence over any saved token"; the browser flow of `supabase login` "creates a classic token". The read-only MCP permission set (Database, Migrations, Project Settings, API Keys at Read) is therefore **not** sufficient for `link`: API Key Secrets (Read) is additionally required; `Migrations` and `Projects (account-wide)` are not needed for link, list or dry-run.
- **CLI reference pages** retrieved through the read-only MCP `search_docs` tool: `link` fetches PostgREST config and optionally validates database settings with a password (`SUPABASE_DB_PASSWORD` for non-interactive use; password saved to native credential storage); `migration list` and `db push` require a linked project and compare/apply against `supabase_migrations.schema_migrations`; `--dry-run` "view[s] the list of changes before applying".
- **CLI source (v2.121.0, `apps/cli-go/internal/migration/list/list.go`)**: `loadRemoteVersions` opens a direct database connection with `utils.ConnectByConfig`; no Management API call. The `link` and `db push` implementations are not present under `apps/cli-go/internal` at that tag (the repository is being restructured into a monorepo: `apps/cli`, `apps/cli-go`, `apps/cli-e2e`, `apps/docs`), so for those two commands the official reference pages and the permissions page are the authoritative sources used here.
- **Prerequisites set without secrets:** `SUPABASE_PROJECT_REF` written; `NEXT_PUBLIC_SUPABASE_ANON_KEY` obtained with the read-only MCP tool `get_publishable_keys` in a headless session whose output was piped through a pattern filter into `pnpm env:set`, so the value never appeared in chat, terminal output or logs. `pnpm env:check` lists names and lengths only.
- **Secure secret entry:** `scripts/env/set-local.mjs` (`pnpm env:set NAME`) reads a hidden prompt or stdin, writes only the git-ignored `.env.local`, refuses values containing whitespace, and prints just the character count.
- **Phase 3 polish:** reference screenshots of the login page at 375/768/1440 px in `docs/screenshots/` with an assertion of no horizontal page scroll (`tests/e2e/screenshots.spec.ts`, opt-in via `SCREENSHOTS=1`); visual check of the mobile and desktop captures: card, error alert, labels and primary action render as designed. Regular E2E suite still 14/14.

**Pending (not done, by design):**

- `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD`: owner enters them with `pnpm env:set`.
- Steps `link`, `list-remote`, `dry-run`: wait for the owner's explicit approval after `pnpm env:check` reports all present.
- `db push`, `pnpm bootstrap:admin`, deployment: not approved; not run.
- Authenticated-page screenshots and E2E: need hosted accounts.

**Files/commits:** `b3f4df3` (prerequisites, env helpers, screenshots); GitHub Actions run 39305014544 → success (lint, typecheck, unit 92, db:verify 31, build, bundle grep, Playwright 14).

**Security/privacy review:** no secret value passed through chat, logs or git; `.env.local` remains ignored; the wrapper still refuses a mismatched project ref; MCP remains read-only and was used only for `search_docs` and `get_publishable_keys` (a public key by design).

**Next actions:** owner completes §5 of `docs/HOSTED_MIGRATION_DRY_RUN.md` and approves §8; then link → list-remote → dry-run, stop, report verbatim.

## 2026-10-19 (continued) — Approved hosted steps: link succeeded, list-remote stopped on IPv6

**Owner approval:** three non-destructive operations in order (`link`, `list-remote`, `dry-run`), stop on anything unexpected; no push, no users, no deploy.

**Step 0 — prerequisites (names only):** `pnpm env:check` → all present. Target check: `SUPABASE_PROJECT_REF = zcxmyaxpftzwpzvmhslm`, URL host `zcxmyaxpftzwpzvmhslm.supabase.co` → OK. Working tree clean before starting.

**Step 1 — `pnpm supabase:hosted link` → VERIFIED, exit 0.** Output (redaction filter applied to every line; nothing was redacted):

```
[hosted] project zcxmyaxpftzwpzvmhslm: supabase link --project-ref zcxmyaxpftzwpzvmhslm
{"project_ref":"zcxmyaxpftzwpzvmhslm","message":""}
```

Effects: only git-ignored files under `supabase/.temp/` (`project-ref`, `linked-project.json`, `postgres-version`, `rest-version`, `gotrue-version`, `storage-version`); `git status` clean. Non-secret metadata read from them: hosted PostgreSQL **17.11.0.003** (matches the local verification on 17), PostgREST v14.18, GoTrue v2.197.0, and `linked-project.json` → `name: talentflow-ats`, which **confirms the project name** that the MCP server could not provide.

**Step 2 — `pnpm supabase:hosted list-remote` → STOPPED, exit 1.** Output verbatim:

```
[hosted] project zcxmyaxpftzwpzvmhslm: supabase migration list --linked
{"_tag":"Error","error":{"code":"DbConfigIpv6Error","message":"IPv6 is not supported on your current network","suggestion":"Run supabase link --project-ref zcxmyaxpftzwpzvmhslm to setup IPv4 connection."}}
```

Per the approval, the sequence stopped here; **step 3 (`dry-run`) was not run.** No hosted change occurred: `migration list` is read-only and it never connected.

**Analysis (official docs via the read-only MCP `search_docs` tool, 2026-10-19):**

- "Direct connections are on IPv6, or on IPv4 if the project has the IPv4 add-on. If your network is IPv4-only and you don't have the add-on, use pooler session mode instead." (Connect to your database)
- "The Shared Pooler (Supavisor) is IPv4-only on every project tier." The docs also list GitHub Actions among IPv4-only platforms, which matters for any future CI-driven migration.
- The CLI resolves the pooler route from the Management API endpoint "Get pooler config" (`GET /v1/projects/{ref}/config/database/pooler`), which on a scoped token requires **Connection Pooling (Read)** (Personal Access Tokens page).
- The token was created with the three permissions the same page states for `supabase link` (Project Settings, API Keys, API Key Secrets at Read). `link` therefore succeeded, but without pooler-config access it stored no IPv4 route, and `migration list` fell back to the direct IPv6 host on an IPv4-only network. Conclusion: the documented `link` permission list is incomplete for IPv4-only networks; **Connection Pooling (Read)** is additionally required. This machine confirmed IPv4-only by the error itself.

**Options prepared for the owner (both keep secrets in `.env.local` only):**

1. Preferred: create a new scoped token with Project Settings, API Keys, API Key Secrets **and Connection Pooling**, all Read; `pnpm env:set SUPABASE_ACCESS_TOKEN`; then re-run `link` (approved operation) so the pooler route is stored, then `list-remote`, then `dry-run`.
2. Fallback without a new token: set `SUPABASE_POOLER_HOST` (the Supavisor host shown in the dashboard's Connect dialog, e.g. `aws-0-<region>.pooler.supabase.com`; not a secret) with `pnpm env:set SUPABASE_POOLER_HOST`. The wrapper then runs `migration list` and `db push --dry-run` with `--db-url` built from the ref, the password and that host over the session-mode port 5432 (the URL is passed to the CLI process only, never printed).

**Verified vs pending:** link verified; project name verified; list-remote and dry-run pending the owner's choice above and a renewed go-ahead; push, bootstrap admin, deploy not approved.

**Security/privacy review:** every CLI output passed through a redaction filter before entering the transcript; nothing matched. `.env.local` unchanged by the CLI; `supabase/.temp` ignored; the stored database password lives in the OS credential store (removable with `pnpm supabase:hosted unlink`).

## 2026-10-19 (continued) — Approved hosted steps via the pooler: list-remote and dry-run VERIFIED

**Owner decision:** option 2 (pooler host in `.env.local`, no new token). **Approval:** `list-remote` then `dry-run`, sequentially, stop on anything unexpected; no push, no users, no hosted modification.

**Pre-checks (names only):** `pnpm env:check` → all present, `SUPABASE_POOLER_HOST` set (35 characters) and matching the pattern `aws-<region>.pooler.supabase.com`; ref `zcxmyaxpftzwpzvmhslm`, URL host `zcxmyaxpftzwpzvmhslm.supabase.co`, linked ref file identical. Repeated before each step.

**Step 1 — `pnpm supabase:hosted list-remote` → VERIFIED, exit 0.** Output (redaction filter applied; the wrapper masks the connection URL as `<pooler-url>`):

```
[hosted] project zcxmyaxpftzwpzvmhslm: supabase migration list --db-url <pooler-url>
Connecting to remote database...
{"migrations":[{"local":"20261019120000","remote":"","time":"2026-10-19 12:00:00"},{"local":"20261019120100","remote":"","time":"2026-10-19 12:01:00"},{"local":"20261019130000","remote":"","time":"2026-10-19 13:00:00"}],"message":"Migrations listed"}
```

Reading: three local versions, remote column empty for all three, no discrepancy.

**Step 2 — `pnpm supabase:hosted dry-run` → VERIFIED, exit 0.** Output verbatim (same masking):

```
[hosted] project zcxmyaxpftzwpzvmhslm: supabase db push --dry-run --db-url <pooler-url>
DRY RUN: migrations will *not* be pushed to the database.
Connecting to remote database...
Would push these migrations:
 • 20261019120000_initial_schema.sql
 • 20261019120100_rls_policies.sql
 • 20261019130000_membership_activation.sql
{"upToDate":false,"dryRun":true,"migrations":["20261019120000_initial_schema.sql","20261019120100_rls_policies.sql","20261019130000_membership_activation.sql"],"seeds":[],"roles":[],"message":"Finished supabase db push."}
```

Reading: exactly the three committed migrations, in timestamp order; `seeds: []` and `roles: []` (nothing beyond the migrations would run); no warnings.

**Post-check (read-only MCP, after the dry-run):** `list_tables` on `public` → `{"tables":[]}` and `list_migrations` → `{"migrations":[]}`: the dry-run changed nothing on the hosted project.

**Readiness assessment:** the hosted database (PostgreSQL 17.11) is empty, the migration history is empty, the three files are the ones verified locally and in CI on PostgreSQL 17, and the pooler path works from this network. The database is ready for the migration push, which remains a separate approval (`pnpm supabase:hosted push`). After a push, the planned verification is: `list-remote` (three remote versions), MCP `list_tables` (9 tables), MCP `get_advisors` (security lint), and a diff of MCP `generate_typescript_types` against `src/lib/supabase/database.types.ts`.

**Verified vs pending:** link, list-remote, dry-run verified; push, bootstrap admin, hosted dashboard auth settings (signups off, OTP expiry, redirect URLs), deployment pending separate approval.

**Security/privacy review:** outputs passed through the redaction filter (nothing matched); the pooler URL with the password was passed to the CLI process only and masked in the wrapper's echo; `.env.local` untouched by the CLI; working tree clean after both steps.

## 2026-10-19 (continued) — Local preview for visual inspection; two real bugs found and fixed

**Request:** the owner wants to inspect the dashboard, jobs, candidates and the Kanban board in a browser before approving the hosted push. Sign-in cannot work yet (hosted schema empty), so a local-only preview was built (ADR-024). No hosted change; `db push` not run.

**Work completed (verified):**

- Page bodies extracted into reusable view components (`src/components/views/*`: workspace overview, jobs, job detail, candidates, candidate detail, pipeline, members, admin overview/organizations, audit). The real routes and the preview routes now render the same components.
- `/preview/*` route tree with synthetic data (`src/preview/demo-data.ts`: fictional people, example.test addresses, valid UUIDs), an in-memory store on `globalThis` so Kanban moves persist while the server runs, a preview Server Action with the same contract as the real one, a "Reset demo data" action, and disabled forms (`<fieldset disabled>`) for visual review. Gate: `isPreviewEnabled()` (development, or `TALENTFLOW_PREVIEW=1`); the proxy exempts `/preview` from authentication only under the same condition; otherwise the layout is a 404.
- Dev server started locally: `pnpm dev -p 3100` → **http://localhost:3100/preview** (index with links to every page). All preview routes return HTTP 200.
- **Bug 1 (would have broken the real app):** navigation items passed Lucide icon _components_ from Server Components (layouts) into the client `NavLink`/`MobileNav`. React Server Components forbid functions as client props; every authenticated layout would have failed at runtime with "Functions cannot be passed directly to Client Components" (digest 1569319357). Found the moment the preview rendered the shell; fixed by passing icon _names_ that the client resolves (`src/components/nav-link.tsx`). The authenticated routes had never been rendered in a browser before, which is exactly why the preview was worth building.
- **Bug 2 (responsive):** on the job and candidate detail pages, tables inside grid children widened the page at ≤ 768 px (grid items default to `min-width: auto`). Caught by the screenshot test's no-horizontal-scroll assertion; fixed with `min-w-0` on the grid children (also applied to the admin organization and admins pages).
- ESLint now ignores Playwright's generated `playwright-report/` and `test-results/`.
- Tests: `tests/unit/preview-store.test.ts`, `tests/unit/preview-enabled.test.ts`, `tests/e2e/preview.spec.ts` (index, dashboard incl. mobile sheet navigation, jobs → detail, candidate search → detail with safe links, pipeline: six stages, job filter, combined name filter, menu move announced and persisted across reload, reset; empty-state; axe on five preview pages), `tests/e2e/screenshots.spec.ts` now captures eight pages × three breakpoints (24 images in `docs/screenshots/`).

**Tests run and exact results:**

| Command                                                                          | Result                                                                                                                                                                                |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint` / `pnpm typecheck`                                                   | Pass                                                                                                                                                                                  |
| `pnpm test`                                                                      | 99 passed / 99 in 9 files                                                                                                                                                             |
| `pnpm build`                                                                     | Pass (preview routes dynamic)                                                                                                                                                         |
| `pnpm test:e2e`                                                                  | 35 passed (49 skipped: screenshot captures off by default and the mutating board test limited to one project); covers smoke, axe and the preview pages on desktop and mobile Chromium |
| `SCREENSHOTS=1 playwright test tests/e2e/screenshots.spec.ts --project=chromium` | 24 passed; no horizontal overflow on any page at 375/768/1440 px                                                                                                                      |
| Dev server probe (`curl`, port 3100)                                             | 200 on index, admin, dashboard, jobs, job detail, job form, candidates, candidate detail, pipeline (with filters), members                                                            |

**Visual review notes (from the captures):** board shows six columns with counts, cards with candidate, headline, job and stage age; the board scrolls horizontally inside its own region at 1440 px (Offer column partially visible); mobile dashboard uses the sheet navigation and stacked stat cards. Owner's visual feedback pending.

**Security/privacy review:** preview is unreachable in production unless `TALENTFLOW_PREVIEW=1` (unit-tested; documented in `docs/SECURITY.md` and `docs/DEPLOYMENT.md`); no Supabase calls from preview code; synthetic data only.

**Verified vs pending:** preview and the two fixes verified locally and by E2E; owner's visual feedback pending; hosted push, bootstrap admin, deployment not approved and not run.

## 2026-10-19 (continued) — Public landing page at "/" and dashboard refresh proposal

**Request:** a premium public marketing homepage at "/", keeping the app and the preview; propose (not apply) dashboard improvements; lint, typecheck, build, browser tests, screenshots; wait for visual feedback.

**Work completed (verified):**

- `/` is now the landing page (ADR-025); the post-login router moved to `/app`; the login redirect, in-app wordmark link, permission-denied link, confirm-route default and invite links point at `/app`. The proxy keeps `/app` behind authentication (verified: 307 to `/login?next=%2Fapp`).
- Landing (`src/components/landing/*`): fixed nav with scroll backdrop and sheet menu, hero with the requested headline, real-product showcase (`AppShell` + `KanbanBoard`, synthetic data, `inert` and `aria-hidden`), facts strip of implemented properties only, three feature chapters with real-component visuals, AI Candidate Insights marked "In development" with an illustration labelled as such, CTA, footer. No testimonials, logos, metrics or certifications. CTAs: "Sign in"/"Get started" → `/login`; "Open app" → `/app` for signed-in visitors.
- Design system: `.landing` token set (navy surfaces, electric blue primary, violet glow) in `src/app/globals.css`, documented in `docs/DESIGN.md` §8.1 with contrast figures; the same tokens are the proposed application dark theme (§8.2), not applied.
- SEO: absolute title, description, Open Graph/Twitter metadata, generated `/opengraph-image` (1200×630).
- Motion: hero stagger, showcase scale-in, scroll reveals (once), 14 s glow drift; transform/opacity only; disabled under reduced motion.
- Tests: `tests/e2e/landing.spec.ts` (hero and honest copy, CTAs, section navigation incl. mobile sheet, inert showcase with no focusable element in the tab order, `/app` redirect, axe WCAG 2.x A/AA); landing added to the screenshot pages.
- One defect found and fixed during the build: a constant exported from a `"use client"` module was imported by a Server Component (it arrives as a client reference, not data); moved to a plain data module.

**Tests run and exact results:**

| Command                               | Result                                                                                 |
| ------------------------------------- | -------------------------------------------------------------------------------------- |
| `pnpm lint` / `pnpm typecheck`        | Pass                                                                                   |
| `pnpm test`                           | 99 passed / 99                                                                         |
| `pnpm build`                          | Pass                                                                                   |
| `pnpm test:e2e`                       | 45 passed (55 skipped: opt-in screenshots and single-project tests); chromium + mobile |
| `SCREENSHOTS=1 … screenshots.spec.ts` | 27 passed; 9 pages × 3 breakpoints, no horizontal overflow                             |
| Dev server (port 3100)                | `/` 200, `/app` 307 → login, preview routes 200                                        |

**Review URL:** http://localhost:3100/ (landing), http://localhost:3100/preview (app preview). Visual feedback pending.

**Verified vs pending:** landing implemented and tested locally; dashboard refresh is a documented proposal (`docs/DESIGN.md` §8.2) awaiting the owner's direction; hosted push, bootstrap admin, deployment not approved and not run.

**Follow-up (same day):** the first full-page captures showed every section below the fold as blank: Motion server-renders the scroll-reveal `initial` state, so sections stay invisible until they scroll into view, and a visitor without JavaScript would never see them. Fixed with `data-reveal` wrappers plus a `<noscript>` rule that forces them visible, and the capture now scrolls the page before the shot. CI had also failed the landing axe check on the mobile profile because axe sampled colours mid-animation (a half-faded button reported as 3.66:1); the test now scrolls the page and waits until every reveal has reached full opacity before analysing. Re-run: `pnpm test:e2e` 45 passed, screenshots 27 passed, commit `fc7024f`; GitHub Actions run 39318041337: success.

## 2026-10-19 (continued) — Hosted push executed once (approved) and read-only verification

**Request:** landing design approved as is. The owner explicitly approved running `pnpm supabase:hosted push` once against the verified project, after confirming the ref and that the pending migrations are exactly the three reviewed files; then read-only verification of migration history, tables, RLS policies, advisors and schema differences; stop on anything unexpected. Not approved (not done): admin users, hosted authentication settings, deployment, AI integration.

**Pre-flight (all verified before the push):**

- Project ref `zcxmyaxpftzwpzvmhslm`; `NEXT_PUBLIC_SUPABASE_URL` matches; the wrapper's ref guard passed; `supabase/.temp/project-ref` matches; linked project name `talentflow-ats`.
- The three files in `supabase/migrations/` are byte-identical to `HEAD` (sha256 `a4ac237d…`, `8a789f19…`, `a6f611cd…`; last changed in commit `02980df`).
- Hosted state before the push: MCP `list_migrations` → `[]`, `list_tables` (public) → `[]`.
- Fresh `pnpm supabase:hosted dry-run` (pooler route) listed exactly `20261019120000_initial_schema.sql`, `20261019120100_rls_policies.sql`, `20261019130000_membership_activation.sql`; seeds and roles empty.

**Push (run once), verbatim output (connection string masked by the wrapper):**

```text
> node --env-file=.env.local scripts/db/hosted.mjs "push"
[hosted] project zcxmyaxpftzwpzvmhslm: supabase db push --db-url <pooler-url>
Connecting to remote database...
Applying migration 20261019120000_initial_schema.sql...
Applying migration 20261019120100_rls_policies.sql...
Applying migration 20261019130000_membership_activation.sql...
{"upToDate":false,"dryRun":false,"migrations":["20261019120000_initial_schema.sql","20261019120100_rls_policies.sql","20261019130000_membership_activation.sql"],"seeds":[],"roles":[],"message":"Finished supabase db push."}
exit=0
```

Nothing unexpected occurred; the stop rule was not triggered.

**Read-only verification after the push:**

| Check                         | Tool                                                                                                                   | Result                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migration history             | `pnpm supabase:hosted list-remote`                                                                                     | exit 0; `{"migrations":[{"local":"20261019120000","remote":"20261019120000",…},{"local":"20261019120100","remote":"20261019120100",…},{"local":"20261019130000","remote":"20261019130000",…}],"message":"Migrations listed"}` — local and remote identical                                                                                                                  |
| Migration history             | MCP `list_migrations`                                                                                                  | three versions: `initial_schema`, `rls_policies`, `membership_activation`                                                                                                                                                                                                                                                                                                   |
| Tables                        | MCP `list_tables` (public)                                                                                             | 9 tables (`organizations`, `profiles`, `platform_admins`, `organization_memberships`, `jobs`, `candidates`, `applications`, `candidate_ai_insights`, `audit_events`), every one `rls_enabled: true`, all empty                                                                                                                                                              |
| Schema differences            | `scripts/db/schema-fingerprint.sql` on hosted (MCP `execute_sql`) vs `pnpm db:fingerprint` (local embedded PostgreSQL) | **identical**: fingerprint `227fed80180eced8183d19d5634a8ee0` on both; objects 215, columns 82, policies 16, functions 10 (Supabase's own `rls_auto_enable` excluded), triggers 13, auth triggers 2, RLS-enabled tables 9 (hosted re-run after the counter fix below also reports 9)                                                                                        |
| Security advisor              | MCP `get_advisors` (security)                                                                                          | 0 ERROR. WARN `anon_security_definer_function_executable` for `sync_profile_from_auth_user`, `rls_auto_enable`; WARN `authenticated_security_definer_function_executable` for the same two plus `is_platform_admin`, `is_org_member`, `can_access_org`, `shares_organization_with`, `log_audit_event`, `activate_my_memberships` (the last six are intentional RPC helpers) |
| Performance advisor           | MCP `get_advisors` (performance)                                                                                       | INFO only: 14 unindexed foreign keys, 9 unused indexes (database is empty; no action now)                                                                                                                                                                                                                                                                                   |
| Table privileges per API role | MCP `execute_sql` (`has_table_privilege`)                                                                              | `anon`: none on any table (as designed). `authenticated`: the designed DML **plus** `REFERENCES`, `TRIGGER`, `TRUNCATE` on every table (Supabase default privileges, not present locally). `service_role`: all                                                                                                                                                              |
| Function EXECUTE per API role | MCP `execute_sql` (`has_function_privilege`)                                                                           | helper functions: `anon` false, `authenticated` true (as designed); trigger functions `sync_profile_from_auth_user`, `set_updated_at`, `prevent_organization_change`, `touch_stage_changed_at` and Supabase's `rls_auto_enable`: executable by both roles                                                                                                                   |

**Assessment:** migrations applied in order, history consistent, RLS enabled everywhere, schema identical to the local reference. Two differences from the local model were found, both caused by Supabase's default privileges rather than by the migrations: `authenticated` holds `TRUNCATE`/`REFERENCES`/`TRIGGER` (RLS does not govern `TRUNCATE`; PostgREST does not expose it, so the practical exposure is low, but it should not exist), and the profile-sync trigger function is executable over RPC (trigger functions cannot run outside a trigger, so the advisor warning is cosmetic). `rls_auto_enable()` belongs to the platform and is not ours to change.

**Proposed (not applied) — migration 0004, privilege hardening:** `supabase/proposed/20261019140000_privilege_hardening.sql` revokes `TRUNCATE`, `REFERENCES`, `TRIGGER` from `authenticated` on all public tables and from the schema's default privileges, removes `anon` from the table defaults, limits `sync_profile_from_auth_user()` to `supabase_auth_admin`, and attempts to revoke `rls_auto_enable()` without failing if the platform owns it. The `supabase/proposed/` directory is outside `supabase/migrations/`, so no push can pick it up (ADR-026). Verified locally by `tests/db/privilege-hardening.test.ts`, which first emulates Supabase's default privileges, reproduces the hosted finding exactly, applies the proposal, and checks the result (including that the `auth.users` → `profiles` trigger still fires as `supabase_auth_admin`, a role added to `scripts/db/local-auth-shim.sql`). Moving the file into `supabase/migrations/` and pushing it needs the owner's approval.

**Other changes:** `scripts/db/schema-fingerprint.sql` + `scripts/db/schema-fingerprint.ts` (`pnpm db:fingerprint`) committed; the `rls_enabled_tables` counter matched `t` instead of `true` and reported 0 (cosmetic; hashes were unaffected) — fixed, and the hosted re-run reports 9. Policy count corrected from 21 to 16 in two documents.

**Tests run and exact results:**

| Command                        | Result                                                    |
| ------------------------------ | --------------------------------------------------------- |
| `pnpm lint` / `pnpm typecheck` | Pass                                                      |
| `pnpm db:verify`               | 36 passed / 36 in 4 files (31 existing + 5 new hardening) |
| `pnpm db:fingerprint`          | `227fed80180eced8183d19d5634a8ee0`, RLS-enabled tables 9  |

**Not done (separate approvals):** `pnpm bootstrap:admin` (first hosted user; note that the `auth.users` → `profiles` trigger has not yet fired on the hosted project, so the bootstrap is also its first real exercise), hosted Authentication settings (sign-ups off, OTP expiry, redirect URLs, password length), migration 0004, deployment, AI integration.

## 2026-10-20 — Review of proposed privilege-hardening migration 0004 (nothing applied)

**Request:** before the first admin is created, review `supabase/proposed/20261019140000_privilege_hardening.sql`: explain each removed privilege, verify app functionality, RLS helpers, triggers and admin/customer workflows are preserved, run the relevant local tests, confirm safe applicability to the empty hosted database, report risks; do not apply, create users, change hosted auth settings or deploy. Review document for the owner: `docs/PRIVILEGE_HARDENING_REVIEW.md`.

**Hosted preconditions measured read-only (MCP `execute_sql`, role `supabase_read_only_user`):** roles `anon`, `authenticated`, `service_role`, `supabase_auth_admin`, `postgres`, `supabase_admin` exist; all nine tables and all our functions are owned by `postgres`; `rls_auto_enable()` is owned by `postgres`, `SECURITY DEFINER`, ACL null, and is the function of event trigger `ensure_rls` (`ddl_command_end`); `pg_default_acl` for role `postgres` in `public`: tables `{postgres=arwdDxtm,anon=Dxtm,authenticated=Dxtm,service_role=Dxtm}`, functions `{postgres=X}`, sequences `{postgres=rwU}`; `jobs` ACL `{postgres=arwdDxtm,authenticated=arwdDxtm,service_role=arwdDxtm}`; 3 migrations; 0 live rows; `auth.users` 0, `profiles` 0, `platform_admins` 0. `pnpm supabase:hosted dry-run` (read-only): `"upToDate":true … "Remote database is up to date."` — the proposal directory is invisible to the CLI.

**Correction to yesterday's finding:** the hosted tables also carry `MAINTAIN` (PostgreSQL 17, the `m` in `arwdDxtm`), which yesterday's eight-privilege query did not test; and Supabase's per-schema default for new tables is `TRUNCATE, REFERENCES, TRIGGER, MAINTAIN` only (not `ALL`), for all three API roles. The proposal and the test were updated accordingly: statement 1 now revokes `maintain` too, statement 2 removes the per-schema default for `anon`, `authenticated` and `service_role` (new tables then start with no API-role privileges, as locally), and the test emulates the measured default instead of `ALL`.

**PostgreSQL 17 semantics checked with a one-off experiment** (embedded 17.10, script outside the repository), verbatim output:

```json
{
  "server": "17.10",
  "writer_has_execute_on_trigger_fn": false,
  "row_trigger_fired_without_execute": true,
  "direct_call_without_execute": "permission denied for function trg",
  "direct_call_with_execute": "trigger functions can only be called as triggers",
  "event_trigger_fired_without_execute": true,
  "event_trigger_delta": 1,
  "writer_maintain_before": true,
  "writer_maintain_after": false,
  "default_grant_applied": true,
  "default_revoke_reversed_it": true,
  "default_acl_entries_after": []
}
```

Conclusions: row triggers and event triggers fire without an EXECUTE check on the invoking role, so the EXECUTE revokes cannot break the `auth.users` → `profiles` trigger or Supabase's `ensure_rls`; a trigger function cannot be run over RPC before or after (only the error text changes); `MAINTAIN` revokes work; a per-schema `ALTER DEFAULT PRIVILEGES … REVOKE` reverses a per-schema GRANT (the measured case). (A first version of the experiment counted all event-trigger rows and reported `false`, because GRANT/REVOKE also fire `ddl_command_end`; measuring the delta around the DDL fixed the measurement, not the semantics.)

**Tooling added:** hosted-like mode for the database suite, `TALENTFLOW_DB_HOSTED_LIKE=1 pnpm db:verify` (`scripts/db/local-schema.ts`): emulates the measured hosted default privileges before the migrations and applies `supabase/proposed/*.sql` after them, so the entire suite runs on the state the proposal would leave on the hosted project. `pnpm db:types` always uses the committed migrations only. The hardening test (now 10 cases) covers: reproduced hosted grants and default, DML-only result for `authenticated`, nothing for `anon`, `service_role` unchanged, helpers and RPCs executable by `authenticated` and denied to `anon`, `SECURITY INVOKER` trigger functions untouched, profile-sync trigger limited to `supabase_auth_admin` and still firing, future tables with no API-role privileges, idempotent re-application.

**Tests run and exact results:**

| Command                                      | Result                                                                                       |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `pnpm db:verify`                             | 41 passed / 41 (4 files)                                                                     |
| `TALENTFLOW_DB_HOSTED_LIKE=1 pnpm db:verify` | 41 passed / 41; "hosted-like mode (default privileges emulated; 1 proposed migration(s): …)" |
| `pnpm test`                                  | 99 passed / 99                                                                               |
| `pnpm lint` / `pnpm typecheck`               | Pass (one type error from the loader's new return type fixed in `scripts/db/gen-types.ts`)   |
| `pnpm db:types`                              | no diff                                                                                      |
| `pnpm supabase:hosted dry-run`               | exit 0, up to date, nothing pending                                                          |

**Verified vs pending:** the proposal is verified locally and judged safe for the empty hosted database (`docs/PRIVILEGE_HARDENING_REVIEW.md` §6–§7). Not done, awaiting separate approvals: applying 0004, `pnpm bootstrap:admin`, hosted Authentication settings, deployment, AI integration.
