-- Canonical fingerprint of the public schema: one line per object, hashed in sorted order.
-- Run the same query against the local embedded database and the hosted project; equal
-- hashes mean identical tables, columns, defaults, constraints, indexes, RLS flags,
-- policies, functions, enums and triggers. Read-only.
with objects as (
  select 'column:' || c.relname || ':' || a.attname || ':' || format_type(a.atttypid, a.atttypmod)
         || ':' || a.attnotnull || ':' || coalesce(pg_get_expr(d.adbin, d.adrelid), '') || ':' || a.attidentity::text as line
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
   where n.nspname = 'public' and c.relkind = 'r'
  union all
  select 'rls:' || c.relname || ':' || c.relrowsecurity || ':' || c.relforcerowsecurity
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
  union all
  select 'policy:' || tablename || ':' || policyname || ':' || cmd || ':' || permissive || ':'
         || coalesce(array_to_string(roles, ','), '') || ':' || coalesce(qual, '') || ':' || coalesce(with_check, '')
    from pg_policies where schemaname = 'public'
  union all
  select 'constraint:' || conrelid::regclass::text || ':' || conname || ':' || pg_get_constraintdef(oid)
    from pg_constraint where connamespace = 'public'::regnamespace
  union all
  select 'index:' || indexname || ':' || indexdef from pg_indexes where schemaname = 'public'
  union all
  select 'function:' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || '):' || p.prosecdef
         || ':' || pg_get_function_result(p.oid) || ':' || coalesce(array_to_string(p.proconfig, ','), '')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     -- Supabase creates rls_auto_enable() in new projects; it is not part of the migrations.
     and p.proname <> 'rls_auto_enable'
  union all
  select 'enum:' || t.typname || ':' || string_agg(e.enumlabel, ',' order by e.enumsortorder)
    from pg_type t join pg_enum e on e.enumtypid = t.oid join pg_namespace n on n.oid = t.typnamespace
   where n.nspname = 'public' group by t.typname
  union all
  select 'trigger:' || c.relname || ':' || t.tgname || ':' || pg_get_triggerdef(t.oid)
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and not t.tgisinternal
  union all
  select 'auth_trigger:' || t.tgname || ':' || pg_get_triggerdef(t.oid)
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'auth' and c.relname = 'users' and t.tgname like 'on_auth_user_%'
)
select md5(string_agg(line, E'\n' order by line)) as fingerprint,
       count(*) as objects,
       count(*) filter (where line like 'column:%') as columns,
       count(*) filter (where line like 'policy:%') as policies,
       count(*) filter (where line like 'function:%') as functions,
       count(*) filter (where line like 'trigger:%') as triggers,
       count(*) filter (where line like 'auth_trigger:%') as auth_triggers,
       count(*) filter (where line like 'rls:%:true:%') as rls_enabled_tables
  from objects;
