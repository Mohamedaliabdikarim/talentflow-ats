-- TalentFlow ATS - migration 0005: candidate CV (PDF) metadata and AI-use consent.
--
-- The PDF itself lives in a PRIVATE Supabase Storage bucket (candidate-cvs); only metadata
-- is stored here, tenant-scoped like every other candidate field. The storage bucket and its
-- RLS policies are provisioned separately (supabase/storage/candidate-cvs.sql, docs/SECURITY.md
-- §9) because they live in the storage schema, which the local embedded database does not have.
--
-- Consent rule (docs/SECURITY.md §9): a recruiter uploading a candidate-provided CV does NOT
-- grant permission to analyse it with AI. cv_ai_authorized starts false and must be recorded
-- explicitly (who, when, basis); it can be revoked. A check keeps authorization impossible
-- without a CV present. No AI analysis is implemented in this phase.

alter table public.candidates
  add column cv_object_key text,
  add column cv_filename text,
  add column cv_size_bytes integer,
  add column cv_uploaded_at timestamptz,
  add column cv_uploaded_by uuid references auth.users (id) on delete set null,
  add column cv_source text,
  add column cv_ai_authorized boolean not null default false,
  add column cv_ai_authorized_at timestamptz,
  add column cv_ai_authorized_by uuid references auth.users (id) on delete set null,
  add column cv_ai_authorization_basis text;

alter table public.candidates
  -- The object key is server-generated as "<organization_id>/<candidate_id>/<random>.pdf";
  -- it never contains a name, email or other personal data.
  add constraint candidates_cv_object_key_length
    check (cv_object_key is null or char_length(cv_object_key) <= 400),
  add constraint candidates_cv_filename_length
    check (cv_filename is null or char_length(cv_filename) between 1 and 255),
  -- 10 MB upload limit, mirrored in validation and the bucket configuration.
  add constraint candidates_cv_size_bytes_range
    check (cv_size_bytes is null or (cv_size_bytes > 0 and cv_size_bytes <= 10485760)),
  add constraint candidates_cv_source_allowed
    check (cv_source is null or cv_source in ('candidate_provided_recruiter_upload')),
  add constraint candidates_cv_ai_basis_length
    check (cv_ai_authorization_basis is null or char_length(cv_ai_authorization_basis) <= 500),
  -- A CV's file columns are all-present or all-absent, so the UI never shows a half-record.
  add constraint candidates_cv_metadata_consistent
    check (
      (cv_object_key is null and cv_filename is null and cv_size_bytes is null
        and cv_uploaded_at is null and cv_source is null)
      or
      (cv_object_key is not null and cv_filename is not null and cv_size_bytes is not null
        and cv_uploaded_at is not null and cv_source is not null)
    ),
  -- AI use cannot be authorized unless a CV is actually present (consent rule).
  add constraint candidates_cv_ai_requires_cv
    check (cv_ai_authorized = false or cv_object_key is not null),
  -- When authorized, who and when are recorded; when not, those stay empty.
  add constraint candidates_cv_ai_authorization_consistent
    check (
      (cv_ai_authorized = true and cv_ai_authorized_at is not null)
      or
      (cv_ai_authorized = false and cv_ai_authorized_at is null and cv_ai_authorized_by is null
        and cv_ai_authorization_basis is null)
    );
