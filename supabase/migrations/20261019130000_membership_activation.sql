-- TalentFlow ATS - migration 0003: self-service membership activation.
--
-- Invited users are created with membership status 'invited'. After they open their
-- one-time invitation link and set a password, the application calls this function so
-- the memberships that belong to the calling user become 'active'. It is SECURITY
-- DEFINER because members have no update policy on organization_memberships; it only
-- ever touches rows whose user_id is auth.uid(), so it cannot be used to activate or
-- alter anyone else's membership.

create function public.activate_my_memberships()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  update public.organization_memberships
     set status = 'active',
         updated_at = now()
   where user_id = auth.uid()
     and status = 'invited';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.activate_my_memberships() from public;
grant execute on function public.activate_my_memberships() to authenticated, service_role;
