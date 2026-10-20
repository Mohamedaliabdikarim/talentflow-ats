-- TalentFlow ATS - PROPOSED migration 0004: privilege hardening after the first hosted push.
-- Review for the owner: docs/PRIVILEGE_HARDENING_REVIEW.md. This file lives in
-- supabase/proposed/ and is NOT applied by `db push`; it moves to supabase/migrations/
-- unchanged only with the owner's approval. Requires PostgreSQL 17 (MAINTAIN privilege).
--
-- Measured read-only on project zcxmyaxpftzwpzvmhslm (2026-10-19/20):
--   * Supabase's per-schema default privileges for the migration role (postgres) give the API
--     roles TRUNCATE, REFERENCES, TRIGGER and MAINTAIN ("Dxtm") on every table created in
--     public. Migration 0002 granted the designed DML on top and revoked everything from
--     anon, so `authenticated` holds all eight privileges on all nine tables. Row level
--     security never governs TRUNCATE; MAINTAIN allows LOCK TABLE, VACUUM and REINDEX.
--   * sync_profile_from_auth_user() (SECURITY DEFINER trigger function) is executable by
--     anon and authenticated through PostgreSQL's built-in PUBLIC default (advisor WARN).
--   * rls_auto_enable() is the function behind Supabase's `ensure_rls` event trigger; on this
--     project it is owned by postgres and executable by PUBLIC (advisor WARN).
--
-- Local verification: tests/db/privilege-hardening.test.ts (reproduces the measured hosted
-- state first) and `TALENTFLOW_DB_HOSTED_LIKE=1 pnpm db:verify` (whole suite on that state).

-- 1. Existing tables: authenticated keeps exactly the SELECT/INSERT/UPDATE/DELETE that
--    migration 0002 granted; the privileges RLS cannot govern go. service_role is server-only,
--    bypasses RLS and is left unchanged on existing tables.
revoke truncate, references, trigger, maintain on all tables in schema public from authenticated;

-- 2. Future tables: remove Supabase's per-schema defaults for all three API roles, so a table
--    created by a later migration starts with no API-role privileges, exactly as it does in
--    the local embedded PostgreSQL. Every migration grants what it needs explicitly (0002
--    does). A per-schema REVOKE only reverses a per-schema GRANT, which is what these are.
alter default privileges in schema public revoke all on tables from anon, authenticated, service_role;

-- 3. The auth.users -> profiles trigger function: executable by its owner and the Auth
--    service role only. PostgreSQL does not check EXECUTE when a trigger fires (verified on
--    PostgreSQL 17, see the review), so the grant is belt and braces for GoTrue's role.
revoke all on function public.sync_profile_from_auth_user() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function public.sync_profile_from_auth_user() to supabase_auth_admin;
  end if;

  -- 4. Supabase's rls_auto_enable(): remove API-role execution. Event triggers fire without an
  --    EXECUTE check (verified), so `ensure_rls` keeps enabling RLS on new tables. If a project
  --    does not own the function, PostgreSQL raises insufficient_privilege, which is swallowed.
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    begin
      revoke all on function public.rls_auto_enable() from public, anon, authenticated;
    exception when insufficient_privilege then
      raise notice 'rls_auto_enable() is not owned by this role; leaving its privileges unchanged';
    end;
  end if;
end
$$;
