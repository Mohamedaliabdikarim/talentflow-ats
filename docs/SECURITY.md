# TalentFlow ATS — Security

**Status:** Phase 0 threat model and control design. Controls are marked as Planned until implemented and tested.

## 1. Assets

- Candidate personal data (names, contact details, notes, optional CV-derived insights).
- Customer business data (jobs, pipeline state).
- Account credentials and sessions.
- Supabase service-role key, Azure OpenAI key, GitHub token (if used).

## 2. Threat model (abridged STRIDE)

| Threat                 | Example                                                           | Control                                                                                                                           | Status                                   |
| ---------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Spoofing               | Forged "I am admin" claim from the client                         | Admin status is a `platform_admins` row checked in the database via `is_platform_admin()`; never a client flag                    | Planned                                  |
| Tampering              | Customer A changes `organization_id` in a request to write into B | RLS `with check` on every tenant table; composite FKs; immutable `organization_id` trigger                                        | Migrations written; verification pending |
| Tampering              | Guessing another tenant's record UUIDs                            | RLS `using` clauses filter by tenant; not-found responses, no existence leak                                                      | Planned                                  |
| Repudiation            | Admin denies entering a customer workspace                        | `audit_events` with actor from `auth.uid()`; cannot be spoofed                                                                    | Planned                                  |
| Information disclosure | Service-role key shipped to browser                               | Key only in server env; `server-only` guard on the admin client module; CI grep for `SUPABASE_SERVICE_ROLE_KEY` in client bundles | Planned                                  |
| Information disclosure | Candidate data in logs                                            | Structured logs exclude personal fields; raw CV text never stored or logged                                                       | Planned                                  |
| Denial of service      | Unbounded inputs                                                  | Zod limits + database check constraints on all text fields                                                                        | DB constraints written                   |
| Elevation of privilege | Non-admin invokes provisioning action                             | Every privileged Server Action calls `requirePlatformAdmin()` before using the service role; negative tests required              | Planned                                  |
| Elevation of privilege | Recursive or over-broad RLS policy                                | Helper functions are `security definer` with pinned `search_path`; policies are per-operation; reviewed in `docs/DATABASE.md`     | Written, verification pending            |
| Injection              | Prompt injection via CV or README text                            | External text is wrapped as data, model output validated against a schema, no tool execution from model output                    | Planned (AI feature gated)               |
| CSRF                   | Cross-site form post to a Server Action                           | Next.js Server Actions enforce same-origin checks; cookies are `SameSite=Lax`, `HttpOnly`, `Secure` in production                 | Planned                                  |
| Open redirect          | `?next=https://evil` after login                                  | Only relative paths starting with `/` are accepted as redirect targets                                                            | Planned                                  |

## 3. Authentication and sessions

- Supabase Auth, email + password. Password policy: minimum 10 characters (configured in Supabase and mirrored in Zod).
- Sessions are HttpOnly cookies managed by `@supabase/ssr`; `proxy.ts` refreshes tokens on each request.
- Invite links are generated server-side with the admin API and shown once to the admin; they expire according to Supabase settings (default 24 h).
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
