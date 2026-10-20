# TalentFlow ATS — Supabase Integration

**Status (2026-10-19, night):** Hosted project identified and confirmed (`talentflow-ats`); MCP connected read-only and verified; CLI linked through the Supavisor pooler. **Migrations 0001–0003 applied** on 2026-10-19 and **migration 0004 (privilege hardening) applied on 2026-10-20**, each with `pnpm supabase:hosted push` run once after the owner's explicit approval and verified read-only afterwards (history, tables, RLS, privileges, advisors, schema fingerprint identical to local). Findings and the hardening: §6a/§6b, `docs/PRIVILEGE_HARDENING_REVIEW.md`. Still **not done** (separate approvals): first platform admin, hosted Authentication settings, deployment. Verbatim outputs: `docs/DAILY_LOG.md`.

## 1. Project identity

| Item         | Value                                                                                                                                                                                                                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project name | `talentflow-ats` (existing project, owner's account)                                                                                                                                                                                                                                                |
| Project ref  | `zcxmyaxpftzwpzvmhslm`                                                                                                                                                                                                                                                                              |
| URL          | `https://zcxmyaxpftzwpzvmhslm.supabase.co`                                                                                                                                                                                                                                                          |
| Local config | `.env.local` (git-ignored): URL, project ref and publishable key are set (the key was fetched through the read-only MCP tool and piped into the file without being displayed); the secret key, access token and database password are added by the owner with `pnpm env:set <NAME>` (hidden prompt) |

Keys are read only from `.env.local` or Azure application settings. They are never printed, pasted into chat, logged or committed. `.env.example` documents the names.

### How the owner completes the local configuration

Use `pnpm env:set <NAME>` for every secret: it reads the value at a hidden prompt, writes only `.env.local`, and prints the character count. `pnpm env:check` lists names without values.

1. `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API keys, secret key): needed only for `pnpm bootstrap:admin`, not for the migration dry-run.
2. `SUPABASE_ACCESS_TOKEN`: a scoped personal access token with **Project Settings, API Keys and API Key Secrets at Read** (verified requirement of `supabase link`, see `docs/HOSTED_MIGRATION_DRY_RUN.md` §3). `SUPABASE_DB_PASSWORD`: the database password, used by the direct connection of `migration list` and `db push`. The project ref and publishable key are already set.

The Supabase CLI on this machine is not logged in, so no key could be fetched programmatically. That is intentional: a browser login would create a classic full-account token.

## 2. MCP server (read-only)

Registered with the exact command requested:

```
claude mcp add --scope project --transport http supabase "https://mcp.supabase.com/mcp?project_ref=zcxmyaxpftzwpzvmhslm&read_only=true&features=docs%2Caccount%2Cdatabase%2Cdebugging%2Cdevelopment%2Cfunctions%2Cbranching"
```

Result: `.mcp.json` at the repository root (committed; it contains no secrets). `claude mcp list` reports the server as **pending approval**. The OAuth flow cannot run in a non-interactive session.

**Owner steps to finish the connection (no tokens are typed anywhere):**

1. Open a terminal in `C:\Users\moi-a\Desktop\talentflow-ats` and run `claude`.
2. When prompted to use the project MCP server `supabase` from `.mcp.json`, choose **Yes**.
3. Type `/mcp`, select `supabase`, choose **Authenticate**. A browser window opens on supabase.com; sign in and approve access for the organization that owns `talentflow-ats`.
4. Back in the terminal the server shows as connected. Start a new session (or `/mcp` → reconnect) so the tools load.

**Verification (2026-10-19, after the owner completed OAuth):** `claude mcp list` → `✔ Connected`. Read-only calls made through a headless `claude -p` session restricted to those tools: `get_project_url` → `{"url":"https://zcxmyaxpftzwpzvmhslm.supabase.co"}`; `list_tables` (schema `public`) → `{"tables":[]}`; `list_migrations` → `{"migrations":[]}`. The project-scoped server exposes 13 tools and no project-name lookup (`get_project`/`list_projects` are account-level and absent), so the display name was first confirmed only by the owner's instruction and the matching ref/URL; on 2026-10-19 `supabase link` stored the project metadata locally (`supabase/.temp/linked-project.json`, git-ignored) with `name: talentflow-ats`, which confirms it. The read-only flag stays; the MCP server is **not** the mechanism for applying migrations.

## 3. Supabase agent skills

Installed from `github.com/supabase/agent-skills` with `npx skills add supabase/agent-skills --skill supabase --skill supabase-postgres-best-practices --agent claude-code --yes` after cloning and reading the repository: both skills are Markdown instructions only (no scripts, no executables).

| Skill                              | Version | Installed to                                       | Why relevant                                                                                                                                                    |
| ---------------------------------- | ------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase`                         | 0.1.2   | `.claude/skills/supabase/`                         | Auth/SSR patterns, security checklist (service-role exposure, `SECURITY DEFINER`, UPDATE needs SELECT policy), CLI and MCP guidance, documentation lookup order |
| `supabase-postgres-best-practices` | 1.1.1   | `.claude/skills/supabase-postgres-best-practices/` | RLS performance, indexes, constraints, locking, migrations                                                                                                      |

The installer also wrote `skills-lock.json`. Changes were reviewed with `git status` before the commit.

Applied from the security checklist to the existing migrations: `SECURITY DEFINER` functions live in `public` (exposed) but have `EXECUTE` revoked from `PUBLIC` and granted only to `authenticated`/`service_role`, pin `search_path = ''`, and only act on the caller's own rows (`auth.uid()`). `supabase db advisors` (or the MCP `get_advisors`) is scheduled after the hosted apply.

## 4. Local verification (no hosted access needed)

- `pnpm db:verify`: embedded PostgreSQL 17 + `scripts/db/local-auth-shim.sql` + all migrations, then `tests/db/*.test.ts`.
- `pnpm db:types`: regenerates `src/lib/supabase/database.types.ts` from the migrations (custom generator in `scripts/db/gen-types.ts`, because `supabase gen types --db-url` exits without output on this machine). After the hosted apply, MCP `generate_typescript_types` output will be diffed against this file.

## 5. Pre-apply review of the migrations

Reviewed on 2026-10-19 before proposing the hosted apply:

| File                                       | Content                                                                                                   | Review notes                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20261019120000_initial_schema.sql`        | 6 enums, 9 tables, indexes, `updated_at` and tenant-lock triggers, `auth.users` → `profiles` sync trigger | Depends on `auth.users` and `gen_random_uuid()` (built in on PG13+). Trigger on `auth.users` is the documented Supabase pattern; the function is `SECURITY DEFINER` with `search_path = ''`. Composite FKs reference `(id, organization_id)` unique constraints created in the same file.                                                                                                                             |
| `20261019120100_rls_policies.sql`          | 5 helper functions, grants, RLS on all tables, 16 policies                                                | `anon` loses all table privileges (TalentFlow has no anonymous reads). `authenticated` keeps DML grants but every table has RLS. `platform_admins`, `audit_events` and `profiles` inserts/deletes are revoked from `authenticated`. Note for Supabase: `ALTER DEFAULT PRIVILEGES` on the project still grants future tables to `anon`; any later migration that creates a table must repeat the `revoke … from anon`. |
| `20261019130000_membership_activation.sql` | `activate_my_memberships()`                                                                               | `SECURITY DEFINER`, pinned search path, `auth.uid()` guard, updates only the caller's rows; `EXECUTE` revoked from `PUBLIC`.                                                                                                                                                                                                                                                                                          |

Ordering: timestamps 120000 → 120100 → 130000; 0002 depends on 0001 tables, 0003 depends on 0002 policies (it reads nothing new). The migrations are **not** idempotent (`create type`/`create table` without `if not exists`), by design: they must be applied exactly once by the CLI's migration tracker.

Security-definer inventory: `set_updated_at`, `prevent_organization_change`, `touch_stage_changed_at` (trigger functions, invoker rights), `sync_profile_from_auth_user` (definer, trigger only), `is_platform_admin`, `is_org_member`, `can_access_org`, `shares_organization_with`, `log_audit_event`, `activate_my_memberships` (definer, callable by `authenticated`; each only reads or writes rows tied to `auth.uid()` or returns a boolean about the caller).

## 6. Hosted migration plan — executed 2026-10-19 with explicit approval (kept for the record)

**Target:** project `zcxmyaxpftzwpzvmhslm` (`talentflow-ats`). The wrapper refuses to run if `NEXT_PUBLIC_SUPABASE_URL` does not match that ref.

**Preconditions (owner):** `.env.local` contains `SUPABASE_PROJECT_REF`, a scoped `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`. The hosted `public` schema is empty (verified via MCP `list_tables` after OAuth, or by the owner in the dashboard).

**Steps (each one reported with its output before the next):**

1. `pnpm supabase:hosted link` — links the CLI to the project (writes `supabase/.temp`, git-ignored).
2. `pnpm supabase:hosted list-remote` — confirms no remote migrations exist.
3. `pnpm supabase:hosted dry-run` — prints the three files that would be applied, nothing is executed.
4. **Stop. Owner approves the dry-run output.**
5. `pnpm supabase:hosted push` — applies 0001, 0002, 0003 in order under the CLI's migration history. **Done 2026-10-19 (exit 0).**
6. Verification: MCP `list_tables` (9 tables, RLS enabled), `get_advisors`, schema fingerprint (`scripts/db/schema-fingerprint.sql`, hosted vs `pnpm db:fingerprint`). **Done; see §6a.**
7. Dashboard settings the owner applies by hand (not expressible as SQL): Authentication → disable public sign-ups; email OTP expiry (controls invitation-link lifetime, default 3600 s); Site URL and redirect URLs (`http://localhost:3000/auth/confirm` now, Azure URL later); minimum password length 10.

**Rollback:** no customer data exists yet. If a step fails midway, the fix is a compensating migration applied through the same path, or, since the schema is empty, `drop schema public cascade; create schema public;` run by the owner in the SQL editor followed by `supabase migration repair` and a fresh push. Either option needs approval at that time.

**Explicitly not done without approval:** applying migrations by any tool, creating hosted users (`pnpm bootstrap:admin`), switching the MCP server to read-write, deploying.

## 6a. Verification results (2026-10-19, read-only)

| Check               | Result                                                                                                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Migration history   | `migration list`: local = remote for `20261019120000`, `20261019120100`, `20261019130000`; MCP `list_migrations` agrees                                                                                                        |
| Tables and RLS      | 9 tables in `public`, every one `rls_enabled: true`, all empty                                                                                                                                                                 |
| Schema differences  | fingerprint `227fed80180eced8183d19d5634a8ee0` on the hosted project and on the local embedded database (215 objects, 82 columns, 16 policies, 10 functions, 13 triggers, 2 auth triggers, 9 RLS tables): **no difference**    |
| Security advisor    | 0 ERROR; WARN for SECURITY DEFINER functions executable by API roles (our five helpers + `activate_my_memberships`: intended; `sync_profile_from_auth_user`: trigger function, revoke proposed; `rls_auto_enable`: Supabase's) |
| Performance advisor | INFO only (14 unindexed foreign keys, 9 unused indexes on an empty database)                                                                                                                                                   |
| Grants              | `anon`: nothing. `authenticated`: designed DML plus `TRUNCATE`, `REFERENCES`, `TRIGGER` from Supabase's default privileges (not present locally). `service_role`: all                                                          |

## 6b. Migration 0004 — privilege hardening (approved and applied 2026-10-20)

File: `supabase/migrations/20261019140000_privilege_hardening.sql` (reviewed in `supabase/proposed/`, moved unchanged after approval). It revokes `TRUNCATE`, `REFERENCES`, `TRIGGER`, `MAINTAIN` from `authenticated` on all public tables, removes Supabase's per-schema default table privileges for `anon`, `authenticated` and `service_role` (new tables then start with no API-role privileges, as locally), restricts `sync_profile_from_auth_user()` to its owner and `supabase_auth_admin`, and revokes API-role EXECUTE on `rls_auto_enable()` (owned by `postgres` here; guarded). Full review with evidence and risks: `docs/PRIVILEGE_HARDENING_REVIEW.md`. Verified locally by `tests/db/privilege-hardening.test.ts` (T30, 10 cases) and by the whole suite in hosted-like mode (`TALENTFLOW_DB_HOSTED_LIKE=1 pnpm db:verify`, 41/41). Applied 2026-10-20 following exactly that path (dry-run showed only this file; push exit 0); the re-measured privileges, defaults, triggers and advisors match the local expectations (`docs/DAILY_LOG.md`).

## 7. Bootstrap of the first platform admin (after migrations)

`pnpm bootstrap:admin --email <admin-email> --name "<name>" --project-ref zcxmyaxpftzwpzvmhslm` is a **dry run** (reads only: existing admins and users). With `--apply` it creates the auth user with the service-role key from `.env.local`, upserts the `platform_admins` row, writes an `admin.bootstrapped` audit row (ids only), and prints the one-time link **once**, or writes it to `--link-file <path>` (mode 0600) while logging a redacted form. It refuses when another admin exists (`--allow-existing` overrides); an existing account gets a magic link; both link types end on `/auth/set-password`. The operator opens the link with the app running on `NEXT_PUBLIC_APP_URL`, sets a password and lands on `/admin`. Full plan, exact row changes, rollback and the approval checklist: `docs/BOOTSTRAP_ADMIN_PLAN.md`. Creating the hosted user waits for approval; `pnpm env:check bootstrap` lists the required variables by name.

## 8. Invitation links — operational limitations (approved MVP design)

- Links are created by `auth.admin.generateLink` and rebuilt as `/auth/confirm?token_hash=…&type=invite|magiclink&next=…`; the route calls `verifyOtp`, so links work even though they were generated server-side (the PKCE `action_link` would not).
- A link is single-use and expires after the project's email OTP lifetime (default one hour, configurable up to 24 h). An expired link shows a generic message on the login page; the admin generates a new one from the organization page.
- Links are shown once in the admin UI and copied by the admin; they are not emailed (Supabase's default mailer only delivers to project team members without custom SMTP), not stored, and not logged. Audit rows record user ids and roles only; `redactInviteUrl()` exists for any future log line that might contain a URL.
- Anyone holding a fresh link can claim the account, so the admin must send it through a private channel.
- Existing accounts invited to another organization receive a magic link and become active members immediately (they already have a password).
- There is no email delivery; if the owner configures custom SMTP later, the same action can send the link.
