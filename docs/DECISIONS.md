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
- Trade-offs / risks: The admin must deliver the link out of band for the demo. Links expire (Supabase default 24 h); the action can regenerate.
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
