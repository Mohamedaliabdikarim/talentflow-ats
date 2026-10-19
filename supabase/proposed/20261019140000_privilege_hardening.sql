-- TalentFlow ATS - PROPOSED migration 0004: privilege hardening after the first hosted push.
--
-- Findings from the read-only verification of project zcxmyaxpftzwpzvmhslm (2026-10-19):
--   * Supabase's default privileges had granted `authenticated` TRUNCATE, REFERENCES and
--     TRIGGER on every public table before migration 0002 ran. Row level security does not
--     govern TRUNCATE, so these are revoked, and the schema defaults are changed so future
--     tables never receive them.
--   * The trigger function sync_profile_from_auth_user() was executable by anon and
--     authenticated over RPC (trigger functions cannot run outside a trigger, but the
--     security advisor flags it). EXECUTE is now limited to the Auth service role.
--   * Supabase's own rls_auto_enable() is executable by anon and authenticated; revoked
--     when the function exists and we own it (otherwise a notice, not a failure).
--
-- This file lives in supabase/proposed/ and is NOT applied by `db push`. It moves to
-- supabase/migrations/ only with the owner's approval. Local verification:
-- tests/db/privilege-hardening.test.ts (emulates Supabase's default grants first).

revoke truncate, references, trigger on all tables in schema public from authenticated;
alter default privileges in schema public revoke truncate, references, trigger on tables from authenticated;
alter default privileges in schema public revoke all on tables from anon;

revoke all on function public.sync_profile_from_auth_user() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function public.sync_profile_from_auth_user() to supabase_auth_admin;
  end if;

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
