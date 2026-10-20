# TalentFlow ATS — Database

**Status:** Migrations written (`supabase/migrations/`). Local apply and RLS tests are part of Phase 0 verification; results are recorded in `docs/TEST_PLAN.md`. Not yet applied to a hosted Supabase project (requires project credentials, see approvals).

## 1. Entity overview

```
auth.users (Supabase)
   |1
   |---< profiles (1:1 mirror)
   |---< platform_admins (explicit platform authority)
   |---< organization_memberships >---- organizations
                                             |1
                                             |---< jobs ------------+
                                             |---< candidates ------+--< applications (job x candidate, stage)
                                             |---< candidate_ai_insights (optional, advisory)
                                             |---< audit_events (security-relevant actions)
```

## 2. Tables

| Table                      | Tenant-owned        | Purpose                                       | Notable constraints                                                                                                          |
| -------------------------- | ------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `organizations`            | n/a (is the tenant) | Customer identity                             | unique lowercase slug, status                                                                                                |
| `profiles`                 | no                  | Display data for auth users                   | synced from `auth.users` by trigger                                                                                          |
| `platform_admins`          | no                  | Platform-wide authority                       | PK = user id; written only server-side                                                                                       |
| `organization_memberships` | yes                 | User ↔ organization with role and status      | unique (organization, user); organization immutable                                                                          |
| `jobs`                     | yes                 | Job postings                                  | title 2–160 chars, description ≤ 20 000, unique (id, organization_id)                                                        |
| `candidates`               | yes                 | Person records                                | LinkedIn URL must be `https://…linkedin.com/…`; GitHub URL must be `https://github.com/<user>`; unique (id, organization_id) |
| `applications`             | yes                 | Candidate applied to job, with pipeline stage | unique (job, candidate); composite FKs force same tenant; `stage_changed_at` maintained by trigger                           |
| `candidate_ai_insights`    | yes                 | Optional AI output with provenance            | `human_review_required` default true; composite FKs                                                                          |
| `audit_events`             | partly              | Security-relevant actions                     | action format `area.event`; metadata ≤ 8 KB; no candidate content                                                            |

Enumerations: `organization_status`, `membership_role`, `membership_status`, `job_status`, `application_stage` (`new`, `screening`, `interview`, `offer`, `hired`, `rejected`), `insight_status`.

## 3. Tenant invariants enforced in the database

1. **Every tenant-owned row carries `organization_id`.** No derivation through joins is needed for RLS.
2. **Composite foreign keys.** `applications(job_id, organization_id)` references `jobs(id, organization_id)`; same for candidates and insights. A row can never link a job from tenant A to a candidate from tenant B.
3. **Immutability.** `prevent_organization_change()` rejects updates that change `organization_id`.
4. **RLS predicate.** `public.can_access_org(organization_id)` is used in `using` and `with check` for all tenant-owned tables.

## 4. Authorization helpers

| Function                         | Returns true when                                   | Security                               |
| -------------------------------- | --------------------------------------------------- | -------------------------------------- |
| `is_platform_admin()`            | current `auth.uid()` has a row in `platform_admins` | `security definer`, `search_path = ''` |
| `is_org_member(org)`             | current user has an `active` membership in `org`    | same                                   |
| `can_access_org(org)`            | admin or active member                              | same                                   |
| `shares_organization_with(user)` | both users have active memberships in a common org  | same                                   |
| `log_audit_event(...)`           | inserts an audit row with actor = `auth.uid()`      | same; raises if unauthenticated        |

Why `security definer`: the membership tables are themselves RLS-protected by policies that call these functions. Running the functions with definer rights breaks the recursion and keeps policies simple. The functions take no untrusted SQL and pin `search_path` to prevent hijacking.

## 5. Access matrix (RLS + grants)

Legend: ✔ allowed through RLS, ✖ denied, S = server-side only through `service_role`.

| Table                    | anon | customer user (active member)         | platform admin                              |
| ------------------------ | ---- | ------------------------------------- | ------------------------------------------- |
| organizations            | ✖    | select own org                        | select all, insert, update, delete          |
| profiles                 | ✖    | select self + co-members, update self | select all, update self                     |
| platform_admins          | ✖    | ✖                                     | select; insert/delete S                     |
| organization_memberships | ✖    | select within org                     | select all, insert, update, delete (also S) |
| jobs                     | ✖    | all within org                        | all within any org                          |
| candidates               | ✖    | all within org                        | all within any org                          |
| applications             | ✖    | all within org                        | all within any org                          |
| candidate_ai_insights    | ✖    | all within org                        | all within any org                          |
| audit_events             | ✖    | insert via `log_audit_event` only     | select; insert via function or S            |

`anon` has no privileges on any table in `public`. `authenticated` has table grants but every table has RLS enabled, so policies decide. Supabase's default privileges had also left `authenticated` with `TRUNCATE`, `REFERENCES`, `TRIGGER` and `MAINTAIN` on the hosted project (not governed by RLS); migration 0004 removed them and the API roles' default privileges on new tables (`docs/SECURITY.md` §8, applied 2026-10-20). `service_role` bypasses RLS and must only be used from server code behind an explicit `requirePlatformAdmin()` check.

## 6. Migration workflow

- Migrations live in `supabase/migrations/<timestamp>_<name>.sql` and are the only way the schema changes.
- Local verification: `pnpm db:verify` starts an embedded PostgreSQL 17 instance, applies `scripts/db/local-auth-shim.sql` (emulates `auth.users`, `auth.uid()` and the Supabase roles) and then all migrations, and runs the RLS test suite in `tests/db`.
- Hosted: `pnpm supabase:hosted link|list-remote|dry-run|push` (credentials from `.env.local`; `push` only with owner approval). Migrations 0001–0003 were applied to the hosted project on 2026-10-19, migration 0004 on 2026-10-20.
- Parity check: `pnpm db:fingerprint` prints a hash of the local schema; the same query (`scripts/db/schema-fingerprint.sql`) run read-only on the hosted project must return the same hash (ADR-026).
- Hosted-like verification: `TALENTFLOW_DB_HOSTED_LIKE=1 pnpm db:verify` emulates the default privileges measured on the hosted project (API roles receive `TRUNCATE, REFERENCES, TRIGGER, MAINTAIN` on every new table) and applies `supabase/proposed/*.sql` after the migrations, so the whole suite runs on the state a proposal would leave on the hosted project.
- Proposals: a migration that is written but not yet approved waits in `supabase/proposed/` with its own DB test; it moves to `supabase/migrations/` unchanged once approved. None pending (0004 was reviewed there and applied on 2026-10-20).
- Rollback strategy: forward-only migrations; a compensating migration is written for any change applied to the hosted project after customer data exists.

## 7. Known limitations / open points

- Customer users cannot invite colleagues themselves in the first release (platform admin does it). Adding an `owner` self-service invite is a later policy change.
- Soft delete is not modelled; deleting a job cascades to its applications. The UI will confirm before deleting.
- Candidate name search is a case-insensitive prefix/`ilike` match on `lower(full_name)`; adequate for the expected data size.
