# Hosted migration dry-run plan — for owner review

**Status:** Proposed 2026-10-19. Nothing in this plan changes the hosted database. The dry-run prints what _would_ be applied; the actual push is a separate, later approval.

## 1. Target and verified starting state

| Item               | Value                                       | How verified                                                  |
| ------------------ | ------------------------------------------- | ------------------------------------------------------------- |
| Project ref        | `zcxmyaxpftzwpzvmhslm`                      | Owner instruction; `NEXT_PUBLIC_SUPABASE_URL` in `.env.local` |
| Project URL        | `https://zcxmyaxpftzwpzvmhslm.supabase.co`  | MCP `get_project_url` (read-only), 2026-10-19                 |
| Public tables      | none                                        | MCP `list_tables` for schema `public` → `{"tables":[]}`       |
| Applied migrations | none                                        | MCP `list_migrations` → `{"migrations":[]}`                   |
| MCP mode           | read-only (`read_only=true` in `.mcp.json`) | `claude mcp list` → Connected                                 |

Guard in `scripts/db/hosted.mjs`: every subcommand refuses to run unless `NEXT_PUBLIC_SUPABASE_URL` contains `<SUPABASE_PROJECT_REF>.supabase.co`, so a mistyped ref cannot point the CLI at another project.

## 2. What the dry-run would report (and what the later push would apply)

| Order | File                                                           | Objects                                                                                                                                                                          |
| ----- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `supabase/migrations/20261019120000_initial_schema.sql`        | 6 enums, 9 tables, 9 indexes, 3 trigger helpers, 13 triggers, `auth.users` → `profiles` sync trigger                                                                             |
| 2     | `supabase/migrations/20261019120100_rls_policies.sql`          | 5 helper functions (`is_platform_admin`, `is_org_member`, `can_access_org`, `shares_organization_with`, `log_audit_event`), grants/revokes, RLS enabled on 9 tables, 21 policies |
| 3     | `supabase/migrations/20261019130000_membership_activation.sql` | `activate_my_memberships()`                                                                                                                                                      |

All three apply cleanly on PostgreSQL 17 in CI and locally (`pnpm db:verify`, 31 tests). Review notes are in `docs/SUPABASE_INTEGRATION.md` §5.

## 3. Credentials required and how they are handled

| Variable (`.env.local`) | What                               | Where to get it                                                                                                                                                                                                      | Handling                                                                                                                                                                                                       |
| ----------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_PROJECT_REF`  | `zcxmyaxpftzwpzvmhslm`             | Known                                                                                                                                                                                                                | Not secret                                                                                                                                                                                                     |
| `SUPABASE_ACCESS_TOKEN` | A **scoped** personal access token | Supabase dashboard → Account → Access Tokens → Generate new token → scope it to the organization and project `talentflow-ats` with **read** permission on project settings and API keys; set a short expiry (7 days) | Read by the Supabase CLI from the environment only (`node --env-file=.env.local`). Never printed, never passed on the command line, never committed. Revoke after the push is done.                            |
| `SUPABASE_DB_PASSWORD`  | The project's database password    | Project Settings → Database (reset it there if unknown)                                                                                                                                                              | Used by `link`, `migration list` and `db push` to connect through the pooler. The CLI stores it in the OS credential store after `link`; `pnpm supabase:hosted unlink` removes it. Never printed or committed. |

Why not the CLI browser login: `supabase login` creates a classic token with full access to every organization and project on the account (per the official `supabase` skill). A scoped token limits the blast radius to this project.

`.env.local` is git-ignored and the repository's secret scan runs before every commit. The wrapper prints only the command it runs and the CLI's own output; CLI output does not echo credentials.

## 4. Exact steps (each reported with its output before the next)

Preconditions I check first: `git status` clean, `.env.local` has the three variables above (presence only, values never shown), MCP state still "no tables, no migrations".

| Step | Command (what the wrapper runs)                                                                                                 | Expected output                                                                                                                                        | Effect on hosted project                                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `pnpm supabase:hosted link` → `supabase link --project-ref zcxmyaxpftzwpzvmhslm`                                                | `Finished supabase link.` possibly with a warning that local `supabase/config.toml` differs from the remote settings (expected; we do not push config) | **None.** Reads project metadata; writes `supabase/.temp/*` locally (git-ignored) and the DB password to the local credential store |
| 2    | `pnpm supabase:hosted list-remote` → `supabase migration list --linked`                                                         | A table with the three local versions and an empty Remote column                                                                                       | **None.** Read-only query of `supabase_migrations.schema_migrations` (reported empty or absent)                                     |
| 3    | `pnpm supabase:hosted dry-run` → `supabase db push --dry-run --linked`                                                          | `Would push these migrations:` followed by the three file names, then exit 0                                                                           | **None.** CLI help: "Print the migrations that would be applied, but don't actually apply them."                                    |
| 4    | **Stop.** I paste the three outputs into the engineering journal and ask for a separate approval of `pnpm supabase:hosted push` | —                                                                                                                                                      | —                                                                                                                                   |

Not part of this plan: `push`, `pnpm bootstrap:admin`, `supabase db reset`, any `--include-seed`/`--include-roles` flag, switching the MCP server to read-write, deploying.

## 5. If something fails

- Wrong ref or URL mismatch: the wrapper exits before calling the CLI.
- Token lacks a permission: the CLI names the missing permission; I report it and ask you to widen the token minimally (never to a classic token).
- Password rejected: nothing has been changed; reset the password in the dashboard and rerun step 1.
- Any unexpected output: I stop, record it, and do not continue to the next step.

Rolling back the dry-run: nothing to roll back. `pnpm supabase:hosted unlink` removes the local link state and stored password.

## 6. Owner approval checklist

Reply with the items you approve:

- [ ] I have added `SUPABASE_PROJECT_REF`, a scoped `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` to `.env.local`.
- [ ] Approve step 1 (`link`).
- [ ] Approve step 2 (`list-remote`).
- [ ] Approve step 3 (`dry-run`).

The push itself will be requested separately with the dry-run output attached.
