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
