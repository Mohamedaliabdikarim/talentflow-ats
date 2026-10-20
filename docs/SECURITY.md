# TalentFlow ATS — Security

**Status:** Phase 0 threat model and control design. Controls are marked as Planned until implemented and tested.

## 1. Assets

- Candidate personal data (names, contact details, notes, optional CV-derived insights).
- Customer business data (jobs, pipeline state).
- Account credentials and sessions.
- Supabase service-role key, Azure OpenAI key, GitHub token (if used).

## 2. Threat model (abridged STRIDE)

| Threat                 | Example                                                                | Control                                                                                                                                                                                            | Status                                                                 |
| ---------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Spoofing               | Forged "I am admin" claim from the client                              | Admin status is a `platform_admins` row checked in the database via `is_platform_admin()`; never a client flag                                                                                     | Implemented (`src/server/auth.ts`); unit-tested                        |
| Tampering              | Customer A changes `organization_id` in a request to write into B      | RLS `with check` on every tenant table; composite FKs; immutable `organization_id` trigger                                                                                                         | Migrations written; verification pending                               |
| Tampering              | Guessing another tenant's record UUIDs                                 | RLS `using` clauses filter by tenant; not-found responses, no existence leak                                                                                                                       | Planned                                                                |
| Repudiation            | Admin denies entering a customer workspace                             | `audit_events` with actor from `auth.uid()`; cannot be spoofed                                                                                                                                     | Implemented; DB-tested locally                                         |
| Information disclosure | Service-role key shipped to browser                                    | Key only in server env; `server-only` guard on the admin client module; CI grep for `SUPABASE_SERVICE_ROLE_KEY` in client bundles                                                                  | Implemented; bundle grep passes locally and in CI                      |
| Information disclosure | Candidate data in logs                                                 | Structured logs exclude personal fields; raw CV text never stored or logged                                                                                                                        | Planned                                                                |
| Denial of service      | Unbounded inputs                                                       | Zod limits + database check constraints on all text fields                                                                                                                                         | DB constraints written                                                 |
| Elevation of privilege | Non-admin invokes provisioning action                                  | Every privileged Server Action calls `requirePlatformAdmin()` before using the service role; negative tests required                                                                               | Implemented; unit + DB tests                                           |
| Elevation of privilege | Recursive or over-broad RLS policy                                     | Helper functions are `security definer` with pinned `search_path`; policies are per-operation; reviewed in `docs/DATABASE.md`                                                                      | Written, verification pending                                          |
| Injection              | Prompt injection via CV or README text                                 | External text is wrapped as data, model output validated against a schema, no tool execution from model output                                                                                     | Planned (AI feature gated)                                             |
| CSRF                   | Cross-site form post to a Server Action                                | Next.js Server Actions enforce same-origin checks; cookies are `SameSite=Lax`, `HttpOnly`, `Secure` in production                                                                                  | Next.js default (Server Actions origin check); sign-out is a POST form |
| Information disclosure | Local preview routes (synthetic data, no auth) reachable in production | `/preview/*` is a 404 unless `NODE_ENV !== production` or `TALENTFLOW_PREVIEW=1`; the proxy only exempts it from authentication under the same condition; the flag is never set on Azure (ADR-024) | Implemented; unit-tested                                               |
| Open redirect          | `?next=https://evil` after login                                       | Only relative paths starting with `/` are accepted as redirect targets                                                                                                                             | Implemented (`safeRedirectPath`); unit-tested                          |

## 3. Authentication and sessions

- Supabase Auth, email + password. Password policy: minimum 10 characters (configured in Supabase and mirrored in Zod).
- Sessions are HttpOnly cookies managed by `@supabase/ssr`; `proxy.ts` refreshes tokens on each request.
- Invite links are generated server-side with the admin API and shown once to the admin; they expire with the project's email OTP setting (default one hour).
- Sign-out revokes the session server-side.

## 4. Authorization layers

1. **Proxy (optimistic):** redirects unauthenticated requests away from protected routes. Not a security boundary.
2. **Server (authoritative for actions):** `requireUser()`, `requirePlatformAdmin()`, `requireOrgAccess(slug)` run in layouts and every Server Action.
3. **Database (final):** RLS on all tables; anon has zero privileges.

Privileged operations and their guard:

| Operation                                    | Guard                      | Client used  |
| -------------------------------------------- | -------------------------- | ------------ |
| Create organization                          | `requirePlatformAdmin()`   | service role |
| Invite / create user, add membership         | `requirePlatformAdmin()`   | service role |
| Grant platform admin                         | `requirePlatformAdmin()`   | service role |
| All job / candidate / application operations | `requireOrgAccess()` + RLS | user-scoped  |

## 5. Secrets and configuration

- `.env.local` for local development (git-ignored). `.env.example` documents variable names only.
- Production secrets in Azure App Service application settings; never in the repository or build logs.
- `src/lib/env.ts` validates variables at startup with Zod and separates public (`NEXT_PUBLIC_*`) from server-only names.
- Demo credentials are shared through a private channel, never in README, commits or the video.

## 6. Privacy

- Data minimization: only fields needed for recruiting are stored.
- Synthetic data only in demos and tests.
- Retention: AI insights can be deleted per candidate; deleting a candidate cascades to applications and insights.
- Processing of real applicant CVs requires a documented lawful basis and is out of scope for the demo (see `docs/AI_FEATURE.md`).

## 7. Required security tests (see `docs/TEST_PLAN.md`)

- Cross-tenant read / insert / update / delete via RLS tests against embedded PostgreSQL.
- Non-admin cannot run provisioning actions (unit test of the guard and an E2E attempt).
- Unauthenticated access to protected pages and actions is denied.
- Service-role key is absent from client bundles (build-time grep).

## 8. Hosted database verification (2026-10-19) and privilege hardening (applied 2026-10-20)

After the approved push of migrations 0001–0003, the hosted project was verified read-only (MCP `execute_sql`, `get_advisors`, `list_tables`; CLI `migration list`). Schema fingerprint identical to the local reference; RLS enabled on all 9 tables; `anon` holds no table privilege.

Findings, with the decision for each:

| Finding                                                                                                                                                        | Source                                                                                                                    | Risk                                                                                                                                                                                                                                                | Decision                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `authenticated` holds `TRUNCATE`, `REFERENCES`, `TRIGGER`, `MAINTAIN` on every public table                                                                    | Supabase's per-schema default privileges for role `postgres` (`Dxtm` on new tables for the API roles), not our migrations | RLS does not govern `TRUNCATE`; `MAINTAIN` allows `LOCK TABLE`, `VACUUM`, `REINDEX`. PostgREST exposes none of these and users never get a direct database connection, so exposure is low, but the privileges should not exist                      | **Proposed migration 0004** (`supabase/proposed/20261019140000_privilege_hardening.sql`): revoke on all tables and remove the per-schema default for all three API roles; reviewed in `docs/PRIVILEGE_HARDENING_REVIEW.md`; **applied 2026-10-20 and re-measured: `authenticated` holds DML only** |
| `sync_profile_from_auth_user()` (SECURITY DEFINER trigger function) executable by `anon` and `authenticated` via `/rest/v1/rpc/`                               | Security advisor WARN                                                                                                     | Trigger functions cannot be called outside a trigger (PostgreSQL rejects the call), so this is cosmetic; PostgreSQL also fires triggers without checking EXECUTE on the invoking role (verified 2026-10-20), so the revoke cannot break the trigger | Migration 0004 (applied 2026-10-20): EXECUTE limited to the owner and `supabase_auth_admin`; the trigger still fires (DB test); advisor finding gone                                                                                                                                               |
| `is_platform_admin`, `is_org_member`, `can_access_org`, `shares_organization_with`, `log_audit_event`, `activate_my_memberships` executable by `authenticated` | Security advisor WARN                                                                                                     | Intended: they are the RLS helpers and the two RPCs the app calls; each reads only `auth.uid()`-scoped data or writes an audit row with the caller as actor; `anon` is denied                                                                       | Accepted; documented in `docs/DATABASE.md` §4                                                                                                                                                                                                                                                      |
| `rls_auto_enable()` executable by both API roles                                                                                                               | Security advisor WARN                                                                                                     | Supabase platform function behind the `ensure_rls` event trigger; owned by `postgres` on this project; event triggers fire without an EXECUTE check (verified), so revoking API-role execution does not affect it                                   | Migration 0004 (applied 2026-10-20) revoked API-role EXECUTE; `ensure_rls` still enabled; advisor finding gone                                                                                                                                                                                     |
| 14 unindexed foreign keys, 9 unused indexes                                                                                                                    | Performance advisor INFO                                                                                                  | None on an empty database                                                                                                                                                                                                                           | Revisit with real data volumes                                                                                                                                                                                                                                                                     |

After migration 0004 the hosted grants equal the local model: `anon` nothing, `authenticated` the designed DML, `service_role` everything, API roles no default privileges on new tables. Not yet exercised on the hosted project: the `auth.users` → `profiles` trigger (no users exist). The first `pnpm bootstrap:admin` run (separate approval) is its first real execution and must be checked by reading `profiles` afterwards.
