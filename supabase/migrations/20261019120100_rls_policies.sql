-- TalentFlow ATS - migration 0002: authorization helpers, grants and RLS policies.
--
-- Model:
--   * Platform admins are rows in public.platform_admins (explicit, auditable).
--   * Customer users act through active rows in public.organization_memberships.
--   * public.can_access_org(org) is the single tenant predicate used by all
--     tenant-owned tables; it is true for platform admins and active members.
--   * Helper functions are SECURITY DEFINER so they can read the membership
--     tables without re-entering the policies that depend on them (no recursion).
--   * anon has no table privileges at all; authenticated goes through RLS;
--     service_role (server only) bypasses RLS and is used solely for provisioning.

-- Authorization helpers ------------------------------------------------------
create function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins pa where pa.user_id = auth.uid()
  );
$$;

create function public.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships m
    where m.organization_id = target_org
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create function public.can_access_org(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_platform_admin() or public.is_org_member(target_org);
$$;

create function public.shares_organization_with(other_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships mine
    join public.organization_memberships theirs
      on theirs.organization_id = mine.organization_id
    where mine.user_id = auth.uid()
      and mine.status = 'active'
      and theirs.user_id = other_user
      and theirs.status = 'active'
  );
$$;

-- Audit writes go through this function so the actor is always auth.uid() and
-- can never be spoofed by the caller.
create function public.log_audit_event(
  p_action text,
  p_organization_id uuid default null,
  p_target_type text default null,
  p_target_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  insert into public.audit_events (actor_user_id, organization_id, action, target_type, target_id, metadata)
  values (auth.uid(), p_organization_id, p_action, p_target_type, p_target_id, coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

-- Function privileges ---------------------------------------------------------
revoke all on function public.is_platform_admin() from public;
revoke all on function public.is_org_member(uuid) from public;
revoke all on function public.can_access_org(uuid) from public;
revoke all on function public.shares_organization_with(uuid) from public;
revoke all on function public.log_audit_event(text, uuid, text, text, jsonb) from public;

grant execute on function public.is_platform_admin() to authenticated, service_role;
grant execute on function public.is_org_member(uuid) to authenticated, service_role;
grant execute on function public.can_access_org(uuid) to authenticated, service_role;
grant execute on function public.shares_organization_with(uuid) to authenticated, service_role;
grant execute on function public.log_audit_event(text, uuid, text, text, jsonb) to authenticated, service_role;

-- Table privileges ------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- Provisioning tables are written only by server-side code using service_role.
revoke insert, update, delete on public.platform_admins from authenticated;
revoke insert, update, delete on public.audit_events from authenticated;
revoke insert, delete on public.profiles from authenticated;

-- Row level security ----------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.platform_admins enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.jobs enable row level security;
alter table public.candidates enable row level security;
alter table public.applications enable row level security;
alter table public.candidate_ai_insights enable row level security;
alter table public.audit_events enable row level security;

-- organizations: members read their own tenant; only platform admins manage tenants.
create policy organizations_select on public.organizations
  for select to authenticated
  using (public.can_access_org(id));
create policy organizations_insert on public.organizations
  for insert to authenticated
  with check (public.is_platform_admin());
create policy organizations_update on public.organizations
  for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());
create policy organizations_delete on public.organizations
  for delete to authenticated
  using (public.is_platform_admin());

-- profiles: a user sees themself, people who share a tenant with them, and admins see all.
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or public.is_platform_admin()
    or public.shares_organization_with(id)
  );
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- platform_admins: readable by admins only; writes happen server-side with service_role.
create policy platform_admins_select on public.platform_admins
  for select to authenticated
  using (public.is_platform_admin());

-- organization_memberships: visible inside the tenant; managed by platform admins.
create policy organization_memberships_select on public.organization_memberships
  for select to authenticated
  using (public.can_access_org(organization_id));
create policy organization_memberships_insert on public.organization_memberships
  for insert to authenticated
  with check (public.is_platform_admin());
create policy organization_memberships_update on public.organization_memberships
  for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());
create policy organization_memberships_delete on public.organization_memberships
  for delete to authenticated
  using (public.is_platform_admin());

-- Tenant-owned business data: full access inside the tenant, nothing outside it.
create policy jobs_tenant_access on public.jobs
  for all to authenticated
  using (public.can_access_org(organization_id))
  with check (public.can_access_org(organization_id));

create policy candidates_tenant_access on public.candidates
  for all to authenticated
  using (public.can_access_org(organization_id))
  with check (public.can_access_org(organization_id));

create policy applications_tenant_access on public.applications
  for all to authenticated
  using (public.can_access_org(organization_id))
  with check (public.can_access_org(organization_id));

create policy candidate_ai_insights_tenant_access on public.candidate_ai_insights
  for all to authenticated
  using (public.can_access_org(organization_id))
  with check (public.can_access_org(organization_id));

-- audit_events: platform admins read; inserts only via log_audit_event or service_role.
create policy audit_events_select on public.audit_events
  for select to authenticated
  using (public.is_platform_admin());
