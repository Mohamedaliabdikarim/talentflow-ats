-- TalentFlow ATS - PRIVATE Storage bucket for candidate CVs. HOSTED SETUP ONLY.
--
-- This is NOT a database migration and is NOT applied by `pnpm supabase:hosted push`: it
-- touches the `storage` schema, which exists only on a real Supabase project, not in the
-- local embedded PostgreSQL used by `pnpm db:verify`. Apply it once, with the owner's
-- explicit approval, in the hosted project's SQL editor (or via the Management API).
-- Rollback and verification: docs/SECURITY.md §9.
--
-- Isolation model: object keys are "<organization_id>/<candidate_id>/<random>.pdf". Every
-- policy authorizes on the FIRST path segment (the organization id) through the same
-- can_access_org() helper the tables use, so a user can only touch CV objects of an
-- organization they belong to, and a platform admin can touch any (can_access_org returns
-- true for admins). The bucket is private: there are no public URLs; the app streams files
-- through the server after an authorization check.

-- 1. Private bucket, PDF only, 10 MB limit (mirrors the migration and the validation module).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('candidate-cvs', 'candidate-cvs', false, 10485760, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2. Row level security on storage.objects, scoped to this bucket and the owning tenant.
create policy "candidate_cvs_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'candidate-cvs'
    and public.can_access_org((storage.foldername(name))[1]::uuid)
  );

create policy "candidate_cvs_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'candidate-cvs'
    and public.can_access_org((storage.foldername(name))[1]::uuid)
  );

create policy "candidate_cvs_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'candidate-cvs'
    and public.can_access_org((storage.foldername(name))[1]::uuid)
  )
  with check (
    bucket_id = 'candidate-cvs'
    and public.can_access_org((storage.foldername(name))[1]::uuid)
  );

create policy "candidate_cvs_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'candidate-cvs'
    and public.can_access_org((storage.foldername(name))[1]::uuid)
  );

-- Rollback:
--   drop policy "candidate_cvs_select" on storage.objects;
--   drop policy "candidate_cvs_insert" on storage.objects;
--   drop policy "candidate_cvs_update" on storage.objects;
--   drop policy "candidate_cvs_delete" on storage.objects;
--   delete from storage.buckets where id = 'candidate-cvs';  -- only when the bucket is empty
