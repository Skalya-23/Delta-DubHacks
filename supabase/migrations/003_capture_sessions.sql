-- =============================================================================
-- 003: recording sessions (Start/Stop recording button <-> Jetson)
-- Safe to run on a database where capture_sessions was already created by hand
-- in the dashboard: every statement is idempotent. schema.sql includes this.
-- Status flow: requested -> recording -> stop_requested -> stopped (see supabase/README.md).
-- =============================================================================

create table if not exists public.capture_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  status text not null default 'requested'
    check (status in ('requested', 'recording', 'stop_requested', 'stopped')),
  started_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz default now()
);

-- Only one active session per project (the website handles the 23505 error).
create unique index if not exists capture_sessions_one_active_idx
  on public.capture_sessions (project_id)
  where status in ('requested', 'recording', 'stop_requested');

create index if not exists capture_sessions_status_idx on public.capture_sessions (status, created_at);

alter table public.capture_sessions enable row level security;

-- Members can see, start and stop sessions; the Jetson's secret key bypasses RLS.
drop policy if exists "capture_sessions: read" on public.capture_sessions;
drop policy if exists "capture_sessions: insert" on public.capture_sessions;
drop policy if exists "capture_sessions: update" on public.capture_sessions;
create policy "capture_sessions: read" on public.capture_sessions
  for select to authenticated using (public.is_project_member(project_id));
create policy "capture_sessions: insert" on public.capture_sessions
  for insert to authenticated with check (public.is_project_member(project_id));
create policy "capture_sessions: update" on public.capture_sessions
  for update to authenticated using (public.is_project_member(project_id)) with check (public.is_project_member(project_id));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'capture_sessions'
  ) then
    alter publication supabase_realtime add table public.capture_sessions;
  end if;
end;
$$;

notify pgrst, 'reload schema';
