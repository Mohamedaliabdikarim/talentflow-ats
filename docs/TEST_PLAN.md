# TalentFlow ATS — Test Plan and Results

Evidence rule (spec §10): a test is marked **Verified** only with the command, environment, date and result recorded here or in `docs/DAILY_LOG.md`. Code existing is not evidence.

## 1. Strategy

| Layer                    | Tool                                               | Scope                                                                                        | Runs where                                 |
| ------------------------ | -------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Unit                     | Vitest (`pnpm test`)                               | Validation schemas, helpers, later components                                                | Local, CI                                  |
| Database / authorization | Vitest + embedded PostgreSQL 17 (`pnpm db:verify`) | Migrations apply cleanly; RLS positive and negative cases; constraints and triggers          | Local, CI                                  |
| End-to-end               | Playwright (`pnpm test:e2e`)                       | Real browser flows against the built app; authenticated flows need a hosted Supabase project | Local (Phase 3+), deployed smoke (Phase 5) |
| Build and bundle         | `pnpm build`, grep of `.next/static`               | Type-safe production build; no server-only secret names in client bundles                    | Local, CI                                  |
| Manual / accessibility   | Browser, keyboard, screen reader spot checks       | Focus order, reduced motion, contrast                                                        | Phase 3                                    |

## 2. Test inventory (mapped to spec §10)

| ID  | Case                                                                                            | Layer                 | Status             | Evidence                                                                           |
| --- | ----------------------------------------------------------------------------------------------- | --------------------- | ------------------ | ---------------------------------------------------------------------------------- |
| T01 | Admin creates a customer and another admin through authorized server-side flows                 | E2E + unit (guard)    | Planned            | —                                                                                  |
| T02 | Customer signs in and creates/edits a job                                                       | E2E                   | Planned            | —                                                                                  |
| T03 | Customer adds a candidate with a valid LinkedIn URL                                             | E2E + unit            | Unit part verified | `tests/unit/validation.test.ts` (LinkedIn/GitHub URL cases)                        |
| T04 | Candidate is associated with a job and appears in Kanban                                        | E2E                   | Planned            | —                                                                                  |
| T05 | Moving a candidate between stages persists after refresh                                        | E2E + DB              | DB part verified   | `tests/db/rls.test.ts` "updates stage_changed_at only when the stage changes"      |
| T06 | Job filter, name filter and combined filters work                                               | E2E + unit            | Unit part verified | `pipelineFiltersSchema` tests                                                      |
| T07 | Admin switches customer context and performs customer operations                                | E2E + DB              | DB part verified   | "platform admin … can create an organization and work inside any tenant"           |
| T08 | Customer A cannot read/update/delete Customer B's jobs, candidates, applications or insights    | DB (RLS)              | Verified locally   | "tenant read isolation", "tenant write isolation" (7 tests)                        |
| T09 | Non-admin cannot invoke account-provisioning operations                                         | DB + unit (guard)     | DB part verified   | "a member cannot create an organization", "cannot grant themselves platform admin" |
| T10 | Unauthenticated access to protected pages/APIs is denied                                        | Smoke + E2E           | Smoke verified     | Standalone probe: `/o/acme/pipeline?job=1` → 307 to `/login?next=…`                |
| T11 | Invalid URLs and malformed form inputs are handled safely                                       | Unit + DB constraints | Unit verified      | 48 unit tests; DB check constraints applied by migration                           |
| T12 | Azure environment and Supabase Auth redirects work in the deployed environment                  | Deployed smoke        | Planned            | —                                                                                  |
| T13 | Optional GitHub integration handles API errors and rate limits                                  | Unit (mocked)         | Planned (gated)    | —                                                                                  |
| T14 | Optional AI output has provenance, human-review disclosure and safe failure handling            | Unit + E2E            | Planned (gated)    | —                                                                                  |
| T15 | Cross-tenant links are impossible even without RLS (composite FKs, immutable `organization_id`) | DB                    | Verified locally   | "cross-tenant links are impossible at the database level" (3 tests)                |
| T16 | Audit events record `auth.uid()` as actor and cannot be written or read by members              | DB                    | Verified locally   | "audit events" (3 tests)                                                           |
| T17 | Service-role key name absent from client bundles                                                | Build                 | Verified locally   | `grep -rl SUPABASE_SERVICE_ROLE_KEY .next/static` → no match                       |
| T18 | Health endpoint for Azure probes                                                                | Smoke                 | Verified locally   | `GET /api/health` → 200 JSON                                                       |

## 3. Execution record

### 2026-10-19 — Phase 0 baseline (Windows 11, Node 22.16.0, pnpm 10.17.1)

| Command             | Result                                                                    | Notes                                                              |
| ------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `pnpm lint`         | Pass                                                                      | ESLint 9 with `eslint-config-next`                                 |
| `pnpm typecheck`    | Pass                                                                      | strict TypeScript 5.9                                              |
| `pnpm test`         | 48 passed / 48, 525 ms                                                    | Node environment                                                   |
| `pnpm db:verify`    | 22 passed / 22, 13.2 s                                                    | Embedded PostgreSQL 17; shim + 2 migrations applied                |
| `pnpm build`        | Pass                                                                      | Standalone output; routes `/`, `/_not-found`, `/api/health`, proxy |
| Standalone smoke    | health 200; root 200; protected 307 → login; `/login` 404 (not built yet) | `node .next/standalone/server.js` with placeholder public env      |
| `pnpm format:check` | Pass                                                                      |                                                                    |

RLS suite breakdown (22 tests): profiles 2 · tenant read isolation 4 · tenant write isolation 5 · cross-tenant links 3 · platform admin 3 · audit events 3 · application stage tracking 2.

### Not yet executed

- Playwright E2E (no browsers installed yet; authenticated flows need a hosted Supabase project).
- GitHub Actions CI (no remote yet).
- Migrations against hosted Supabase (needs project credentials and owner approval).
