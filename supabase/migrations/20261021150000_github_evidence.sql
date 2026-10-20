-- GitHub profile evidence for Candidate Insights (migration 0008, ADR-038).
--
-- Adds a separate, explicit AI-use authorization for the candidate's GitHub profile (mirroring
-- the CV consent columns from 0005) and evidence-provenance columns on candidate_ai_insights so
-- every stored result records which sources it used. Additive only; existing rows get defaults.
-- Table-level grants and the organization-immutability / updated_at triggers already cover the
-- new columns.
--
-- Rollback (uncommented only with explicit approval):
--   drop index if exists public.candidate_ai_insights_github_evidence_idx;
--   alter table public.candidate_ai_insights
--     drop constraint if exists candidate_ai_insights_github_login_length,
--     drop constraint if exists candidate_ai_insights_github_status_allowed,
--     drop constraint if exists candidate_ai_insights_evidence_sources_allowed,
--     drop column if exists github_fetched_at,
--     drop column if exists github_status,
--     drop column if exists github_login,
--     drop column if exists evidence_sources;
--   alter table public.candidates
--     drop constraint if exists candidates_github_ai_authorization_consistent,
--     drop constraint if exists candidates_github_ai_requires_url,
--     drop constraint if exists candidates_github_ai_basis_length,
--     drop column if exists github_ai_authorization_basis,
--     drop column if exists github_ai_authorized_by,
--     drop column if exists github_ai_authorized_at,
--     drop column if exists github_ai_authorized;

alter table public.candidates
  -- Explicit authorization to use the candidate's public GitHub profile as AI evidence. Never
  -- inferred from the URL being present; defaults to false; revocable; reset when the URL changes.
  add column github_ai_authorized boolean not null default false,
  add column github_ai_authorized_at timestamptz,
  add column github_ai_authorized_by uuid references auth.users (id) on delete set null,
  add column github_ai_authorization_basis text,
  add constraint candidates_github_ai_basis_length
    check (github_ai_authorization_basis is null or char_length(github_ai_authorization_basis) <= 500),
  -- An authorization covers one exact profile, so it cannot exist without a URL.
  add constraint candidates_github_ai_requires_url
    check (github_ai_authorized = false or github_url is not null),
  -- When authorized, who and when are recorded; when not, those stay empty.
  add constraint candidates_github_ai_authorization_consistent
    check (
      (github_ai_authorized = true and github_ai_authorized_at is not null)
      or
      (github_ai_authorized = false and github_ai_authorized_at is null
        and github_ai_authorized_by is null and github_ai_authorization_basis is null)
    );

alter table public.candidate_ai_insights
  -- Which evidence kinds a run used: planned sources at claim time, actual sources at persist.
  add column evidence_sources text[] not null default '{}',
  -- The exact login the run used (attribution and audit); never a guessed account.
  add column github_login text,
  -- Why GitHub evidence was or was not included; shown to the reviewer.
  add column github_status text,
  add column github_fetched_at timestamptz,
  add constraint candidate_ai_insights_evidence_sources_allowed
    check (evidence_sources <@ array['cv', 'github']::text[]),
  add constraint candidate_ai_insights_github_status_allowed
    check (
      github_status is null
      or github_status in (
        'not_provided', 'invalid_url', 'not_authorized', 'included',
        'not_found', 'rate_limited', 'unavailable', 'withdrawn'
      )
    ),
  add constraint candidate_ai_insights_github_login_length
    check (github_login is null or char_length(github_login) <= 39);

-- Revoking GitHub authorization invalidates only GitHub-sourced insights of the candidate.
create index candidate_ai_insights_github_evidence_idx
  on public.candidate_ai_insights (candidate_id)
  where 'github' = any (evidence_sources);
