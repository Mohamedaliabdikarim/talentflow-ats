# TalentFlow ATS — Supabase Integration

**Status (2026-10-19, updated):** Hosted project identified; MCP server connected read-only and verified; local CLI config created (`supabase/config.toml`, `supabase init`); migrations verified locally only; dry-run plan in `docs/HOSTED_MIGRATION_DRY_RUN.md`. **Nothing has been applied to the hosted project.** Applying requires the owner's explicit approval of the plan in §6.

## 1. Project identity

| Item         | Value                                                                                  |
| ------------ | -------------------------------------------------------------------------------------- |
| Project name | `talentflow-ats` (existing project, owner's account)                                   |
| Project ref  | `zcxmyaxpftzwpzvmhslm`                                                                 |
| URL          | `https://zcxmyaxpftzwpzvmhslm.supabase.co`                                             |
| Local config | `.env.local` (git-ignored) holds the URL; the keys are empty until the owner adds them |

Keys are read only from `.env.local` or Azure application settings. They are never printed, pasted into chat, logged or committed. `.env.example` documents the names.

### How the owner completes the local configuration

1. Supabase dashboard → Project Settings → API keys. Copy the **publishable** (or legacy anon) key into `NEXT_PUBLIC_SUPABASE_ANON_KEY` and the **secret** (or legacy service_role) key into `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.
2. For hosted migrations later: create a **scoped** personal access token (Account → Access Tokens) limited to this project with database write permission, and put it in `SUPABASE_ACCESS_TOKEN`; put the database password in `SUPABASE_DB_PASSWORD`; set `SUPABASE_PROJECT_REF=zcxmyaxpftzwpzvmhslm`.

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

**Verification (2026-10-19, after the owner completed OAuth):** `claude mcp list` → `✔ Connected`. Read-only calls made through a headless `claude -p` session restricted to those tools: `get_project_url` → `{"url":"https://zcxmyaxpftzwpzvmhslm.supabase.co"}`; `list_tables` (schema `public`) → `{"tables":[]}`; `list_migrations` → `{"migrations":[]}`. The project-scoped server exposes 13 tools and no project-name lookup (`get_project`/`list_projects` are account-level and absent), so the display name `talentflow-ats` is confirmed by the owner's instruction and the matching ref/URL, not by MCP. The read-only flag stays; the MCP server is **not** the mechanism for applying migrations.

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
| `20261019120100_rls_policies.sql`          | 5 helper functions, grants, RLS on all tables, 21 policies                                                | `anon` loses all table privileges (TalentFlow has no anonymous reads). `authenticated` keeps DML grants but every table has RLS. `platform_admins`, `audit_events` and `profiles` inserts/deletes are revoked from `authenticated`. Note for Supabase: `ALTER DEFAULT PRIVILEGES` on the project still grants future tables to `anon`; any later migration that creates a table must repeat the `revoke … from anon`. |
| `20261019130000_membership_activation.sql` | `activate_my_memberships()`                                                                               | `SECURITY DEFINER`, pinned search path, `auth.uid()` guard, updates only the caller's rows; `EXECUTE` revoked from `PUBLIC`.                                                                                                                                                                                                                                                                                          |

Ordering: timestamps 120000 → 120100 → 130000; 0002 depends on 0001 tables, 0003 depends on 0002 policies (it reads nothing new). The migrations are **not** idempotent (`create type`/`create table` without `if not exists`), by design: they must be applied exactly once by the CLI's migration tracker.

Security-definer inventory: `set_updated_at`, `prevent_organization_change`, `touch_stage_changed_at` (trigger functions, invoker rights), `sync_profile_from_auth_user` (definer, trigger only), `is_platform_admin`, `is_org_member`, `can_access_org`, `shares_organization_with`, `log_audit_event`, `activate_my_memberships` (definer, callable by `authenticated`; each only reads or writes rows tied to `auth.uid()` or returns a boolean about the caller).

## 6. Hosted migration plan — requires explicit approval

**Target:** project `zcxmyaxpftzwpzvmhslm` (`talentflow-ats`). The wrapper refuses to run if `NEXT_PUBLIC_SUPABASE_URL` does not match that ref.

**Preconditions (owner):** `.env.local` contains `SUPABASE_PROJECT_REF`, a scoped `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`. The hosted `public` schema is empty (verified via MCP `list_tables` after OAuth, or by the owner in the dashboard).

**Steps (each one reported with its output before the next):**

1. `pnpm supabase:hosted link` — links the CLI to the project (writes `supabase/.temp`, git-ignored).
2. `pnpm supabase:hosted list-remote` — confirms no remote migrations exist.
3. `pnpm supabase:hosted dry-run` — prints the three files that would be applied, nothing is executed.
4. **Stop. Owner approves the dry-run output.**
5. `pnpm supabase:hosted push` — applies 0001, 0002, 0003 in order under the CLI's migration history.
6. Verification: MCP `list_tables` (9 tables, RLS enabled), `get_advisors` security lint, `generate_typescript_types` diffed against `src/lib/supabase/database.types.ts`.
7. Dashboard settings the owner applies by hand (not expressible as SQL): Authentication → disable public sign-ups; email OTP expiry (controls invitation-link lifetime, default 3600 s); Site URL and redirect URLs (`http://localhost:3000/auth/confirm` now, Azure URL later); minimum password length 10.

**Rollback:** no customer data exists yet. If a step fails midway, the fix is a compensating migration applied through the same path, or, since the schema is empty, `drop schema public cascade; create schema public;` run by the owner in the SQL editor followed by `supabase migration repair` and a fresh push. Either option needs approval at that time.

**Explicitly not done without approval:** applying migrations by any tool, creating hosted users (`pnpm bootstrap:admin`), switching the MCP server to read-write, deploying.

## 7. Bootstrap of the first platform admin (after migrations)

`pnpm bootstrap:admin --email <admin-email> --name "<name>" --project-ref zcxmyaxpftzwpzvmhslm` creates the auth user with the service-role key from `.env.local`, inserts the `platform_admins` row, writes an `admin.bootstrapped` audit row, and prints the one-time invitation link **once** to the operator's terminal. The operator opens it (or shares it privately), sets a password, and lands on `/admin`. This creates a hosted user, so it waits for approval.

## 8. Invitation links — operational limitations (approved MVP design)

- Links are created by `auth.admin.generateLink` and rebuilt as `/auth/confirm?token_hash=…&type=invite|magiclink&next=…`; the route calls `verifyOtp`, so links work even though they were generated server-side (the PKCE `action_link` would not).
- A link is single-use and expires after the project's email OTP lifetime (default one hour, configurable up to 24 h). An expired link shows a generic message on the login page; the admin generates a new one from the organization page.
- Links are shown once in the admin UI and copied by the admin; they are not emailed (Supabase's default mailer only delivers to project team members without custom SMTP), not stored, and not logged. Audit rows record user ids and roles only; `redactInviteUrl()` exists for any future log line that might contain a URL.
- Anyone holding a fresh link can claim the account, so the admin must send it through a private channel.
- Existing accounts invited to another organization receive a magic link and become active members immediately (they already have a password).
- There is no email delivery; if the owner configures custom SMTP later, the same action can send the link.
