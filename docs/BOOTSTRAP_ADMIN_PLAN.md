# First platform admin — bootstrap plan for approval

**Date:** 2026-10-20. **Status:** reviewed, hardened and rehearsed locally; step 1 done by the owner (key saved, `pnpm env:check bootstrap` all present); step 2 dry run done; **step 4 executed with the owner's explicit approval on 2026-10-20: platform admin user `dc43b2a0-b9bc-41fd-a153-28184ffe0823` created, link written to a restricted file outside the repository, records verified read-only** (`docs/DAILY_LOG.md`). Waiting at step 5: the owner opens the link privately and sets a password; then step 6 verification.

**In one paragraph.** `pnpm bootstrap:admin` creates the first platform admin of project `zcxmyaxpftzwpzvmhslm`: one `auth.users` row through an invitation link, one `profiles` row filled by the database trigger, one `platform_admins` row, one `admin.bootstrapped` audit row, and a single-use link that the admin opens to set a password. The script was reworked today to be dry-run by default, to refuse when an admin already exists, to validate its inputs, to fail loudly with recovery guidance, and to keep the invitation token out of the terminal and out of this conversation (`--link-file`). The database side was rehearsed step by step against the current schema (migrations 0001–0004) and the script against a fake service-role client. No hosted Auth setting has to change for the bootstrap to work.

## 1. The script and its safeguards (as of today)

| Safeguard                   | Behaviour                                                                                                                                                                                                          | Verified by        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| Dry run by default          | Without `--apply` the script only reads (number of platform admins, whether this email already is one, number of auth users) and prints what it would do. No link, no rows.                                        | unit test          |
| Project guard               | `--project-ref` must match the host of `NEXT_PUBLIC_SUPABASE_URL`; otherwise it stops before any call.                                                                                                             | unit test          |
| Input validation            | Email (RFC format, ≤254), name ≤160 characters (the `profiles.full_name` constraint), ref = 20 lowercase letters.                                                                                                  | unit test          |
| One-shot bootstrap          | If another admin exists and the email is not that admin's, the script refuses: further admins are added from `/admin/admins`. `--allow-existing` overrides deliberately. Re-running for the same email is allowed. | unit test          |
| Idempotent re-run           | An existing account gets a magic link instead of an invitation; the admin row is upserted; a second audit row records the re-run.                                                                                  | unit test, DB test |
| Audit without personal data | `admin.bootstrapped` carries `actor_user_id`, `target_id` (the user id) and metadata `{source, project_ref, link_type}`; never the email or name.                                                                  | unit test, DB test |
| Always set a password       | Both link types end on `/auth/set-password`, so a re-link after an expired invitation cannot skip the password step.                                                                                               | unit test          |
| Token handling              | The link is printed exactly once, or, with `--link-file <path>`, written to that file (mode 0600) while the log shows only `token_hash=[redacted]`.                                                                | unit test          |
| Loud failure                | If the admin row or the audit row cannot be written after the user exists, the error names the user id and says to re-run with `--apply`; nothing is silently skipped.                                             | unit test          |
| Secrets                     | The service-role key is read from `.env.local` by `node --env-file` and never appears in any output; `pnpm env:check bootstrap` reports names and lengths only.                                                    | code review        |

Changes made today compared with the previous version: it executed immediately (no dry run), did not refuse when admins existed, treated an audit failure as a warning, sent existing accounts to `/app` (which would have skipped the password step after an expired invitation), did not validate the email, and could only print the link to the terminal.

## 2. Credentials and hosted Auth settings

**Environment (`.env.local`, names only, from `pnpm env:check bootstrap`):**

| Variable                        | Status                   | Used for                                                                        |
| ------------------------------- | ------------------------ | ------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | present                  | project guard and API endpoint                                                  |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | present (publishable)    | the local app that exchanges the link                                           |
| `NEXT_PUBLIC_APP_URL`           | present (localhost:3000) | host of the generated link                                                      |
| `SUPABASE_PROJECT_REF`          | present                  | passed as `--project-ref`                                                       |
| `SUPABASE_SERVICE_ROLE_KEY`     | **missing**              | the admin API (`generateLink`, `listUsers`) and the two inserts that bypass RLS |

The key is the project's **secret key** (`sb_secret_…`, Project Settings → API Keys) or the legacy `service_role` JWT; supabase-js accepts both for `auth.admin` and both act as `service_role`. It must never reach the browser, the repository or this conversation.

**Hosted Auth settings.** I could not read them: the Management API endpoint for the auth configuration answered `403 Missing required permission(s): auth_config_read` for the scoped access token. None of the settings has to change for the bootstrap at its default value; the ones that matter:

| Setting                        | Default | Needed for the bootstrap?                                                                      | Recommendation (separate approval; owner action in the dashboard)            |
| ------------------------------ | ------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Email provider enabled         | on      | yes: invitation and magic-link tokens are email OTP tokens, even though no email is sent       | keep on                                                                      |
| Email OTP expiry               | 3600 s  | sets the lifetime of the one-time link                                                         | keep; open the link within the hour                                          |
| Allow new users to sign up     | on      | no: the admin API invites regardless                                                           | **turn off before deployment** (otherwise anyone can create a stray account) |
| Minimum password length        | 6       | no: the app's form enforces 10                                                                 | set 10 before deployment (defence in depth)                                  |
| Site URL / redirect allow-list | —       | no: the app never uses GoTrue's action link; `/auth/confirm` exchanges the token hash directly | set when deploying                                                           |
| Custom SMTP                    | off     | no: nothing is emailed                                                                         | not needed                                                                   |

If you want these verified rather than assumed, either add the read-only **Auth** permission to the access token (I then read the configuration, change nothing) or confirm the values in the dashboard.

## 3. Exactly what `--apply` changes

| Table                    | Rows | Written by                                                                                                                                                    | Columns                                                                                                                                                                                                                                                             |
| ------------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.users`             | 1    | Supabase Auth (GoTrue, role `supabase_auth_admin`) through `generateLink({type: "invite"})`                                                                   | `id` (new uuid), `email` (lower-cased), `raw_user_meta_data = {"full_name": …}`, `invited_at`, `aud`/`role` = `authenticated`; `email_confirmed_at` and `last_sign_in_at` stay NULL until the link is used; `encrypted_password` is set when the password is chosen |
| `public.profiles`        | 1    | trigger `on_auth_user_created` → `sync_profile_from_auth_user()` (SECURITY DEFINER; EXECUTE limited by migration 0004 to its owner and `supabase_auth_admin`) | `id`, `email`, `full_name` (from the metadata), `created_at`, `updated_at`                                                                                                                                                                                          |
| `public.platform_admins` | 1    | the script as `service_role` (upsert on `user_id`)                                                                                                            | `user_id`, `granted_by = NULL` (first admin, nobody granted it), `granted_at = now()`, `note = 'bootstrap script'`                                                                                                                                                  |
| `public.audit_events`    | 1    | the script as `service_role`                                                                                                                                  | `actor_user_id` = the user, `organization_id = NULL`, `action = 'admin.bootstrapped'`, `target_type = 'user'`, `target_id` = the user id, `metadata = {"source": "scripts/bootstrap-admin.ts", "project_ref": "zcxmyaxpftzwpzvmhslm", "link_type": "invite"}`       |

Nothing else changes: no organization, no membership, no schema change (the fingerprint stays `227fed80180eced8183d19d5634a8ee0`), the four-migration history is untouched. When the admin later opens the link, `/auth/confirm` exchanges the token (`verifyOtp`), which sets `email_confirmed_at` and creates a session; `/auth/set-password` stores the password and calls `activate_my_memberships()` (returns 0 for the admin); each later password login writes an `auth.signed_in` audit row. The admin lands on `/admin` because `is_platform_admin()` reads the `platform_admins` row.

**Trigger and flow rehearsed against the current schema** (`tests/db/bootstrap-admin.test.ts`, 7 cases on an isolated database with migrations 0001–0004): the GoTrue-style insert as `supabase_auth_admin` fills `profiles` with email and name; the `service_role` upsert keeps a single admin row with `granted_by` NULL; the audit row holds ids only; the new admin, acting as `authenticated` with their JWT subject, is recognised by `is_platform_admin()`, sees their profile, activates zero memberships and sees the admin row; another signed-in user is not an admin, sees no admin rows and cannot insert one (privilege error); an email change in `auth.users` propagates to `profiles` and keeps the name; deleting the auth user cascades to `profiles` and `platform_admins` and leaves the audit row with a NULL actor.

## 4. Procedure (each step reported with its output before the next; stop on anything unexpected)

0. **Preconditions (already verified read-only on 2026-10-20):** migrations 0001–0004 applied; `auth.users`, `profiles`, `platform_admins` all 0 rows; CI green.
1. **Service-role key into `.env.local` (your choice, nothing is ever displayed):**
   - (a) You: Project Settings → API Keys → secret key → run `pnpm env:set SUPABASE_SERVICE_ROLE_KEY` in the project directory and paste at the hidden prompt. Nothing is echoed, nothing enters shell history, only the name and length are reported.
   - (b) Me, with your approval: fetch the key through the Management API with the existing scoped token (it already holds "API Key Secrets: Read", which `supabase link` required) and pipe it straight into `pnpm env:set SUPABASE_SERVICE_ROLE_KEY`; it is never printed.
   - Then `pnpm env:check bootstrap` must report "all present".
2. **Dry run (reads only; uses the service-role key):** `pnpm bootstrap:admin --email <admin-email> --name "<Full Name>" --project-ref zcxmyaxpftzwpzvmhslm`. Expected: `Project zcxmyaxpftzwpzvmhslm (…); mode DRY RUN.`, `Existing platform admins: 0; auth users: 0.`, `Would create the auth user by invitation…`, `DRY RUN: nothing was created or written.` Any other count stops the procedure.
3. **Stop.** You confirm the dry-run output and the exact email and name.
4. **Apply (hosted change; needs the approval from step 3):** the same command with `--apply --link-file "<a path outside the repository, e.g. C:\Users\<you>\talentflow-admin-link.txt>"`. Expected: `Platform admin ensured for user <uuid> (invite).` and `Written to <path> (delete the file after use): …token_hash=[redacted]…`. The token exists only in that file.
5. **Open the link:** the app must run locally on the link's host: `pnpm dev` (port 3000; `.env.local` already points the app at the hosted project; the preview server on port 3100 can keep running). Open the file's URL in a browser → `/auth/confirm` exchanges the token → `/auth/set-password` → choose a password of at least 10 characters → land on `/admin`. Delete the link file afterwards.
6. **Verification (read-only, MCP):** `auth.users` 1 row with `email_confirmed_at` set; `profiles` 1 row with the email and name; `platform_admins` 1 row, `granted_by` NULL; `audit_events`: `admin.bootstrapped` (and `auth.signed_in` after the first password login); no organizations or memberships; migrations still 4; fingerprint unchanged; security advisor unchanged. Recorded in `docs/DAILY_LOG.md` and `docs/TEST_PLAN.md` (T24: invite → confirm → set password, verified for the admin).
7. **Afterwards:** the key stays in `.env.local` (the app's provisioning actions need it locally; on Azure it becomes an App Service setting). Clear the terminal. Share the admin credentials privately only (delivery checklist item 2).

## 5. Rollback and recovery

| Situation                                                       | What to do                                                                                                                                                                                                                                                       | Hosted change?       |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Link expired (after the OTP lifetime) or lost before use        | Re-run with `--apply` for the same email: the account exists, so a magic link is generated; it ends on the password page. Generating a new link invalidates the previous token. No duplicate rows.                                                               | yes (new token)      |
| Script failed after the user was created                        | Re-run with `--apply`: `email_exists` → magic link; the admin upsert and the audit insert complete. The error message names the user id.                                                                                                                         | yes                  |
| Wrong email address                                             | Delete the user (dashboard Authentication → Users, or `delete from auth.users where id = '<uuid>'` as the owner). Cascades remove `profiles` and `platform_admins`; the audit row stays with `actor_user_id` NULL (rehearsed). Then re-run with the right email. | yes (needs approval) |
| Link seen by someone else before use                            | Re-run with `--apply` immediately (replaces the token), or delete the user as above.                                                                                                                                                                             | yes                  |
| Password forgotten later (no self-service reset in the app yet) | Re-run with `--apply` for the admin's email: magic link → set a new password. The admin UI can also invite a second admin as a fallback.                                                                                                                         | yes                  |
| Service-role key exposed                                        | Rotate it in the dashboard (API Keys), then `pnpm env:set SUPABASE_SERVICE_ROLE_KEY` again.                                                                                                                                                                      | yes (owner)          |
| Script refuses: "A platform admin already exists"               | Expected once an admin exists. Add further admins from `/admin/admins`; use `--allow-existing` only for a deliberate second bootstrap.                                                                                                                           | no                   |

## 6. Local tests run today

| Command                                      | Result                                                                                                |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `pnpm test`                                  | 109 passed / 109 in 10 files (10 new in `tests/unit/bootstrap-admin.test.ts`)                         |
| `pnpm db:verify`                             | 48 passed / 48 in 5 files (7 new in `tests/db/bootstrap-admin.test.ts`)                               |
| `TALENTFLOW_DB_HOSTED_LIKE=1 pnpm db:verify` | 48 passed / 48                                                                                        |
| `pnpm lint` / `pnpm typecheck`               | Pass                                                                                                  |
| `pnpm env:check bootstrap`                   | `missing SUPABASE_SERVICE_ROLE_KEY` → "bootstrap prerequisites: incomplete." (expected before step 1) |
| `pnpm bootstrap:admin` without arguments     | Usage error, exit 1, no network call                                                                  |

## 7. Approval requested

- [ ] Step 1: option (a) you enter the key, or (b) I fetch it through the Management API and pipe it into `.env.local` unseen.
- [ ] Step 2: permission to run the dry run (reads only, with the service-role key) and report its output.
- [ ] Step 4: after the dry-run report, explicit approval of `--apply` for the stated email and name.

Not part of this plan and not done: hosted Auth settings (the recommendations in §2 are separate decisions), deployment, AI integration.
