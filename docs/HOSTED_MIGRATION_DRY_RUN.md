# Hosted migration dry-run plan — for owner review (v4)

**Status:** 2026-10-19, v4. All three preparatory steps are done and verified: `link` (exit 0), `list-remote` via the pooler (three local versions, remote empty), `dry-run` via the pooler (exactly the three migrations would be applied; seeds and roles empty). A read-only MCP post-check shows the hosted schema still empty. **The push itself has not been run and needs a separate approval.** Verbatim outputs: `docs/DAILY_LOG.md`.

## 1. Target and verified starting state

| Item               | Value                                                                   | How verified                                                                             |
| ------------------ | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Project ref        | `zcxmyaxpftzwpzvmhslm`                                                  | Owner instruction; `SUPABASE_PROJECT_REF` and `NEXT_PUBLIC_SUPABASE_URL` in `.env.local` |
| Project URL        | `https://zcxmyaxpftzwpzvmhslm.supabase.co`                              | MCP `get_project_url` (read-only), 2026-10-19                                            |
| Public tables      | none                                                                    | MCP `list_tables` for schema `public` → `{"tables":[]}`                                  |
| Applied migrations | none                                                                    | MCP `list_migrations` → `{"migrations":[]}`                                              |
| MCP mode           | read-only (`read_only=true` in `.mcp.json`)                             | `claude mcp list` → Connected                                                            |
| Local CLI config   | `supabase/config.toml` (`project_id = "talentflow-ats"`, PostgreSQL 17) | created with `supabase init`, committed                                                  |

Guard in `scripts/db/hosted.mjs`: every subcommand refuses to run unless `NEXT_PUBLIC_SUPABASE_URL` contains `<SUPABASE_PROJECT_REF>.supabase.co`, so a mistyped ref cannot point the CLI at another project.

## 2. What the dry-run would report (and what the later push would apply)

| Order | File                                                           | Objects                                                                                              |
| ----- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1     | `supabase/migrations/20261019120000_initial_schema.sql`        | 6 enums, 9 tables, 9 indexes, 3 trigger helpers, 13 triggers, `auth.users` → `profiles` sync trigger |
| 2     | `supabase/migrations/20261019120100_rls_policies.sql`          | 5 helper functions, grants/revokes, RLS on 9 tables, 21 policies                                     |
| 3     | `supabase/migrations/20261019130000_membership_activation.sql` | `activate_my_memberships()`                                                                          |

All three apply cleanly on PostgreSQL 17 locally and in CI (`pnpm db:verify`, 31 tests). Review notes: `docs/SUPABASE_INTEGRATION.md` §5.

## 3. Validated CLI requirements (independent check, 2026-10-19)

Sources: the official _Personal Access Tokens_ page (fetched directly) and the CLI reference pages for `link`, `db push` and `migration list` (retrieved through the read-only MCP `search_docs` tool). Installed CLI: 2.121.0.

| Command                               | Authenticates with                                                                | Verified statement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase link --project-ref …`       | Personal access token (Management API) **and**, optionally, the database password | "`supabase link` needs **Project Settings**, **API Keys**, and **API Key Secrets**, all with **Read** access." "PostgREST configurations are fetched from the Supabase platform and validated against your local configuration file. Optionally, database settings can be validated if you provide a password. Your database password is saved in native credentials storage if available." "If you do not want to be prompted for the database password, such as in a CI environment, you may specify it explicitly via the `SUPABASE_DB_PASSWORD` environment variable." |
| `supabase migration list --linked`    | Database password (direct Postgres connection)                                    | "Requires your local project to be linked." Remote history is read from `supabase_migrations.schema_migrations`. "Database commands using your database password aren't limited by the token's permissions."                                                                                                                                                                                                                                                                                                                                                               |
| `supabase db push --dry-run --linked` | Database password (direct Postgres connection)                                    | "Use the `--dry-run` flag to view the list of changes before applying." "The first time this command is run, a migration history table will be created under `supabase_migrations.schema_migrations`" — this happens on a real push, not on a dry-run (CLI help: "Print the migrations that would be applied, but don't actually apply them").                                                                                                                                                                                                                             |

Consequences for the token:

- The documented read-only MCP permissions (Database Read, Migrations Read, Project Settings Read, API Keys Read) are **not** the set `link` needs: `link` additionally requires **API Key Secrets (Read)**. `Projects (account-wide)` and `Migrations` permissions are **not** required for link, list or dry-run.
- **Found in practice (2026-10-19):** on an IPv4-only network the CLI must use the Supavisor pooler, and `link` can only store that route if the token also has **Connection Pooling (Read)** (endpoint "Get pooler config"). With only the three documented permissions, `link` exits 0 but `migration list` then fails with `DbConfigIpv6Error`. Fallback without a new token: `SUPABASE_POOLER_HOST` makes the wrapper pass an explicit session-mode pooler URL (`--db-url`), see §5a.
- `migration list` and `db push --dry-run` do not use the token at all; they use the database password over a direct connection. The token is only needed by `link`.
- The CLI reads `SUPABASE_ACCESS_TOKEN` from the environment, which "takes precedence over any saved token". Scoped tokens start with `sbp_fc`; the browser flow of `supabase login` "creates a classic token" with full account access and is therefore not used here. The docs note that scoped tokens are "rolling out gradually"; if the permission picker is not offered on your account, the fallback is a classic token with the shortest expiry, revoked immediately after the push.

## 4. Prerequisite status

| Variable in `.env.local`        | Purpose                                                                                       | Status                                                                                                                                                           |
| ------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Project URL                                                                                   | **Set** (by me)                                                                                                                                                  |
| `SUPABASE_PROJECT_REF`          | Guard for the wrapper                                                                         | **Set** (by me, 2026-10-19)                                                                                                                                      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable key for the app                                                                   | **Set** (by me, fetched with the read-only MCP tool `get_publishable_keys` and piped into the file; the value never appeared in chat or logs)                    |
| `SUPABASE_ACCESS_TOKEN`         | Scoped token for `link`                                                                       | **Set** by owner 2026-10-19 with the three documented permissions; **needs Connection Pooling (Read) added** (new token) unless the pooler-host fallback is used |
| `SUPABASE_DB_PASSWORD`          | Database connection for `link`, `list`, `dry-run`                                             | **Set** by owner 2026-10-19                                                                                                                                      |
| `SUPABASE_POOLER_HOST`          | Optional fallback: Supavisor host (`aws-0-<region>.pooler.supabase.com`, dashboard → Connect) | Pending — only if the owner prefers not to create a new token                                                                                                    |
| `SUPABASE_SERVICE_ROLE_KEY`     | Not needed for the dry-run; needed later for `pnpm bootstrap:admin`                           | Pending — owner, later                                                                                                                                           |

## 5. Secure entry of the two secrets (no value in chat, terminal output, logs or git)

1. **Create the scoped token:** Supabase dashboard → Account → Access Tokens → Generate new token → name `talentflow-dry-run` → scope: organization and project `talentflow-ats` → permissions **Project Settings: Read**, **API Keys: Read**, **API Key Secrets: Read** → shortest expiry offered. Copy it once.
2. In a terminal in `C:\Users\moi-a\Desktop\talentflow-ats` run `pnpm env:set SUPABASE_ACCESS_TOKEN` and paste at the hidden prompt (nothing is echoed; the script writes only to the git-ignored `.env.local` and prints the character count).
3. **Database password:** Project Settings → Database → use the existing password or reset it there. Run `pnpm env:set SUPABASE_DB_PASSWORD` and paste at the hidden prompt.
4. Run `pnpm env:check` — it prints variable names and lengths only and says whether the dry-run prerequisites are complete.
5. Tell me it is done. I will run `pnpm env:check` myself (names only) and then ask for your explicit approval of steps 1–3 below.

Why not `supabase login`: it stores a classic full-account token. Why not `supabase login --token …`: the value would land in shell history.

## 5a. Resolving the IPv6 stop (choose one)

- **Option 1 (preferred):** generate a new scoped token with **Project Settings, API Keys, API Key Secrets, Connection Pooling**, all Read; `pnpm env:set SUPABASE_ACCESS_TOKEN`; revoke the old token. Then `link` is re-run so the pooler route is stored, followed by `list-remote` and `dry-run`.
- **Option 2:** `pnpm env:set SUPABASE_POOLER_HOST` with the Supavisor host from the dashboard's Connect dialog (session mode, port 5432). The wrapper then runs `list-remote` and `dry-run` against that host with the existing password; no re-link needed.

## 6. Exact steps (each reported with its output before the next; none runs without your approval)

| Step | Command (what the wrapper runs)                                                                                                                             | Expected output                                                                                                                           | Effect on hosted project                                                                                                                                                                           |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `pnpm supabase:hosted link` → `supabase link --project-ref zcxmyaxpftzwpzvmhslm` with `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` in the environment | `Finished supabase link.`; possibly a warning that `supabase/config.toml` differs from remote settings (expected; config is never pushed) | **None.** Reads project settings and API keys; validates database settings over a read-only connection; writes `supabase/.temp/*` (git-ignored) and stores the password in the OS credential store |
| 2    | `pnpm supabase:hosted list-remote` → `supabase migration list --linked`                                                                                     | Table with the three local versions and an empty Remote column                                                                            | **None.** Read-only                                                                                                                                                                                |
| 3    | `pnpm supabase:hosted dry-run` → `supabase db push --dry-run --linked`                                                                                      | `Would push these migrations:` + the three file names, exit 0                                                                             | **None.**                                                                                                                                                                                          |
| 4    | **Stop.** I paste the three outputs into `docs/DAILY_LOG.md` and ask separately for `push`                                                                  | —                                                                                                                                         | —                                                                                                                                                                                                  |

Not part of this plan: `push`, `pnpm bootstrap:admin`, `db reset`, `--include-seed`/`--include-roles`, MCP read-write, deployment.

## 7. If something fails

- Wrong ref or URL mismatch: the wrapper exits before calling the CLI.
- Token lacks a permission: the CLI names it; I report it and ask you to widen the token minimally.
- Password rejected: nothing has changed; reset the password in the dashboard, `pnpm env:set SUPABASE_DB_PASSWORD` again, rerun step 1.
- Any unexpected output: I stop, record it, and do not continue.

Rolling back the dry-run: nothing to roll back; `pnpm supabase:hosted unlink` removes the local link state and the stored password.

## 8. Owner approval checklist

Reply with the items you approve once `pnpm env:check` reports "all present":

- [ ] Approve step 1 (`link`).
- [ ] Approve step 2 (`list-remote`).
- [ ] Approve step 3 (`dry-run`).

The push itself will be requested separately with the dry-run output attached.
