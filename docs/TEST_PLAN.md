# TalentFlow ATS — Test Plan and Results

Evidence rule (spec §10): a test is marked **Verified** only with the command, environment, date and result recorded here or in `docs/DAILY_LOG.md`. Code existing is not evidence. "Verified locally" means on embedded PostgreSQL or the local standalone build, not on the hosted Supabase project.

## 1. Strategy

| Layer                    | Tool                                                                   | Scope                                                                                                              | Runs where                                      |
| ------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| Unit                     | Vitest (`pnpm test`)                                                   | Validation schemas, invite links, landing logic, auth guards and provisioning actions with mocked Supabase clients | Local, CI                                       |
| Database / authorization | Vitest + embedded PostgreSQL 17 (`pnpm db:verify`)                     | Migrations apply cleanly; RLS positive and negative cases; constraints, triggers, definer functions                | Local, CI                                       |
| End-to-end               | Playwright (`pnpm test:e2e`)                                           | Real browser (desktop + mobile Chromium) against the standalone build; smoke suite needs no Supabase project       | Local, CI                                       |
| Build and bundle         | `pnpm build`, grep of `.next/static`                                   | Type-safe production build; no server-only secret names in client bundles                                          | Local, CI                                       |
| Hosted                   | Supabase CLI dry-run/push, MCP advisors, Playwright with real accounts | Migrations on the hosted project, auth flows end to end                                                            | Approval-gated (Phase 1 hosted step, Phase 4/5) |
| Manual / accessibility   | Browser, keyboard, screen reader spot checks                           | Focus order, reduced motion, contrast                                                                              | Phase 3                                         |

## 2. Test inventory (mapped to spec §10)

| ID  | Case                                                                                                                                 | Layer                 | Status                                                          | Evidence                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T01 | Admin creates a customer and another admin through authorized server-side flows                                                      | Unit (actions) + E2E  | Unit verified locally                                           | `tests/unit/admin-actions.test.ts`: admin path inserts via service role, audits, redirects; non-admin never reaches the service role                                            |
| T02 | Customer signs in and creates/edits a job                                                                                            | Unit (actions) + E2E  | Action layer verified locally; browser flow pending hosted auth | `tests/unit/workspace-actions.test.ts` (tenant pinning, validation, redirect)                                                                                                   |
| T03 | Customer adds a candidate with a valid LinkedIn URL                                                                                  | E2E + unit            | Unit part verified                                              | `tests/unit/validation.test.ts` (LinkedIn/GitHub URL cases, null form fields)                                                                                                   |
| T04 | Candidate is associated with a job and appears in Kanban                                                                             | Unit + DB + E2E       | Unit and DB verified locally; browser pending                   | `addToPipelineAction` tests; DB "a member sees only their tenant's applications on the board"                                                                                   |
| T05 | Moving a candidate between stages persists after refresh                                                                             | DB + unit + E2E       | DB and action verified locally; browser pending                 | `tests/db/pipeline.test.ts` "persist across requests and update stage_changed_at"; `moveApplicationStageAction` tests                                                           |
| T06 | Job filter, name filter and combined filters work                                                                                    | Unit + DB + E2E       | Unit and DB verified locally; browser pending                   | `parsePipelineFilters`/`escapeLikePattern` tests; DB "job filter and name filter combine", "never returns the other tenant's namesake"                                          |
| T07 | Admin switches customer context and performs customer operations                                                                     | E2E + DB + unit       | DB, guard and board parts verified locally                      | RLS "platform admin …"; `tests/unit/auth-guards.test.ts`; `tests/unit/kanban-board.test.tsx` (menu move, optimistic placement, revert)                                          |
| T08 | Customer A cannot read/update/delete Customer B's jobs, candidates, applications or insights                                         | DB (RLS)              | Verified locally                                                | "tenant read isolation", "tenant write isolation" (9 tests)                                                                                                                     |
| T09 | Non-admin cannot invoke account-provisioning operations                                                                              | DB + unit             | Verified locally                                                | DB: "cannot create an organization", "cannot grant themselves platform admin"; unit: three provisioning actions return an authorization error without touching the service role |
| T10 | Unauthenticated access to protected pages/APIs is denied                                                                             | E2E                   | Verified locally (E2E)                                          | `tests/e2e/smoke.spec.ts` "protected routes redirect signed-out visitors to login with a return path" (desktop + mobile)                                                        |
| T11 | Invalid URLs and malformed form inputs are handled safely                                                                            | Unit + DB constraints | Unit verified                                                   | 56 validation assertions; DB check constraints applied by migration                                                                                                             |
| T12 | Azure environment and Supabase Auth redirects work in the deployed environment                                                       | Deployed smoke        | Planned                                                         | —                                                                                                                                                                               |
| T13 | Optional GitHub integration handles API errors and rate limits                                                                       | Unit (mocked)         | Planned (gated)                                                 | —                                                                                                                                                                               |
| T14 | Optional AI output has provenance, human-review disclosure and safe failure handling                                                 | Unit + E2E            | Planned (gated)                                                 | —                                                                                                                                                                               |
| T15 | Cross-tenant links are impossible even without RLS (composite FKs, immutable `organization_id`)                                      | DB                    | Verified locally                                                | "cross-tenant links are impossible at the database level" (3 tests)                                                                                                             |
| T16 | Audit events record `auth.uid()` as actor and cannot be written or read by members; audit metadata never contains emails or tokens   | DB + unit             | Verified locally                                                | DB "audit events" (3 tests); unit: invite audit call contains neither the email nor the token                                                                                   |
| T17 | Service-role key name absent from client bundles                                                                                     | Build                 | Verified locally                                                | `grep -rl SUPABASE_SERVICE_ROLE_KEY .next/static` → no match (also in CI)                                                                                                       |
| T18 | Health endpoint for Azure probes                                                                                                     | E2E                   | Verified locally (E2E)                                          | "health endpoint responds"                                                                                                                                                      |
| T19 | Invited user activates only their own memberships; anonymous callers rejected                                                        | DB                    | Verified locally                                                | `tests/db/membership-activation.test.ts` (3 tests)                                                                                                                              |
| T20 | Invitation confirm route rejects missing/invalid tokens with a generic message                                                       | E2E                   | Verified locally (E2E)                                          | "confirm route rejects a missing token with a generic message"                                                                                                                  |
| T21 | Login page: labelled fields, skip link first in tab order, no framework header; no axe-core WCAG 2.x A/AA violations on public pages | E2E                   | Verified locally (E2E)                                          | `tests/e2e/smoke.spec.ts`, `tests/e2e/accessibility.spec.ts` (4 checks, chromium + mobile)                                                                                      |
| T22 | Open-redirect guard on `?next=`                                                                                                      | Unit                  | Verified                                                        | `safeRedirectPath` cases                                                                                                                                                        |
| T23 | Hosted migrations apply in order; advisors clean; types match                                                                        | Hosted                | Planned (approval-gated)                                        | `docs/SUPABASE_INTEGRATION.md` §6                                                                                                                                               |
| T25 | Workspace writes pin `organization_id` from the URL context; forged form ids are ignored                                             | Unit                  | Verified                                                        | `tests/unit/workspace-actions.test.ts` "tenant pinning"                                                                                                                         |
| T26 | Cross-tenant stage move affects 0 rows; job delete cascades applications and keeps candidates                                        | DB                    | Verified locally                                                | `tests/db/pipeline.test.ts`                                                                                                                                                     |
| T24 | Invitation flow end to end on the hosted project (invite → confirm → set password → membership active)                               | Hosted E2E            | Planned (approval-gated: creates users)                         | —                                                                                                                                                                               |

## 3. Execution record

### 2026-10-19 — Phase 0 baseline (Windows 11, Node 22.16.0, pnpm 10.17.1)

| Command             | Result                                      | Notes                                                              |
| ------------------- | ------------------------------------------- | ------------------------------------------------------------------ |
| `pnpm lint`         | Pass                                        | ESLint 9 with `eslint-config-next`                                 |
| `pnpm typecheck`    | Pass                                        | strict TypeScript 5.9                                              |
| `pnpm test`         | 48 passed / 48                              | Node environment                                                   |
| `pnpm db:verify`    | 22 passed / 22                              | Embedded PostgreSQL 17; shim + 2 migrations applied                |
| `pnpm build`        | Pass                                        | Standalone output; routes `/`, `/_not-found`, `/api/health`, proxy |
| Standalone smoke    | health 200; root 200; protected 307 → login | `node .next/standalone/server.js` with placeholder public env      |
| `pnpm format:check` | Pass                                        |                                                                    |

### 2026-10-19 — Phase 1 local verification (same machine)

| Command                                           | Result                                      | Notes                                                                          |
| ------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------ |
| `pnpm lint`                                       | Pass                                        |                                                                                |
| `pnpm typecheck`                                  | Pass                                        | Typed Supabase client across the data layer                                    |
| `pnpm test`                                       | 74 passed / 74 (4 files)                    | validation, invite/landing, auth guards, admin actions                         |
| `pnpm db:verify` (run twice)                      | 25 passed / 25 both runs                    | 3 migrations applied; order independence confirmed after scoping assertions    |
| `pnpm build`                                      | Pass                                        | 15 routes, all dynamic except `/_not-found`; proxy registered                  |
| `pnpm test:e2e`                                   | 10 passed / 10 (5 tests × chromium, mobile) | Against `pnpm start` with placeholder public env; 14.7 s                       |
| GitHub Actions run #1 (commit `1a52dca`)          | Failed at `pnpm typecheck`                  | `LayoutProps` global absent on a clean checkout; fixed (explicit prop type)    |
| GitHub Actions run 39292371082 (commit `02980df`) | Success, 1m31s                              | Clean Ubuntu checkout: all steps green, including db:verify and Playwright E2E |

Unit count note: 73 before and 74 after the pending-invite refinement in `inviteUserAction`.

### 2026-10-19 — Phase 2 local verification (same machine)

| Command                                           | Result                   | Notes                                          |
| ------------------------------------------------- | ------------------------ | ---------------------------------------------- |
| `pnpm lint` / `pnpm typecheck`                    | Pass                     | React Compiler purity rule enforced            |
| `pnpm test`                                       | 89 passed / 89 (6 files) | adds pipeline helpers and workspace actions    |
| `pnpm db:verify`                                  | 31 passed / 31 (3 files) | adds `tests/db/pipeline.test.ts`               |
| `pnpm build`                                      | Pass                     | jobs, candidates, pipeline routes, all dynamic |
| `pnpm test:e2e`                                   | 10 passed / 10           | smoke suite unchanged                          |
| GitHub Actions run 39296039441 (commit `af3e19b`) | Success, 1m35s           | Clean Ubuntu checkout: all steps green         |

### 2026-10-19 — MCP verification and Phase 3a (same machine)

| Command / call                                      | Result                                               | Notes                                                                         |
| --------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------- |
| `claude mcp list`                                   | `supabase … ✔ Connected`                             | after the owner's OAuth                                                       |
| MCP `get_project_url` (read-only, headless session) | `{"url":"https://zcxmyaxpftzwpzvmhslm.supabase.co"}` | project ref confirmed                                                         |
| MCP `list_tables` public / `list_migrations`        | `[]` / `[]`                                          | hosted schema untouched                                                       |
| `pnpm test`                                         | 92 passed / 92 (7 files)                             | adds the Kanban component test                                                |
| `pnpm build`                                        | Pass                                                 |                                                                               |
| `pnpm test:e2e`                                     | 14 passed / 14                                       | 10 smoke + 4 axe accessibility checks                                         |
| GitHub Actions run 39302083064 (commit `62bbdbd`)   | Success                                              | Clean Ubuntu checkout: all steps green, including db:verify (31) and E2E (14) |

### 2026-10-19 — Phase 3b (same machine)

| Command / call                                                | Result                                                            | Notes                                     |
| ------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------- |
| MCP `search_docs` (read-only, headless session)               | CLI reference pages for link / db push / migration list retrieved | used for the dry-run plan validation      |
| MCP `get_publishable_keys` (read-only, piped)                 | publishable key written to `.env.local` without display           | `pnpm env:check` shows names/lengths only |
| `SCREENSHOTS=1 playwright test tests/e2e/screenshots.spec.ts` | 3 passed (375/768/1440 px), no horizontal overflow                | images in `docs/screenshots/`             |
| `pnpm test:e2e`                                               | 14 passed / 14 (screenshot tests skipped by default)              |                                           |
| GitHub Actions run 39305014544 (commit `b3f4df3`)             | Success                                                           | all steps green                           |

### Not yet executed

- Anything against the hosted Supabase project (migrations, users, auth flows): awaiting approval.
- Deployed smoke tests: no Azure resources yet.
