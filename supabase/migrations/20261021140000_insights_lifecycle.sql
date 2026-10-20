-- AI Candidate Insights — lifecycle columns, tenant-safe application link, and run invariants
-- (migration 0007, ADR-035/036). Depends on migration 0006 (enum values must already be committed).
--
-- Adds to candidate_ai_insights the columns the job-match runner needs, ties each insight to the
-- application it was produced for through a composite (tenant-safe) foreign key, and enforces
-- "one active run per application" with a partial unique index. Table-level grants and the
-- organization-immutability / updated_at triggers from 0001 already cover the new columns.
--
-- Rollback (uncommented only with explicit approval):
--   drop index if exists public.candidate_ai_insights_one_active_per_application;
--   drop index if exists public.candidate_ai_insights_application_idx;
--   alter table public.candidate_ai_insights
--     drop constraint if exists candidate_ai_insights_application_same_tenant,
--     drop constraint if exists candidate_ai_insights_analysis_type_check,
--     drop column if exists application_id,
--     drop column if exists analysis_type,
--     drop column if exists input_hash,
--     drop column if exists cv_consent_at,
--     drop column if exists started_at,
--     drop column if exists attempt_count,
--     drop column if exists contract_version;
--   alter table public.applications drop constraint if exists applications_id_organization_unique;

-- A composite unique key so other tenant rows can reference an application through
-- (id, organization_id), matching the pattern used by jobs (jobs_id_organization_unique). This is
-- additive and does not change existing uniqueness (id is already the primary key).
alter table public.applications
  add constraint applications_id_organization_unique unique (id, organization_id);

alter table public.candidate_ai_insights
  -- The application this analysis is for. Nullable so the table can also hold candidate-profile
  -- insights later; the job-match runner always sets it. Composite FK keeps it in the same tenant.
  add column application_id uuid,
  -- Discriminates the workflow. Only 'job_match' is produced in this phase.
  add column analysis_type text not null default 'job_match',
  -- SHA-256 of (cv text + job text + prompt version). Detects same-input re-runs; not reversible.
  add column input_hash text,
  -- Snapshot of candidates.cv_ai_authorized_at at enqueue time, for auditability of the basis used.
  add column cv_consent_at timestamptz,
  -- When the row was claimed for processing (status -> analyzing).
  add column started_at timestamptz,
  -- Number of processing attempts (incremented on each atomic claim).
  add column attempt_count integer not null default 0,
  -- The output contract version the result was validated against (e.g. 'job-match-v1').
  add column contract_version text,
  add constraint candidate_ai_insights_analysis_type_check
    check (analysis_type in ('job_match', 'candidate_profile')),
  add constraint candidate_ai_insights_application_same_tenant
    foreign key (application_id, organization_id)
    references public.applications (id, organization_id) on delete cascade;

-- At most one in-flight (pending or analyzing) analysis per application: a duplicate enqueue hits
-- this and is swallowed as "already queued". Terminal rows (ready/failed/revoked/superseded) are not
-- covered, so history and retries are unaffected.
create unique index candidate_ai_insights_one_active_per_application
  on public.candidate_ai_insights (application_id)
  where status in ('pending', 'analyzing');

-- Latest-insight lookup for an application (the UI shows the most recent row).
create index candidate_ai_insights_application_idx
  on public.candidate_ai_insights (application_id, created_at desc);
