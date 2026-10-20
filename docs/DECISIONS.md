# TalentFlow ATS — Decision Journal

Chronological architecture decision records. Statuses: Proposed | Approved | Implemented | Verified | Superseded. "Implemented" means code or configuration exists; "Verified" means evidence is recorded in `docs/TEST_PLAN.md` or `docs/DAILY_LOG.md`.

### ADR-001 — Core stack: Next.js 16 App Router, Supabase, Azure App Service

- Date: 2026-10-19
- Context / problem: The specification mandates Supabase (Auth + PostgreSQL + RLS) and Azure hosting, and asks for a polished React UI delivered in seven days.
- Options considered: (a) Next.js App Router on Azure App Service; (b) Next.js on Azure Static Web Apps (hybrid); (c) Remix/React Router on App Service.
- Chosen approach: (a) Next.js 16.4.2 (App Router, React 19.3, strict TypeScript, Tailwind CSS 4, shadcn/ui) on Azure App Service, with Supabase as identity provider and system of record.
- Why this approach: Mandated backend; App Service runs a standard Node server, so Server Actions, proxy and route handlers work without the feature gaps of Static Web Apps' hybrid mode; broadest ecosystem support for `@supabase/ssr`.
- Trade-offs / risks: Next.js 16 changed conventions (proxy instead of middleware, Cache Components). Mitigated by reading the bundled docs in `node_modules/next/dist/docs` and by ADR-003.
- Security and privacy implications: Server-side rendering keeps secrets on the server; see ADR-006/007.
- Implementation reference: `package.json`, `next.config.ts`.
- Verification evidence: Scaffold created with `create-next-app@16.4.2`; baseline checks recorded in `docs/DAILY_LOG.md` (2026-10-19).
- Status: Approved (mandated) / Implemented (scaffold)

### ADR-002 — Package manager: pnpm

- Date: 2026-10-19
- Context / problem: Need a fast, deterministic install on Windows and in CI.
- Options considered: npm, pnpm, yarn (not installed).
- Chosen approach: pnpm 10.17.1 with a committed `pnpm-lock.yaml`; `packageManager` field pinned.
- Why this approach: Already installed, strict dependency resolution, fast CI. pnpm 10 blocks dependency build scripts by default, which is a security benefit; required scripts are allow-listed explicitly.
- Trade-offs / risks: Azure build must use pnpm (use `corepack enable` or install pnpm in the pipeline).
- Security and privacy implications: Build scripts are opt-in.
- Implementation reference: `package.json`, `pnpm-workspace.yaml`.
- Verification evidence: `pnpm install` succeeded 2026-10-19 (see daily log).
- Status: Implemented

### ADR-003 — Disable Cache Components and partial prefetching

- Date: 2026-10-19
- Context / problem: `create-next-app` 16.4 enables `cacheComponents` and `partialPrefetching`. With Cache Components, every page that reads the session cookie must be wrapped in Suspense boundaries and reasoned about for static shells. Every page in this product is authenticated and tenant-specific.
- Options considered: (a) keep Cache Components and adopt the `use cache: private` patterns; (b) disable both flags and render tenant pages dynamically.
- Chosen approach: (b).
- Why this approach: Removes a whole class of accidental cross-user caching bugs and build-time validation errors; the product has no public static content that would benefit. Time budget favours the proven dynamic model.
- Trade-offs / risks: Slightly slower navigations than a static shell; acceptable for an internal B2B tool. Can be revisited after launch.
- Security and privacy implications: Positive. No tenant data is ever placed in a shared cache.
- Implementation reference: `next.config.ts`.
- Verification evidence: Build output lists routes as dynamic; recorded in `docs/DAILY_LOG.md`.
- Status: Implemented

### ADR-004 — Candidate and application are separate entities

- Date: 2026-10-19
- Context / problem: One person may be considered for several jobs; the pipeline stage belongs to the person-job pair.
- Options considered: (a) candidate row with a single job and stage; (b) candidate + application rows.
- Chosen approach: (b). `applications(job_id, candidate_id, stage)` with a unique pair constraint.
- Why this approach: Avoids duplicate person records, makes the Kanban a view over applications, and supports job filtering naturally.
- Trade-offs / risks: One extra step in the UI (associate candidate with job). The candidate form offers "also add to job" to keep the flow short.
- Security and privacy implications: Composite foreign keys keep both sides in one tenant (ADR-005).
- Implementation reference: `supabase/migrations/20261019120000_initial_schema.sql`.
- Verification evidence: Migration applied locally (see daily log); integration tests in Phase 2.
- Status: Implemented (schema)

### ADR-005 — Tenant isolation in PostgreSQL RLS with security-definer helpers

- Date: 2026-10-19
- Context / problem: Cross-tenant access must be impossible even if application code has a bug.
- Options considered: (a) application-level filtering only; (b) RLS with inline subqueries on memberships; (c) RLS with `security definer` helper functions; (d) one database per tenant.
- Chosen approach: (c). Every tenant-owned table has `organization_id`; policies call `can_access_org(organization_id)`; helpers are `security definer` with `search_path = ''`; `organization_id` is immutable; applications use composite foreign keys.
- Why this approach: (a) is not a boundary. (b) recurses when the memberships table's own policy references memberships. (d) is overkill for the timeframe. (c) is the pattern recommended by Supabase for exactly this recursion problem and keeps policies uniform.
- Trade-offs / risks: Helper functions must be reviewed carefully because they bypass RLS internally; they contain only membership lookups. Platform admins see everything by design.
- Security and privacy implications: Database is the final authority; negative tests are mandatory.
- Implementation reference: `supabase/migrations/20261019120100_rls_policies.sql`, `docs/DATABASE.md`.
- Verification evidence: RLS test suite in `tests/db` (Phase 0 smoke, Phase 1 full matrix).
- Status: Implemented; verified locally (22 RLS tests on embedded PostgreSQL, 2026-10-19); hosted verification pending

### ADR-006 — Platform admin model: explicit table, same workspace routes, audited context entry

- Date: 2026-10-19
- Context / problem: Platform admins must perform customer operations without a separate code path and without trusting client claims.
- Options considered: (a) JWT custom claim `role=admin`; (b) `platform_admins` table checked by RLS helper; (c) admin impersonates a customer user.
- Chosen approach: (b). `can_access_org()` returns true for admins, so the tenant routes `/o/[orgSlug]/…` work for both roles. Entering a customer context records an `admin.context_entered` audit event and shows a banner. No identity impersonation.
- Why this approach: Claims can lag or be forged if misconfigured; a table is revocable instantly and auditable. Impersonation would blur accountability in audit logs.
- Trade-offs / risks: One extra database lookup per request (cached per request in the DAL).
- Security and privacy implications: Admin access to candidate data is legitimate but logged.
- Implementation reference: migrations; `src/server/auth.ts` (planned).
- Verification evidence: pending.
- Status: Approved / Implemented (schema)

### ADR-007 — Provisioning through server-side service role; invite links shown once

- Date: 2026-10-19
- Context / problem: Creating users, memberships and admins requires privileges that end users must not have. Supabase's default email service only delivers auth emails to project team members unless custom SMTP is configured, so invite e-mails may not reach demo customers.
- Options considered: (a) RLS insert policies for admins and client-side calls; (b) Server Actions using the service-role key after a database-backed admin check; (c) temporary passwords emailed to users.
- Chosen approach: (b). The admin action generates an invite link with `auth.admin.generateLink({ type: 'invite' })` and displays it once for copy; if SMTP is configured, the same action can also send the email. The invited user sets a password on first visit.
- Why this approach: Keeps elevated privileges server-side, works without SMTP, avoids sending passwords, and leaves an audit trail.
- Trade-offs / risks: The admin must deliver the link out of band for the demo. Links expire with the email OTP setting (default one hour); the action can regenerate.
- Security and privacy implications: Service-role key is server-only and guarded by `server-only`; invite links are never logged.
- Implementation reference: `src/lib/supabase/admin.ts`, `src/server/actions/admin.ts` (planned).
- Verification evidence: pending.
- Status: Approved

### ADR-008 — shadcn/ui on the Radix base with Tailwind v4 CSS variables

- Date: 2026-10-19
- Context / problem: shadcn 4.x defaults to the Base UI preset; the spec names shadcn/ui and demands strong accessibility.
- Options considered: Base UI preset (default), Radix base, headless custom components.
- Chosen approach: Radix base with the Nova preset (`shadcn init -b radix -p nova`), CSS variables, pointer cursor on buttons.
- Why this approach: Longest accessibility track record, best documentation and testing knowledge, identical component API for the team.
- Trade-offs / risks: Radix is in maintenance mode compared to Base UI; acceptable for this horizon.
- Security and privacy implications: none.
- Implementation reference: `components.json`, `src/components/ui/`.
- Verification evidence: components compile in the baseline build (daily log).
- Status: Implemented

### ADR-009 — Motion for React with global reduced-motion support and a small motion budget

- Date: 2026-10-19
- Context / problem: The spec wants Motion animations that aid orientation, never decoration, and reduced-motion support.
- Options considered: CSS transitions only; Motion for React; GSAP.
- Chosen approach: Motion for React 14 (`motion/react`), `MotionConfig reducedMotion="user"`, shared duration/easing tokens, four sanctioned uses (page entrance, dialogs, Kanban card movement, stage badge change).
- Why this approach: `layout` animations and `AnimatePresence` make Kanban movement trivial and interruptible; the library is React-native and tree-shakeable.
- Trade-offs / risks: Bundle size (roughly 30 kB gzipped for the features used); acceptable.
- Security and privacy implications: none.
- Implementation reference: `docs/DESIGN.md` §5; `src/components/motion/` (planned).
- Verification evidence: pending.
- Status: Approved

### ADR-010 — Local verification with embedded PostgreSQL and an auth shim

- Date: 2026-10-19
- Context / problem: No Docker on the development machine, so `supabase start` is unavailable; a hosted project needs credentials and approval. Migrations and RLS still need to be tested before anything is deployed.
- Options considered: (a) wait for a hosted project; (b) embedded PostgreSQL 17 with a minimal `auth` schema shim; (c) SQLite (not compatible with RLS).
- Chosen approach: (b). `scripts/db/local-auth-shim.sql` creates `auth.users`, `auth.uid()`, `auth.role()` and the `anon` / `authenticated` / `service_role` roles; tests set `request.jwt.claim.sub` with `set_config` and switch roles with `set local role`.
- Why this approach: Real PostgreSQL semantics for policies, constraints and triggers; runs in CI without secrets; the same migrations are later pushed to the hosted project unchanged.
- Trade-offs / risks: The shim does not emulate GoTrue behaviour (for example email confirmation). Auth flows are tested end-to-end against the hosted project in Phase 4/5.
- Security and privacy implications: Shim is never applied to hosted environments (guard in the script).
- Implementation reference: `scripts/db/`, `tests/db/`, `vitest.config.mts`.
- Verification evidence: recorded in daily log once the first run passes.
- Status: Verified (first run 2026-10-19: shim + 2 migrations applied, 22 tests passed)

### ADR-011 — Visual tokens: Geist via next/font, indigo brand hue, warm neutrals

- Date: 2026-10-19
- Context / problem: The UI/UX skill proposed sky-blue + Poppins/Open Sans from Google Fonts.
- Options considered: adopt as-is; adapt.
- Chosen approach: Adapt (see `docs/DESIGN.md` §1 for the specific overrides).
- Why this approach: Distinctive look, self-hosted fonts (no third-party request, better privacy and performance), contrast verified for the chosen pairs.
- Trade-offs / risks: Subjective; easy to retune through CSS variables.
- Security and privacy implications: No external font requests from the browser.
- Implementation reference: `src/app/globals.css`, `src/app/layout.tsx`.
- Verification evidence: pending visual review.
- Status: Approved

### ADR-012 — Testing stack: Vitest (unit + database), Playwright (end-to-end)

- Date: 2026-10-19
- Context / problem: The spec requires unit, integration/authorization and E2E tests with recorded evidence.
- Options considered: Jest + Playwright; Vitest + Playwright; Cypress.
- Chosen approach: Vitest 5 for unit tests and the RLS suite (embedded PostgreSQL), Playwright 1.64 for E2E against a running app with a hosted Supabase project.
- Why this approach: Vitest shares the TypeScript/ESM setup; Playwright has first-class accessibility assertions and traces for evidence.
- Trade-offs / risks: E2E requires the hosted project; until then E2E is limited to unauthenticated flows.
- Security and privacy implications: Test data is synthetic.
- Implementation reference: `vitest.config.mts`, `playwright.config.ts`, `tests/`.
- Verification evidence: baseline unit run in daily log.
- Status: Implemented; unit (48) and db (22) suites verified 2026-10-19; E2E pending

### ADR-013 — LinkedIn as URL only; GitHub via official API; AI advisory and gated

- Date: 2026-10-19
- Context / problem: Spec §6 and legal constraints on LinkedIn access.
- Options considered: scraping (rejected), third-party enrichment vendors (out of scope), URL-only.
- Chosen approach: Store and render URLs; GitHub enrichment only through the official REST API; AI insights advisory with provenance and human review; all AI work gated behind core completion.
- Why this approach: Compliance with LinkedIn terms, evidence-based output, protects the core delivery.
- Trade-offs / risks: Less "wow" factor; honest.
- Security and privacy implications: No unauthorized data collection; prompt-injection defences described in `docs/AI_FEATURE.md`.
- Implementation reference: `docs/AI_FEATURE.md`.
- Verification evidence: n/a until implemented.
- Status: Approved (design) / Not implemented

### ADR-014 — Kanban interaction: pointer drag plus keyboard "Move to stage" menu, persisted by Server Action

- Date: 2026-10-19
- Context / problem: Drag-and-drop alone fails WCAG 2.2 (dragging movements) and is fragile on touch.
- Options considered: dnd-kit; Motion drag + drop targets; menu-only.
- Chosen approach: Motion `drag` for pointer users with drop targets per column, and a per-card menu to move to any stage; both call the same `moveApplicationStage` Server Action with optimistic UI and rollback on failure.
- Why this approach: One persistence path, accessible by default, small dependency surface.
- Trade-offs / risks: Custom drop detection is simpler than dnd-kit but less feature-rich (no reordering within a column in v1).
- Security and privacy implications: Stage change is validated server-side (enum) and tenant-checked by RLS.
- Implementation reference: `src/components/kanban/` (planned).
- Verification evidence: pending (Phase 3 E2E).
- Status: Approved

### ADR-015 — Private GitHub repository with CI from the first push

- Date: 2026-10-19
- Context / problem: The owner approved publishing to a private repository named `talentflow-ats` after a secrets check, preserving history.
- Options considered: push now; wait until Phase 1 is complete.
- Chosen approach: `gh repo create talentflow-ats --private --source . --push` after `git log -p` was scanned for key patterns (none found; no `.env*` tracked). CI runs lint, type-check, unit, DB and E2E smoke on every push.
- Why this approach: Early CI catches environment-only assumptions; the first run did exactly that (`LayoutProps` global missing on a clean checkout, fixed by an explicit prop type).
- Trade-offs / risks: CI minutes; embedded PostgreSQL download per run.
- Security and privacy implications: Repository is private; secrets stay in `.env.local`/Actions secrets (none needed yet).
- Implementation reference: `.github/workflows/ci.yml`, https://github.com/Mohamedaliabdikarim/talentflow-ats
- Verification evidence: `docs/DAILY_LOG.md` 2026-10-19 (CI run results).
- Status: Implemented

### ADR-016 — Project-scoped, read-only Supabase MCP server

- Date: 2026-10-19
- Context / problem: The owner wants the official Supabase MCP server available to the agent, scoped to the existing project, read-only at first, authenticated through OAuth without pasting tokens.
- Options considered: user-scoped config; project-scoped `.mcp.json` (shared via git); scoped personal access token in a header.
- Chosen approach: `claude mcp add --scope project --transport http supabase "<url with project_ref and read_only=true>"`; OAuth completed by the owner in an interactive session.
- Why this approach: `.mcp.json` carries no secrets and documents the exact scope for everyone; OAuth avoids long-lived tokens on disk.
- Trade-offs / risks: Tools are unavailable in non-interactive sessions until approved; read-only means migrations go through the CLI, which is the intended separation.
- Security and privacy implications: Read-only; project-scoped; the agent cannot mutate the hosted project through MCP.
- Implementation reference: `.mcp.json`, `docs/SUPABASE_INTEGRATION.md` §2.
- Verification evidence: 2026-10-19 after OAuth: `claude mcp list` → Connected; `get_project_url`, `list_tables` (public: none), `list_migrations` (none) via a headless read-only session (`docs/DAILY_LOG.md`).
- Status: Verified (read-only)

### ADR-017 — Official Supabase agent skills installed in the repository

- Date: 2026-10-19
- Context / problem: The owner asked to evaluate and install relevant official Supabase Agent Skills after inspecting installer changes.
- Options considered: `npx skills add` (project copy), Claude Code plugin marketplace, none.
- Chosen approach: Cloned `supabase/agent-skills`, read both `SKILL.md` files (instructions only, no executables), installed `supabase` and `supabase-postgres-best-practices` for Claude Code with `--yes`, reviewed `git status` (`.claude/skills/**`, `skills-lock.json`) and committed.
- Why this approach: Both skills apply directly (SSR auth patterns, RLS security checklist, Postgres practices); a repository copy keeps the team on the same version.
- Trade-offs / risks: ~45 Markdown files in the repo; updates are manual (`npx skills add … --yes` again).
- Security and privacy implications: Skills are data for the agent; no code runs. They were reviewed before use.
- Implementation reference: `.claude/skills/`, `skills-lock.json`, `docs/TOOLING_INVENTORY.md`.
- Verification evidence: Security checklist from the skill cross-checked against the migrations (`docs/SUPABASE_INTEGRATION.md` §3).
- Status: Implemented

### ADR-018 — Invitation links via token hash and a confirm route, not PKCE action links

- Date: 2026-10-19
- Context / problem: Invitation links are generated server-side (ADR-007). Supabase's `action_link` relies on the PKCE verifier stored by the browser that started the flow, which does not exist for admin-generated links.
- Options considered: use `action_link` with the implicit flow; use `hashed_token` + `/auth/confirm` calling `verifyOtp`; send emails through Supabase SMTP.
- Chosen approach: Build `/auth/confirm?token_hash=…&type=invite|magiclink&next=…` from `properties.hashed_token`; the route handler calls `verifyOtp`, sets the session cookies and redirects to a validated relative path. New users land on `/auth/set-password`, which also calls `activate_my_memberships()`. Existing accounts get a magic link and an active membership immediately.
- Why this approach: Works for server-generated links, keeps the whole flow on our domain, no SMTP dependency, tokens are single-use.
- Trade-offs / risks: Link holder can claim the account until expiry; links must be shared privately; default lifetime is one hour (project setting).
- Security and privacy implications: Tokens are never logged or persisted; audit rows carry user ids only; `redactInviteUrl()` guards future logging; generic error messages on invalid/expired links.
- Implementation reference: `src/lib/invite.ts`, `src/app/auth/confirm/route.ts`, `src/server/actions/admin.ts`, `docs/SUPABASE_INTEGRATION.md` §8.
- Verification evidence: Unit tests (`tests/unit/invite.test.ts`, `tests/unit/admin-actions.test.ts`), E2E smoke for the confirm route without a token; hosted end-to-end pending approval to create users.
- Status: Implemented (local) / Hosted verification pending

### ADR-019 — Self-service membership activation function (migration 0003)

- Date: 2026-10-19
- Context / problem: Invited memberships start as `invited` and members have no update policy on memberships, so the invited user cannot activate their own row through RLS.
- Options considered: create memberships as `active` immediately; let the server action use the service role after `updateUser`; a `SECURITY DEFINER` function restricted to the caller's rows.
- Chosen approach: `public.activate_my_memberships()` (definer, `search_path = ''`, `auth.uid()` guard, updates only `user_id = auth.uid() and status = 'invited'`, `EXECUTE` revoked from `PUBLIC`).
- Why this approach: Keeps the service role out of the end-user flow and keeps the `invited` state meaningful for admins.
- Trade-offs / risks: One more definer function to review; covered by DB tests.
- Security and privacy implications: Cannot affect other users' rows; anonymous callers are rejected.
- Implementation reference: `supabase/migrations/20261019130000_membership_activation.sql`, `tests/db/membership-activation.test.ts`.
- Verification evidence: `pnpm db:verify` (see daily log).
- Status: Implemented / Verified locally

### ADR-020 — Typed Supabase client generated from the migrations

- Date: 2026-10-19
- Context / problem: Untyped queries hide column and relationship mistakes. `supabase gen types --db-url` exited without output on this machine (no Docker, CLI not logged in).
- Options considered: hand-written types; CLI/MCP generation after the hosted apply; a small generator reading the catalog of the embedded database.
- Chosen approach: `scripts/db/gen-types.ts` (`pnpm db:types`) emits `Database` in the supabase-js shape (Tables with Row/Insert/Update/Relationships, Functions, Enums) and all three client factories use `<Database>`.
- Why this approach: Types always match the committed migrations and need no hosted access; later CLI output can be diffed against the file.
- Trade-offs / risks: Custom generator covers the types this schema uses (scalars, arrays, enums, json); exotic types map to `unknown`.
- Security and privacy implications: none.
- Implementation reference: `scripts/db/gen-types.ts`, `src/lib/supabase/database.types.ts`.
- Verification evidence: `pnpm typecheck` passes with typed queries across the data layer.
- Status: Implemented

### ADR-021 — Kanban stage changes: menu action first, pointer drag as a Phase 3 enhancement

- Date: 2026-10-19
- Context / problem: The required board must let users move candidates between stages, persist the change, and remain keyboard and screen-reader accessible (WCAG 2.2 dragging alternative). Drag-and-drop alone fails that and is fragile on touch.
- Options considered: dnd-kit; Motion `drag` with custom drop targets; a per-card "Move to stage" menu.
- Chosen approach: Ship the menu first. `KanbanBoard` updates optimistically with `useOptimistic`, calls `moveApplicationStageAction`, announces the result in an `aria-live` region and a toast, and animates card movement between columns with Motion's shared layout (`layoutId`). Pointer drag will be layered on top of the same action in Phase 3.
- Why this approach: One persistence path, accessible by default, reliable under test; the animation already shows where the card went.
- Trade-offs / risks: No drag yet (planned); no manual ordering inside a column.
- Security and privacy implications: Stage is validated against the enum server-side; the update is filtered by the URL organization and by RLS.
- Implementation reference: `src/components/kanban/kanban-board.tsx`, `src/server/actions/applications.ts`.
- Verification evidence: unit tests (`tests/unit/workspace-actions.test.ts`), DB tests (`tests/db/pipeline.test.ts` "stage moves"); browser verification against the hosted project pending.
- Status: Implemented (local); pointer drag added 2026-10-19 on top of the same action (`tests/unit/kanban-board.test.tsx`)

### ADR-022 — Pipeline filters live in the URL and are applied in the database

- Date: 2026-10-19
- Context / problem: Job and candidate-name filters must combine correctly and be shareable.
- Options considered: client-side filtering of all applications; PostgREST embedded `!inner` filter on the candidate name; a two-step query.
- Chosen approach: A plain GET form writes `?job=<uuid>&q=<name>`. The server parses leniently (`parsePipelineFilters`), resolves candidate ids with an RLS-scoped `ilike` (wildcards escaped), then filters applications by job and candidate ids. The candidates list uses the same `ilike`.
- Why this approach: Works without JavaScript, URLs are shareable, both filters are enforced in the database, and the two-step query avoids ambiguity around aliased embedded filters.
- Trade-offs / risks: Two queries when a name filter is set; fine at this scale.
- Security and privacy implications: Malformed input is ignored rather than erroring; the name pattern is escaped.
- Implementation reference: `src/lib/pipeline.ts`, `src/server/data/pipeline.ts`, `src/components/kanban/pipeline-filters.tsx`.
- Verification evidence: unit tests for parsing and escaping; DB test "job filter and name filter combine" and "never returns the other tenant's namesake".
- Status: Implemented (local)

### ADR-023 — Destructive actions confirm first; deletes cascade as documented

- Date: 2026-10-19
- Context / problem: Jobs, candidates and applications can be removed; accidental deletes must be unlikely and the data effects clear.
- Options considered: no delete in v1; soft delete; hard delete with confirmation.
- Chosen approach: Hard delete behind `ConfirmActionDialog` (a real form submit to a bound Server Action). Deleting a job removes its applications and keeps candidates; deleting a candidate removes their applications and insights; removing an application keeps both records.
- Why this approach: Matches the schema's `on delete cascade` and the spec's "confirm before destructive actions"; soft delete would complicate RLS and filters for no v1 benefit.
- Trade-offs / risks: No undo. Mitigated by the confirmation copy stating exactly what is removed.
- Security and privacy implications: Deletes are filtered by the URL organization and RLS; the cascade is tested.
- Implementation reference: `src/components/confirm-action-dialog.tsx`, delete actions in `src/server/actions/*.ts`.
- Verification evidence: DB test "deleting a job removes its applications but keeps the candidates".
- Status: Implemented (local)

### ADR-024 — Local preview mode: real views, synthetic data, production-gated

- Date: 2026-10-19
- Context / problem: The owner wants to inspect the dashboard, jobs, candidates and the Kanban board in a browser before approving the hosted migration push, so no account can sign in yet.
- Options considered: (a) wait for the push and a bootstrap admin; (b) a local Supabase stack (needs Docker, not available); (c) a preview route tree that renders the same view components with synthetic data and an in-memory store.
- Chosen approach: (c). Page bodies were extracted into `src/components/views/*` so the real routes and `/preview/*` render identical UI. The preview uses `src/preview/demo-data.ts` (fictional people, example.test addresses), an in-memory store on `globalThis` for Kanban moves, a preview Server Action with the same contract as the real one, and disabled forms for visual review. `isPreviewEnabled()` returns true outside production or with `TALENTFLOW_PREVIEW=1`; otherwise the layout is a 404 and the proxy keeps `/preview` behind authentication.
- Why this approach: Gives a faithful visual and interaction review now, doubles as browser-level E2E coverage (Playwright + axe) of pages that otherwise need hosted accounts, and removes duplicated JSX between real and preview routes.
- Trade-offs / risks: One more code path to keep in sync (mitigated by sharing the views); the production build must never set the flag (documented in `docs/SECURITY.md` and `docs/DEPLOYMENT.md`).
- Security and privacy implications: No real data, no Supabase calls, no session; unreachable in the Azure deployment by default; CI enables the flag only for the Playwright web server.
- Implementation reference: `src/preview/`, `src/app/preview/`, `src/components/views/`, `src/proxy.ts`.
- Verification evidence: `tests/unit/preview-enabled.test.ts`, `tests/unit/preview-store.test.ts`, `tests/e2e/preview.spec.ts` (see `docs/DAILY_LOG.md`).
- Status: Implemented

### ADR-025 — Public landing page at "/", post-login router moved to "/app"

- Date: 2026-10-19
- Context / problem: The owner wants a premium public marketing homepage (dark navy, electric blue/violet accents, real product showcase, honest content) while keeping the authenticated application and the local preview intact.
- Options considered: (a) keep "/" as the post-login router and put marketing at "/home"; (b) marketing at "/" and the router at "/app"; (c) separate marketing site.
- Chosen approach: (b). `/` renders `src/components/landing/*`; signed-in visitors see "Open app" (→ `/app`), signed-out visitors see "Sign in" (→ `/login`). `/app` is the role-based router (protected by the proxy). In-app links, the login redirect, the confirm route's default target and invite links now point at `/app`.
- Content policy: no testimonials, customer logos, metrics or certifications (none exist); the "facts strip" lists only implemented properties; AI Candidate Insights is labelled "In development" and shown as an illustration; onboarding is described as invitation-based because that is the real flow.
- Showcase: the real `AppShell` + `KanbanBoard` rendered with synthetic data inside an `inert`, `aria-hidden` frame, so the mockup is the product, not a drawing. The `.landing` token set (navy surfaces, electric blue primary) drives shadcn components inside the landing and doubles as the proposed application dark theme (`docs/DESIGN.md` §8).
- Why this approach: One codebase and theme system, a truthful product picture, and the landing palette becomes a concrete, reviewable direction for the app rather than a separate brand.
- Trade-offs / risks: `/` reads the session cookie to switch CTAs, so it renders dynamically (fine on App Service); the showcase ships the board's client bundle on the landing page. Typography stays Geist (self-hosted) instead of the design skill's Google Fonts suggestions, consistent with ADR-011.
- Security and privacy implications: no new data access; the showcase is inert (no focusable elements, no actions); OG image is generated without external assets.
- Implementation reference: `src/app/page.tsx`, `src/app/app/page.tsx`, `src/app/opengraph-image.tsx`, `src/components/landing/*`, `.landing` block in `src/app/globals.css`.
- Verification evidence: `tests/e2e/landing.spec.ts` (hero, CTAs, nav, inert showcase, `/app` redirect, axe), screenshots at 375/768/1440 px (`docs/screenshots/landing-*.png`); see `docs/DAILY_LOG.md`.
- Status: Implemented (local); owner's visual review pending

### ADR-026 — Proposed migrations wait in `supabase/proposed/`; hosted/local parity by schema fingerprint

- Date: 2026-10-19
- Context / problem: After the first hosted push, verification found differences caused by Supabase's default privileges (extra `TRUNCATE`/`REFERENCES`/`TRIGGER` for `authenticated`, trigger functions executable over RPC). A fix is a schema change, and every hosted write needs separate owner approval. Also needed: a repeatable, read-only way to prove the hosted schema equals the migrations.
- Options considered: (a) commit the fix straight into `supabase/migrations/` and wait for approval before pushing (risk: any later approved push would silently carry it); (b) keep the draft outside the migrations directory until approved; (c) apply by hand in the dashboard (no history, no test).
- Chosen approach: (b). Drafts live in `supabase/proposed/`, which the CLI, `pnpm db:verify`, `pnpm db:types` and CI ignore; each draft has a DB test that applies it explicitly after emulating the hosted starting state. On approval the file moves to `supabase/migrations/` unchanged and follows the normal dry-run → push path. Parity check: `scripts/db/schema-fingerprint.sql` hashes every column, RLS flag, policy, constraint, index, function signature, enum and trigger in `public` (plus the `auth.users` triggers we own); `pnpm db:fingerprint` runs it locally and the same text runs on the hosted project through the read-only MCP; equal hashes mean no drift.
- Why this approach: A proposal cannot be applied by accident, is tested before anyone decides, and the decision record (this file, `docs/SECURITY.md` §8) explains why it exists. The fingerprint turns "no schema differences" from a claim into a reproducible number.
- Trade-offs / risks: Two directories to know about; the fingerprint excludes Supabase-created objects (`rls_auto_enable`) by name and does not hash grants, which are checked by separate privilege queries. Supabase's default privileges are emulated in the test, not reproduced from the platform's own scripts.
- Security and privacy implications: Read-only verification only; no secrets; the proposal reduces privileges and never widens them.
- Implementation reference: `supabase/proposed/20261019140000_privilege_hardening.sql`, `tests/db/privilege-hardening.test.ts`, `scripts/db/schema-fingerprint.sql`, `scripts/db/schema-fingerprint.ts`, `scripts/db/local-auth-shim.sql` (`supabase_auth_admin` role).
- Verification evidence: `pnpm db:verify` 36 passed; hosted and local fingerprints `227fed80180eced8183d19d5634a8ee0` (`docs/DAILY_LOG.md`, 2026-10-19).
- Amendment (2026-10-20): the hosted default privileges were measured precisely (`pg_default_acl`: `TRUNCATE, REFERENCES, TRIGGER, MAINTAIN` on new tables for the three API roles; nothing extra on functions or sequences). The proposal now also revokes `MAINTAIN` and removes the per-schema default for `service_role` as well, so hosted and local agree that new tables start with no API-role privileges. The `db` suite gained a hosted-like mode (`TALENTFLOW_DB_HOSTED_LIKE=1`) that emulates those defaults and applies `supabase/proposed/*.sql`, so every proposal is verified by the whole suite, not only by its own test. Review for the owner: `docs/PRIVILEGE_HARDENING_REVIEW.md`.
- Status: Implemented; migration 0004 reviewed, approved and applied to the hosted project on 2026-10-20 (`supabase/proposed/` is empty again)

### ADR-027 — First-admin bootstrap is dry-run by default and keeps the invitation token out of the terminal

- Date: 2026-10-20
- Context / problem: `pnpm bootstrap:admin` is the only path that creates a hosted user from an operator's machine, and it will be run by an assistant whose terminal output lands in a conversation transcript. The previous version executed immediately, printed the single-use invitation link to stdout, tolerated a failed audit insert, and sent existing accounts to `/app`, which after an expired invitation would have skipped the password step.
- Options considered: (a) keep the script, ask the owner to run it in a private terminal; (b) make the script safe to run from an assisted session: dry run by default, explicit `--apply`, token written to a file the owner opens; (c) move the bootstrap into the dashboard (manual SQL and user creation, no audit, no test).
- Chosen approach: (b). `--apply` is required for any write; `--link-file <path>` writes the link with mode 0600 and the log shows only `token_hash=[redacted]`; the script refuses when another admin exists unless `--allow-existing` is given (further admins belong in `/admin/admins`); audit failures are fatal with recovery guidance; both link types end on `/auth/set-password`; inputs are validated with Zod. The function `bootstrapAdmin(options, client, log)` is exported so the sequence is unit-tested with a fake service-role client, and `tests/db/bootstrap-admin.test.ts` rehearses the database effects and the rollback against the current migrations.
- Why this approach: The owner keeps control of the one hosted write (explicit flag after a reported dry run) without having to run commands by hand, and the secret token never appears in scrollback or in the transcript. Everything the script does to the database is proven locally before it touches the hosted project.
- Trade-offs / risks: One more flag to remember; a file on disk holds the token until the owner deletes it (single use and time-limited anyway). The dry run already needs the service-role key, so the key must be entered before anything can be rehearsed against the hosted project.
- Security and privacy implications: Audit metadata carries ids only; the service-role key is never printed; the invitation token is single-use, expires with the project's OTP setting and is replaced by any re-run.
- Implementation reference: `scripts/bootstrap-admin.ts`, `scripts/env/check-local.mjs` (`bootstrap` profile), `tests/unit/bootstrap-admin.test.ts`, `tests/db/bootstrap-admin.test.ts`, `docs/BOOTSTRAP_ADMIN_PLAN.md`.
- Verification evidence: `pnpm test` 109/109, `pnpm db:verify` 48/48 (both modes), 2026-10-20 (`docs/DAILY_LOG.md`).
- Status: Implemented (local); hosted bootstrap awaiting the owner's approval

### ADR-028 — Product principle: "Build the first version like it's the last version."

- Date: 2026-10-20
- Context / problem: TalentFlow started from an assessment-style specification with a fixed delivery date (2026-10-26). Without an explicit principle, a team under deadline pressure drifts towards demo-grade shortcuts: placeholder buttons, mocked flows, oversold AI, untested paths. The owner set the standard in writing.
- Decision (owner's words): _"Build the first version like it's the last version."_ Treat TalentFlow as a real production-oriented SaaS product for its first paying customer, not a disposable coding assessment or visual demo. Prioritize complete end-to-end workflows, security, accessibility, excellent UX, consistent premium design, and maintainable architecture. No fake functionality, placeholder buttons, misleading AI claims, or shortcuts that compromise production behavior. Keep scope disciplined and protect the October 26 delivery deadline. Finish the required ATS workflows before expanding optional features.
- How it is applied: (1) every shipped control does what it says, or it is not shipped; features that are not implemented are labelled "In development" and never simulated (the landing page already follows this, ADR-025); (2) security and tenant isolation stay database-enforced and verified against the hosted project before any user depends on them (migrations 0001–0004, ADR-026); (3) hosted changes remain approval-gated and rehearsed locally first (ADR-027); (4) accessibility checks (axe, keyboard paths, contrast) and the design tokens in `docs/DESIGN.md` are release criteria, not polish; (5) scope order: required ATS workflows (auth, provisioning, jobs, candidates, applications, Kanban, audit) → deployment → optional AI insights, which stay off until approved and are presented honestly; (6) each phase ends with recorded test results in `docs/TEST_PLAN.md` and `docs/DAILY_LOG.md`.
- Options considered: (a) "demo first, harden later" — rejected: hardening never gets scheduled and the first customer inherits the demo; (b) this principle.
- Trade-offs / risks: fewer visible features by the deadline than a demo-driven build would show; mitigated by finishing the required workflows first and keeping optional features explicitly out of scope until approved.
- Security and privacy implications: none beyond reinforcing the existing rules (`CLAUDE.md`, `docs/SECURITY.md`).
- Implementation reference: `CLAUDE.md` ("Product principle"), `docs/PRD.md` priorities, `docs/DELIVERY_CHECKLIST.md`.
- Verification evidence: not applicable (principle); applied through the phase gate checklist.
- Status: Adopted

### ADR-029 — Disable the Turbopack dev filesystem cache to stop a Next.js 16.4 HMR reload loop

- Date: 2026-10-20
- Context / problem: On `http://localhost:3000` the login/activation page reloaded many times a second ("Compiling…" flashing). Investigation showed it was not a redirect loop or a React/effect problem (every request was `GET /login 200`; guards and proxy behaved correctly). The Turbopack dev HMR socket sent a perpetual `reloadPage` ("HMR hash mismatch") with an empty build hash while no file changed — a known Next.js 16.4 regression (vercel/next.js #100251, #100267) where, after a `next dev` restart with a warm dev filesystem cache, the first HMR message is `restart`, leaving a stale `hmrVersion`.
- Options considered: (a) downgrade Next to 16.3.8 — affects production too and is a large change before the deadline; (b) run dev on webpack instead of Turbopack — a bigger behavioural change and our CSS pipeline is wired to `@tailwindcss/turbopack`; (c) clear `.next` on every restart — treats the symptom, the loop returns on the next warm start; (d) set `experimental.turbopackFileSystemCacheForDev: false` — the documented workaround, dev-only, surgical.
- Chosen approach: (d). `next.config.ts` sets `experimental.turbopackFileSystemCacheForDev: false` with a comment citing the upstream issues and marking it removable once fixed. Production `next build` (standalone, what Azure runs) uses `turbopackFileSystemCacheForBuild` and is unaffected.
- Why this approach: smallest change that removes the root cause rather than the symptom; touches no application code, so authentication, authorization, RLS and the Supabase clients are unchanged; aligns with ADR-028 (a clearly-documented, scoped workaround, not a hack).
- Trade-offs / risks: slightly slower cold dev compiles without the dev FS cache; none in production. Revisit when the Next.js fix lands and drop the flag.
- Security and privacy implications: none; dev-only build setting.
- Implementation reference: `next.config.ts` (`experimental.turbopackFileSystemCacheForDev`).
- Verification evidence: login-page document loads over 15 s fell from 113+ to 1, no `reloadPage` frames; full suite green (`docs/DAILY_LOG.md`, 2026-10-20).
- Status: Adopted (temporary workaround pending the upstream fix)

### ADR-030 — Invited users must establish a password before protected access

- Date: 2026-10-20
- Context / problem: Verifying an invite, magic link or recovery link creates a full session but no user-chosen password. `requireUser()` only checked that a session existed, so a verified-but-passwordless invite session could reach `/admin` without the invited admin ever setting their own password. Discovered when the first platform admin reached the dashboard without knowingly setting one; read-only checks showed a GoTrue-populated `encrypted_password` and timing inconsistent with a human-completed set-password step.
- Options considered: (a) store a `password_set` flag on `public.profiles` and gate on it — but `profiles` is user-writable under RLS, so a user could forge the flag unless it were protected by a definer function; needs a migration and hosted DDL; (b) gate on the JWT `amr` (authentication method) — fragile, breaks legitimate magic-link/recovery sessions and does not update until re-auth; (c) store the flag in Supabase `app_metadata`, which only the service role can write, and enforce in `requireUser()` — no migration, not forgeable, reflected immediately by `getUser()`.
- Chosen approach: (c). `requireUser()` redirects any signed-in user whose `app_metadata.password_set !== true` to `/auth/set-password` (the only exception is that page and its action, which pass `allowWithoutPassword: true`). `setPasswordAction` sets the flag through the service role after saving the password, merging to keep GoTrue's provider keys, and records `auth.password_established`. The session is never revoked; the user is only routed, so legitimate sessions and the recovery flow are preserved.
- Why this approach: a single server-side chokepoint (`requireUser`, which every protected layout and action already calls), consistent with the existing "authorization is server + database; the proxy is optimistic" model; no schema change, so it protects the hosted project as soon as the app runs the code; the flag cannot be set by the user, only by the service role on their own account.
- Trade-offs / risks: one `getUser()` already runs per request, so no extra round-trip for the common case; `setPasswordAction` makes two service-role calls (read then merge-write of `app_metadata`). A user whose password was set outside this flow (e.g. directly in the dashboard) would be routed through set-password once; acceptable and safe. Remove nothing; revisit only if Supabase exposes a first-class "has password" signal.
- Security and privacy implications: strengthens authentication (credentials must be established before access); no secret is read or exposed; `app_metadata` is service-role only.
- Implementation reference: `src/server/auth.ts` (`requireUser`, `getCurrentUser`, `CurrentUser.passwordSet`), `src/server/actions/auth.ts` (`setPasswordAction`), `src/app/auth/set-password/page.tsx`, `src/server/audit.ts` (`auth.password_established`).
- Verification evidence: `tests/unit/auth-guards.test.ts`, `tests/unit/set-password-action.test.ts`; full suite green 2026-10-20 (`docs/DAILY_LOG.md`).
- Status: Implemented (local + tests); enforced on the hosted project through the running app, which required no hosted change

### ADR-031 — Reissue invitations by reusing the token, never the membership row

- Date: 2026-10-20
- Context / problem: invitation links expire in about an hour. The original `inviteUserAction` inserts the membership after generating the link, so re-inviting someone who is already a member fails on the `organization_memberships_unique` constraint and the fresh link is never surfaced. A platform admin had no way to resend a link for a pending invitee.
- Options considered: (a) delete and recreate the membership — loses history, risks downgrading an active member, and is unnecessary; (b) add an `invited_at`/token column and a migration — schema change for no benefit, since Supabase already holds the token; (c) separate the two concerns: a resend action that only regenerates the auth token for an already-invited account and never writes a membership row.
- Chosen approach: (c). `reissueInvitationAction` acts only when the membership status is `invited`, generates a fresh one-time token for the existing account, and leaves the membership untouched. An active membership is refused; a missing one returns a clear error. The unique `(organization_id, user_id)` constraint (proven in a DB test) guarantees no duplicate, because nothing is inserted. The new token invalidates the old link, so expired/used links fail safely at `/auth/confirm`.
- Why this approach: no schema change, no risk to active members, full auditability (`user.invite_reissued`, ids only), and the one-time link is shown once through the same `OneTimeLink` component. Consistent with ADR-006/007 and the product principle: a real, safe onboarding-recovery path rather than a quick delete-recreate hack.
- Trade-offs / risks: the resend uses the service role to read the membership and the account email; it is gated behind `requirePlatformAdmin` and scoped to a single membership id. No automated end-to-end test through the real Auth server (hosted GoTrue), covered instead by unit, DB and jsdom tests.
- Security and privacy implications: authorization unchanged (platform admin only); audit metadata carries ids only; links are never logged; organization isolation is unaffected (no cross-tenant read or write).
- Implementation reference: `src/server/actions/admin.ts` (`reissueInvitationAction`), `src/components/forms/resend-invite-button.tsx`, `src/components/views/members-table.tsx` (`showResend`), `src/lib/validation/admin.ts`, `src/server/audit.ts`.
- Verification evidence: `tests/unit/admin-actions.test.ts`, `tests/db/membership-activation.test.ts`, `tests/unit/resend-invite-button.test.tsx`; full suite green 2026-10-20 (`docs/DAILY_LOG.md`).
- Status: Implemented (local + tests); no hosted change required

### ADR-032 — Customer workspace adopts the navy theme via a scoped `.app` token set

- Date: 2026-10-20
- Context / problem: the authenticated customer workspace still used the light warm-neutral theme while the landing page established a premium navy design language. The workspace needed the same quality without disturbing the platform-admin area, the landing page, or any behaviour.
- Options considered: (a) switch the global `.dark`/`:root` tokens to navy — would restyle the admin area too and couple the app to a single palette; (b) per-page styling — inconsistent and unmaintainable; (c) a scoped `.app` token set applied only to the workspace shell, with shared components reading the tokens so they adapt per scope.
- Chosen approach: (c). `.app` in `src/app/globals.css` redefines the shadcn token set (navy, derived from `.landing`, cards one step above the canvas); `AppShell theme="app"` applies it, passed by the real workspace layout and the preview workspace layout only. Shared components (shell, nav, page header, stat card, empty state, Kanban, stage accents) were polished with token-based classes, so the admin area keeps its light look and the landing is unchanged (its embedded showcase inherits the refined Kanban cosmetics).
- Why this approach: one token scope + token-driven components give a cohesive premium look with no duplication, no server action / route / data / RLS change, and a clean boundary (admin and landing untouched). Verifiable via the preview with synthetic data.
- Trade-offs / risks: shared shell components also appear in the admin area, so the brand tile, sticky header and wider sidebar carry over there (minor, functional, not a redesign); a reduced-opacity footer text had to be corrected for contrast on the light admin sidebar (caught by axe).
- Security and privacy implications: none; CSS and presentational markup only.
- Implementation reference: `src/app/globals.css` (`.app`, `.app-sidebar-surface`, `.app-brand-mark`, `.app-aurora`), `src/components/app-shell.tsx` (`theme`), `nav-link.tsx`, `page-header.tsx`, `kanban/kanban-board.tsx`, `stage-badge.tsx` (`stageAccentClass`), `views/workspace-overview.tsx`, the two workspace layouts.
- Verification evidence: `pnpm check` green, `pnpm test:e2e` 45 passed / 55 skipped, all preview workspace pages pass axe under the new theme, screenshots at 375/768/1440 (`docs/DAILY_LOG.md`, `docs/DESIGN.md` §8.2).
- Status: Implemented

### ADR-033 — Candidate CV uploads: private Storage, three-layer isolation, explicit AI consent

- Date: 2026-10-21
- Context / problem: recruiters need to store a candidate's CV (often received by email) as a PDF, view/download/replace/delete it, with strict tenant isolation and a consent model that never lets a recruiter upload imply permission for AI analysis.
- Options considered: (a) store files as bytea in Postgres — bloats the database, no streaming, no Storage RLS; (b) a public Storage bucket with obscure URLs — a leaked URL exposes the file; (c) a private bucket with `storage.objects` RLS keyed on the organization id in the object path, files streamed through the server after an app-layer check.
- Chosen approach: (c). Object keys are `"<organization_id>/<candidate_id>/<random>.pdf"` (UUIDs only, no PII). Every operation is guarded by `requireOrgAccess()`, the `candidates` RLS policy, and the `storage.objects` policy (`can_access_org` on the first path segment) — three layers. The server streams the file (`…/cv` route) so no signed or public URL is ever produced. Validation is server-side (PDF type, `%PDF-` signature, 10 MB, sanitized filename, server-generated key). Consent is modelled on `public.candidates`: `cv_source`, and `cv_ai_authorized` defaulting false with who/when/basis, revocable, reset on replace/delete, and a check that forbids authorization without a CV. No AI analysis is implemented; it must later require `cv_ai_authorized = true`.
- Why this approach: reuses the existing tenant-isolation helpers and the user-scoped client, keeps the database small, never exposes a URL, and encodes the consent rule in constraints and the UI (unchecked confirmation, stated basis). Partial failures are compensated (orphan-free where practical), and audit metadata stays ids-only.
- Trade-offs / risks: Storage policies and the bucket live in the `storage` schema, which the local embedded database lacks, so they are provisioned by a separate hosted-setup SQL file (approval-gated) and their logic is proven locally against an emulated `storage.objects`. A rare storage-delete failure can leave an orphan object (tolerated over a broken reference; a reconciliation sweep is possible future work). Full live-upload E2E needs hosted Storage.
- Security and privacy implications: see `docs/SECURITY.md` §9. No PII in keys/logs/audit; private bucket; three-layer authorization; consent explicit and revocable.
- Implementation reference: `supabase/migrations/20261021120000_candidate_cv.sql`, `supabase/storage/candidate-cvs.sql`, `src/lib/validation/cv.ts`, `src/server/actions/candidate-cv.ts`, `src/app/o/[orgSlug]/candidates/[candidateId]/cv/route.ts`, `src/components/forms/candidate-cv-card.tsx`, the create-form and detail-page wiring.
- Verification evidence: `tests/unit/cv-validation.test.ts`, `tests/unit/candidate-cv-actions.test.ts`, `tests/unit/candidate-cv-card.test.tsx`, `tests/db/candidate-cv.test.ts`; `pnpm check` + E2E green 2026-10-21 (`docs/DAILY_LOG.md`).
- Status: Implemented locally; hosted migration push and Storage bucket/policy creation await the owner's approval

### ADR-034 — Azure OpenAI integration: server-only client over the v1 Responses API

- Date: 2026-10-21
- Context / problem: Candidate Insights (ADR-035+, not implemented) needs an LLM. Azure AI Foundry is provisioned with a `gpt-5-mini` deployment and an OpenAI-compatible `/openai/v1/` endpoint. This phase wires and verifies only the transport, with no insights logic.
- Decision: use the official `openai` npm SDK's `OpenAI` client pointed at `<AZURE_OPENAI_ENDPOINT>/openai/v1/` with `apiKey = AZURE_OPENAI_API_KEY`, calling the Responses API (`responses.create`, `model = AZURE_OPENAI_DEPLOYMENT`). The client lives in `src/lib/ai/client.ts`, marked `server-only`; credentials are read through `getServerEnv()` (never `NEXT_PUBLIC_`), so the key cannot reach a client bundle (verified: 0 occurrences in `.next/static`). Errors, timeouts (60 s) and rate limits (SDK retries plus a typed `AiError` with safe messages) are handled; no key or request content is ever logged. A local script `pnpm ai:smoke` verifies connectivity with a synthetic prompt.
- Options considered: (a) `AzureOpenAI` client with the classic `deployments/…?api-version=` routing — a Microsoft Q&A reports issues against the v1 URL; (b) the standard `OpenAI` client with `baseURL` at the v1 endpoint — the pattern current Azure docs use, chosen. `AZURE_OPENAI_API_VERSION` is supported but optional (the v1 endpoint does not require it).
- Why this approach: one small, reusable, testable transport that matches Azure's current guidance; the `server-only` guard plus non-public env vars keep the key off the client; connectivity is provable locally without a public endpoint.
- Trade-offs / risks: the local smoke test (`ai:smoke`) needs the `--conditions=react-server` flag so the `server-only` marker resolves to its no-op under tsx; it is not run in CI (it would call the paid API). Provider data-processing/retention design is a later gate (ADR to come) before any candidate content is sent.
- Security and privacy implications: key server-only, never logged or bundled; the smoke prompt is synthetic; no candidate data flows yet.
- Implementation reference: `src/lib/ai/client.ts`, `scripts/ai/smoke.ts`, `src/lib/env.ts` (`AZURE_OPENAI_API_VERSION`), `tests/unit/ai-client.test.ts`.
- Verification evidence: `pnpm ai:smoke` returned the probe token from `gpt-5-mini` (~2 s); `pnpm test` 182/182; lint, typecheck, build pass; key absent from `.next/static` (`docs/DAILY_LOG.md`, 2026-10-21).
- Status: Implemented (integration only); Candidate Insights not implemented

### ADR-035 — Candidate Insights (Job Match): trigger, validated output contract, persisted lifecycle

- Date: 2026-10-21
- Context / problem: The owner approved the first AI workflow: when an application enters Screening, analyse the candidate's authorized CV against that job and give the recruiter an advisory, evidence-based assessment. ADR-013 and ADR-033 fix the guardrails (advisory only, no scoring, explicit consent that defaults to false and can be revoked). The transport exists (ADR-034). What was missing: where the trigger lives, what the model may return, and how a run is persisted so it is idempotent, auditable and tenant-isolated.
- Decision: (1) Trigger: `moveApplicationStageAction` reads the current stage first and, only for `new → screening`, queues an analysis after the stage update has committed; queueing can never fail the move. A manual Generate/Retry action queues the same work. Nothing is queued unless the candidate has a CV and `cv_ai_authorized = true`. (2) Contract A: a strict, versioned output schema `job-match-v1` (`src/lib/ai/insights-contract.ts`): summary, per-requirement assessments with status `supported | needs_verification | not_evidenced`, brief evidence, up to eight interview questions, and an advisory notice. The same shape is sent to the model as a strict JSON schema and re-validated with Zod before persisting; invalid output fails the run. `not_evidenced` is defined, in the prompt and in the UI, as "no evidence in the provided material", never "lacks". (3) Contract B: one row per attempt in `candidate_ai_insights` with states `pending → analyzing → ready | failed`, plus `revoked` and `superseded`; `application_id` (composite FK), `attempt_count`, `started_at`, `input_hash`, `cv_consent_at`, `prompt_version`, `model_version`, `contract_version` (migrations 0006/0007). A partial unique index allows one `pending`/`analyzing` row per application; the claim and the completion are conditional updates (`… WHERE status = 'pending'` / `'analyzing'`), so duplicates cannot run and a stale result cannot overwrite a newer state. The UI shows the latest row; older successes become `superseded`. (4) UI: a new application detail route (`/o/[orgSlug]/applications/[applicationId]`) hosts the Candidate Insights panel with loading, ready, failed/retry, revoked and authorization-required states; entry points from the Kanban card menu and the candidate's applications table.
- Options considered: (a) analyse inline in the stage-move request — rejected: couples a user-visible action to a 10–60 s model call and would block or fail the move; (b) key insights by (candidate, job) without an application link — rejected: no cascade on application removal and weaker tenant proof; (c) free-text model output — rejected: unverifiable, cannot enforce the three statuses or exclude scores.
- Why this approach: the owner's requirements map one-to-one onto database invariants that are provable in tests (index, conditional updates, composite FKs) rather than onto application discipline; the contract is small enough to render honestly and large enough to be useful; "build it like the last version" (ADR-028).
- Trade-offs / risks: the prompt budget truncates very long CVs (40k characters); the model's "requirements" are drawn from the job description as written, so a thin description yields thin assessments; the application page is a new surface to keep accessible and consistent (it shares the workspace tokens, StageBadge and card patterns).
- Security and privacy implications: see ADR-036 (execution) and ADR-037 (revocation). All reads/writes from the UI go through `requireOrgAccess` plus RLS; CV text exists only in memory during a run; only the validated structured result and a SHA-256 input hash are stored; logs carry ids, outcomes and sanitised error kinds. Provider retention is flagged, not assumed (`docs/AI_INSIGHTS.md` §2).
- Implementation reference: `docs/AI_INSIGHTS.md`; `supabase/migrations/20261021130000_insights_enum.sql`, `20261021140000_insights_lifecycle.sql`; `src/lib/ai/insights-contract.ts`, `job-match-prompt.ts`, `job-match.ts`; `src/server/insights/queue.ts`; `src/server/actions/insights.ts`, `applications.ts`; `src/server/data/insights.ts`; `src/components/insights/insights-panel.tsx`, `src/components/views/application-detail.tsx`; tests `tests/unit/insights-*.test.ts`, `job-match-prompt.test.ts`, `applications-trigger.test.ts`, `tests/db/insights.test.ts`.
- Verification evidence: `docs/DAILY_LOG.md` (2026-10-21, Candidate Insights) and `docs/TEST_PLAN.md` T36–T39.
- Status: Implemented locally; migrations 0006/0007 applied to the hosted project 2026-10-21 (approved push; history 7; schema fingerprint identical to local); live end-to-end with Azure pending the owner's run

### ADR-036 — Durable execution for AI runs: queued row + secret-authenticated runner endpoint

- Date: 2026-10-21
- Context / problem: A model call takes seconds to a minute and must survive the end of the HTTP request that queued it. A promise left running after a Server Action returns is not a durable job on a serverless or restarting host, and the owner explicitly asked not to assume it is.
- Decision: the durable unit is the `pending` row. Processing happens in `POST /api/insights/run` (Node runtime), authenticated by `INSIGHTS_RUNNER_SECRET` compared in constant time and answering 404 otherwise; the route is listed as public in `src/proxy.ts` because it has no session (it authenticates itself). The queueing action kicks the endpoint via `after()` for low latency; a scheduler (Azure App Service cron/WebJob or any HTTP scheduler) calls the same endpoint periodically to drain `pending` rows and to recover runs stuck in `analyzing` for more than ten minutes (marked `failed`, retryable). The runner uses the service-role client (no user session) and scopes every statement by `organization_id`; it re-checks CV authorization at claim time, immediately before the model call, and before persisting. Audit rows for runner outcomes are inserted directly with a null actor (ids only), since `log_audit_event()` requires `auth.uid()`.
- Options considered: (a) Postgres-backed queue extensions (pg_cron/pgmq on Supabase) — viable later, but adds hosted configuration that needs separate approval and still needs an HTTP worker on App Service; (b) Azure Functions/Service Bus — a second deployable and more secrets for the first customer; (c) `after()` only — rejected as the sole mechanism (not durable).
- Why this approach: no new infrastructure, a single documented endpoint any scheduler can call, invariants enforced in the database, and a clear upgrade path to a dedicated queue if volume grows.
- Trade-offs / risks: without `INSIGHTS_RUNNER_SECRET` configured, rows wait for a manual Retry or a scheduled call — documented, never silent (the UI shows the pending state); the shared secret is rotated like any credential; the stuck-run threshold (10 min) is a heuristic above the client timeout (60 s × up to 3 attempts).
- Security and privacy implications: the endpoint takes no tenant input beyond an optional insight id; a wrong or missing secret yields 404; the service role is confined to this runner and provisioning (`src/lib/supabase/admin.ts` comment updated); no CV content or key is ever logged.
- Implementation reference: `src/app/api/insights/run/route.ts`, `src/server/insights/runner.ts`, `src/server/insights/queue.ts` (`kickInsightsRunner`), `src/proxy.ts`, `src/lib/env.ts`, `.env.example`, `docs/DEPLOYMENT.md` (scheduler), `tests/unit/insights-runner.test.ts`, `tests/unit/insights-queue.test.ts`, `tests/db/insights.test.ts` (service-role privileges).
- Verification evidence: `docs/DAILY_LOG.md` (2026-10-21, Candidate Insights).
- Status: Implemented locally; scheduler configuration on the hosting side pending deployment

### ADR-037 — Withdrawn authorization invalidates insights and stops in-flight runs

- Date: 2026-10-21
- Context / problem: ADR-033 lets a recruiter revoke the candidate's AI authorization or delete the CV at any time. Insights derived from that CV must not survive, including a run that is executing at that moment.
- Decision: `revokeCandidateCvAiAction` and `deleteCandidateCvAction` call `invalidateCandidateInsights`, which marks every non-revoked insight of the candidate `revoked` and clears `result` and `summary` (rows are kept for auditability: ids, timestamps, attempt counts; an audit event `candidate.ai_insights_invalidated` records the reason and count). Consent is cleared before the invalidation. A running analysis is caught by three mechanisms: its authorization re-checks (before the model call and before persisting) now fail; its completion write is guarded by `status = 'analyzing'` so it affects zero rows once the row is `revoked`; and the UI explains that insights were removed and a new authorization is required. Deleting the candidate or the application cascades.
- Options considered: (a) hard-delete the rows — rejected: loses the audit trail of what was generated and when; (b) hide instead of clear — rejected: derived content would still exist in the database.
- Why this approach: "clear and keep" satisfies both the privacy requirement (no derived content remains) and the audit requirement, and it composes with the lifecycle guard from ADR-035 without a lock.
- Trade-offs / risks: a result persisted milliseconds before the revocation is cleared by the same invalidation (it covers `ready` rows), so there is no window in which content survives; the model call itself cannot be cancelled mid-flight, but its output is discarded.
- Security and privacy implications: invalidation runs through the user-scoped client inside the revoking action (RLS applies; tenant isolation proven in `tests/db/insights.test.ts`).
- Implementation reference: `src/server/insights/invalidate.ts`, `src/server/actions/candidate-cv.ts`, `src/server/insights/runner.ts` (re-checks and guarded write), `tests/unit/candidate-cv-actions.test.ts`, `tests/unit/insights-runner.test.ts`.
- Verification evidence: `docs/DAILY_LOG.md` (2026-10-21, Candidate Insights).
- Status: Implemented locally
