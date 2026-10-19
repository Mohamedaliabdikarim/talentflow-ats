-- TalentFlow ATS - migration 0001: core multi-tenant schema.
--
-- Why this shape:
--   * Every tenant-owned table carries organization_id so row level security can
--     be expressed with one predicate (public.can_access_org) instead of joins.
--   * applications and candidate_ai_insights reference jobs and candidates through
--     composite keys (id, organization_id), so the database itself refuses links
--     that would cross a tenant boundary.
--   * organization_id is immutable after insert (trigger), so an update can never
--     move a row into another tenant.
-- Access matrix and rationale: docs/DATABASE.md.

-- Enumerations ---------------------------------------------------------------
create type public.organization_status as enum ('active', 'suspended');
create type public.membership_role as enum ('owner', 'member');
create type public.membership_status as enum ('invited', 'active', 'disabled');
create type public.job_status as enum ('draft', 'open', 'closed');
create type public.application_stage as enum ('new', 'screening', 'interview', 'offer', 'hired', 'rejected');
create type public.insight_status as enum ('pending', 'completed', 'failed');

-- Trigger helpers ------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create function public.prevent_organization_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create function public.touch_stage_changed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.stage is distinct from old.stage then
    new.stage_changed_at := now();
  end if;
  return new;
end;
$$;

-- Tables ---------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  status public.organization_status not null default 'active',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_name_length check (char_length(name) between 2 and 120),
  constraint organizations_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 2 and 60),
  constraint organizations_slug_unique unique (slug)
);

-- Application-level mirror of auth.users; kept in sync by trigger below.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_full_name_length check (char_length(full_name) <= 160)
);

-- Explicit platform-wide authority. Membership here is the only source of admin
-- rights; JWT claims and client state are never trusted for this.
create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  note text,
  constraint platform_admins_note_length check (note is null or char_length(note) <= 500)
);

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.membership_role not null default 'member',
  status public.membership_status not null default 'invited',
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_memberships_unique unique (organization_id, user_id)
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null,
  description text not null default '',
  location text,
  employment_type text,
  status public.job_status not null default 'open',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jobs_title_length check (char_length(title) between 2 and 160),
  constraint jobs_description_length check (char_length(description) <= 20000),
  constraint jobs_location_length check (location is null or char_length(location) <= 120),
  constraint jobs_employment_type_length check (employment_type is null or char_length(employment_type) <= 60),
  -- Composite key target for cross-tenant-safe references from applications.
  constraint jobs_id_organization_unique unique (id, organization_id)
);

create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  headline text,
  location text,
  linkedin_url text,
  github_url text,
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint candidates_full_name_length check (char_length(full_name) between 2 and 160),
  constraint candidates_email_format check (email is null or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint candidates_phone_length check (phone is null or char_length(phone) <= 40),
  constraint candidates_headline_length check (headline is null or char_length(headline) <= 160),
  constraint candidates_location_length check (location is null or char_length(location) <= 120),
  constraint candidates_linkedin_url_format check (linkedin_url is null or linkedin_url ~* '^https://([a-z]{2,3}\.)?linkedin\.com/[^[:space:]]+$'),
  constraint candidates_github_url_format check (github_url is null or github_url ~* '^https://github\.com/[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?/?$'),
  constraint candidates_notes_length check (notes is null or char_length(notes) <= 10000),
  constraint candidates_id_organization_unique unique (id, organization_id)
);

-- One candidate may apply to many jobs; the application carries the pipeline stage.
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  job_id uuid not null,
  candidate_id uuid not null,
  stage public.application_stage not null default 'new',
  stage_changed_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint applications_job_candidate_unique unique (job_id, candidate_id),
  constraint applications_job_same_tenant foreign key (job_id, organization_id)
    references public.jobs (id, organization_id) on delete cascade,
  constraint applications_candidate_same_tenant foreign key (candidate_id, organization_id)
    references public.candidates (id, organization_id) on delete cascade
);

-- Optional, advisory AI output. Raw CV text is never stored here (see docs/AI_FEATURE.md).
create table public.candidate_ai_insights (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  candidate_id uuid not null,
  job_id uuid,
  status public.insight_status not null default 'pending',
  summary text,
  result jsonb,
  source_urls text[] not null default '{}',
  model_version text,
  prompt_version text,
  human_review_required boolean not null default true,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  error_message text,
  generated_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint candidate_ai_insights_candidate_same_tenant foreign key (candidate_id, organization_id)
    references public.candidates (id, organization_id) on delete cascade,
  constraint candidate_ai_insights_job_same_tenant foreign key (job_id, organization_id)
    references public.jobs (id, organization_id) on delete cascade
);

-- Security-relevant actions only. Never store candidate content in metadata.
create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users (id) on delete set null,
  organization_id uuid references public.organizations (id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_events_action_format check (action ~ '^[a-z_]+\.[a-z_]+$'),
  constraint audit_events_metadata_size check (pg_column_size(metadata) <= 8192)
);

-- Indexes --------------------------------------------------------------------
create index organization_memberships_user_idx on public.organization_memberships (user_id) where status = 'active';
create index jobs_organization_status_idx on public.jobs (organization_id, status);
create index candidates_organization_idx on public.candidates (organization_id);
create index candidates_name_search_idx on public.candidates (organization_id, lower(full_name) text_pattern_ops);
create index applications_organization_stage_idx on public.applications (organization_id, stage);
create index applications_job_idx on public.applications (job_id);
create index applications_candidate_idx on public.applications (candidate_id);
create index candidate_ai_insights_candidate_idx on public.candidate_ai_insights (candidate_id);
create index audit_events_organization_created_idx on public.audit_events (organization_id, created_at desc);

-- Triggers -------------------------------------------------------------------
create trigger organizations_set_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger organization_memberships_set_updated_at before update on public.organization_memberships
  for each row execute function public.set_updated_at();
create trigger jobs_set_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();
create trigger candidates_set_updated_at before update on public.candidates
  for each row execute function public.set_updated_at();
create trigger applications_set_updated_at before update on public.applications
  for each row execute function public.set_updated_at();
create trigger candidate_ai_insights_set_updated_at before update on public.candidate_ai_insights
  for each row execute function public.set_updated_at();

create trigger organization_memberships_lock_organization before update on public.organization_memberships
  for each row execute function public.prevent_organization_change();
create trigger jobs_lock_organization before update on public.jobs
  for each row execute function public.prevent_organization_change();
create trigger candidates_lock_organization before update on public.candidates
  for each row execute function public.prevent_organization_change();
create trigger applications_lock_organization before update on public.applications
  for each row execute function public.prevent_organization_change();
create trigger candidate_ai_insights_lock_organization before update on public.candidate_ai_insights
  for each row execute function public.prevent_organization_change();

create trigger applications_touch_stage_changed_at before update on public.applications
  for each row execute function public.touch_stage_changed_at();

-- Profile sync from Supabase Auth ---------------------------------------------
-- SECURITY DEFINER because auth.users triggers run as the auth admin role, which
-- has no privileges on public.profiles.
create function public.sync_profile_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.sync_profile_from_auth_user();
create trigger on_auth_user_email_updated after update of email on auth.users
  for each row execute function public.sync_profile_from_auth_user();
