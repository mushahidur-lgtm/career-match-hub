-- Career Match Hub: only the owner's account may reach any data, and request limits shared by all server instances.
-- Run after 0001_init.sql: SQL Editor -> New query -> paste -> Run. It is safe to run twice.
--
-- AFTER running it, name the owner (use your own sign-in email), or nobody can read or write anything:
--   insert into private.app_owner (user_id) select id from auth.users where email = 'you@example.com';

-- Not exposed by the Supabase API, which serves only the public schema.
create schema if not exists private;
revoke all on schema private from public, anon;

-- At most one row.
create table if not exists private.app_owner (
  user_id  uuid    primary key references auth.users (id) on delete cascade,
  only_one boolean not null default true unique check (only_one)
);
alter table private.app_owner enable row level security;
revoke all on private.app_owner from public, anon, authenticated;

create or replace function private.is_owner() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from private.app_owner o where o.user_id = (select auth.uid())) $$;

revoke all on function private.is_owner() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_owner() to authenticated;

-- Table privileges: nothing for visitors, and for a signed-in person only the verbs the policies cover.
revoke all on public.user_data, public.daily_runs from public, anon, authenticated;
grant select, insert, update, delete on public.user_data to authenticated;
grant select, delete on public.daily_runs to authenticated;
grant all on public.user_data, public.daily_runs to service_role;
alter default privileges in schema public revoke all on tables from anon;

-- RESTRICTIVE: applied on top of the "own data" policies, so even another signed-up account gets nothing, and running
-- 0001 again cannot undo it.
drop policy if exists "owner only" on public.user_data;
drop policy if exists "owner only" on public.daily_runs;
create policy "owner only" on public.user_data  as restrictive for all using ((select private.is_owner())) with check ((select private.is_owner()));
create policy "owner only" on public.daily_runs as restrictive for all using ((select private.is_owner())) with check ((select private.is_owner()));

create table if not exists private.rate_limits (
  bucket         text        not null,
  window_seconds integer     not null,
  window_start   timestamptz not null,
  hits           integer     not null,
  primary key (bucket, window_seconds, window_start)
);
alter table private.rate_limits enable row level security;
revoke all on private.rate_limits from public, anon, authenticated;

-- Takes one call from a limit. True if it was within the limit. The window length is part of the key, so asking with a
-- different one starts a separate count and cannot reset an existing one.
create or replace function public.take_rate_limit(p_bucket text, p_max integer, p_window_seconds integer) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_start timestamptz;
  v_hits  integer;
begin
  if not private.is_owner() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_bucket is null or p_bucket !~ '^[a-z0-9-]{1,40}$'
     or p_max is null or p_max not between 1 and 1000
     or p_window_seconds is null or p_window_seconds not between 1 and 86400 then
    raise exception 'invalid limit' using errcode = '22023';
  end if;
  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into private.rate_limits as r (bucket, window_seconds, window_start, hits)
  values (p_bucket, p_window_seconds, v_start, 1)
  on conflict (bucket, window_seconds, window_start) do update set hits = r.hits + 1 where r.hits < p_max
  returning r.hits into v_hits;
  delete from private.rate_limits where window_start < now() - interval '2 days';
  return v_hits is not null;
end $$;

revoke all on function public.take_rate_limit(text, integer, integer) from public, anon;
grant execute on function public.take_rate_limit(text, integer, integer) to authenticated;
