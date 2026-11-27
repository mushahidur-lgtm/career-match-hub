-- Run in the Supabase SQL Editor after both migrations and after naming the owner. It changes nothing: everything is
-- inside a transaction that is rolled back. Each query says what it should return.

-- 1. Row-level security is on for every table this app can reach. Expected: no rows.
select schemaname, tablename from pg_tables where schemaname in ('public', 'private') and not rowsecurity;

-- 2. Visitors (anon) hold no table privileges in public. Expected: no rows.
select table_name, privilege_type from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public';

-- 3. No storage bucket is public. Expected: no rows. (This app creates no buckets at all.)
select id from storage.buckets where public;

-- 4. Exactly one owner is named. Expected: 1.
select count(*) as owners from private.app_owner;

-- 5. Every function visitors can run in public. Expected: nothing from this app (no take_rate_limit).
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute');

-- 6. Another signed-in account sees nothing. Expected: 0 and 0, then take_rate_limit fails with "not allowed".
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '99999999-9999-4999-8999-999999999999', true),
       set_config('request.jwt.claims', '{"sub":"99999999-9999-4999-8999-999999999999","role":"authenticated"}', true);
select count(*) as other_account_user_data from public.user_data;
select count(*) as other_account_daily_runs from public.daily_runs;
select public.take_rate_limit('search-jobs', 5, 60);
rollback;

-- 7. A visitor is refused outright. Expected: "permission denied".
begin;
set local role anon;
select * from public.user_data;
rollback;
