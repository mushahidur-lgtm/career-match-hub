-- Career Match Hub: cloud sync and the daily run.
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- It is safe to run twice.

-- One row per person: their whole backup (resumes, applications, history, preferences).
create table if not exists public.user_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb       not null,
  -- Raised by one on every save. A save names the version it started from, so a second
  -- device can never silently overwrite the first.
  version    integer     not null default 1,
  updated_at timestamptz not null default now()
);

-- One row per morning's automatic search. Only the server writes these.
create table if not exists public.daily_runs (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid        not null references auth.users (id) on delete cascade,
  -- The calendar date in Toronto, so a run can happen only once per day.
  run_date date        not null,
  ran_at   timestamptz not null default now(),
  payload  jsonb       not null,
  unique (user_id, run_date)
);

create index if not exists daily_runs_user_ran_at on public.daily_runs (user_id, ran_at desc);

alter table public.user_data  enable row level security;
alter table public.daily_runs enable row level security;

-- You can see and change only your own data.
drop policy if exists "own data: read"   on public.user_data;
drop policy if exists "own data: insert" on public.user_data;
drop policy if exists "own data: update" on public.user_data;
drop policy if exists "own data: delete" on public.user_data;
create policy "own data: read"   on public.user_data for select using (auth.uid() = user_id);
create policy "own data: insert" on public.user_data for insert with check (auth.uid() = user_id);
create policy "own data: update" on public.user_data for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own data: delete" on public.user_data for delete using (auth.uid() = user_id);

-- You can read your daily runs, and nothing more. The service role (used only by the
-- server) bypasses these policies to write them. You can also delete your own, which
-- is what "delete my cloud data" does.
drop policy if exists "own runs: read"   on public.daily_runs;
drop policy if exists "own runs: delete" on public.daily_runs;
create policy "own runs: read"   on public.daily_runs for select using (auth.uid() = user_id);
create policy "own runs: delete" on public.daily_runs for delete using (auth.uid() = user_id);
