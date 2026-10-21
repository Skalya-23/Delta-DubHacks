-- Delta: run once in the Supabase SQL Editor. Combines migrations 002-005; every part is safe to re-run.

-- ===== supabase/migrations/002_invites.sql =====
-- =============================================================================
-- Delta: invite links
-- Run once in the Supabase SQL Editor (after schema.sql). Safe to re-run.
-- =============================================================================

create table if not exists public.project_invites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  -- 64 random hex characters (two v4 UUIDs, ~244 bits of randomness)
  token text unique not null default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  revoked boolean not null default false
);

create index if not exists project_invites_project_idx on public.project_invites (project_id);

alter table public.project_invites enable row level security;

-- Only the project owner can see, create and revoke invite links.
drop policy if exists "invites: owner read" on public.project_invites;
drop policy if exists "invites: owner insert" on public.project_invites;
drop policy if exists "invites: owner update" on public.project_invites;
drop policy if exists "invites: owner delete" on public.project_invites;
create policy "invites: owner read" on public.project_invites
  for select to authenticated using (public.is_project_owner(project_id));
create policy "invites: owner insert" on public.project_invites
  for insert to authenticated with check (public.is_project_owner(project_id));
create policy "invites: owner update" on public.project_invites
  for update to authenticated using (public.is_project_owner(project_id)) with check (public.is_project_owner(project_id));
create policy "invites: owner delete" on public.project_invites
  for delete to authenticated using (public.is_project_owner(project_id));

-- What the person opening an invite link sees before joining.
create or replace function public.invite_preview(invite_token text)
returns table (project_name text, project_slug text, owner_username text, invited_by text, already_member boolean)
language sql stable security definer set search_path = public as $$
  select p.name, p.slug, owner.username, inviter.username,
         exists (select 1 from public.project_members m where m.project_id = p.id and m.user_id = auth.uid())
  from public.project_invites i
  join public.projects p on p.id = i.project_id
  join public.profiles owner on owner.id = p.owner_id
  left join public.profiles inviter on inviter.id = i.created_by
  where i.token = invite_token and not i.revoked and i.expires_at > now();
$$;

-- Join the project behind an invite link. Returns where to go next.
create or replace function public.accept_invite(invite_token text)
returns table (owner_username text, project_slug text)
language plpgsql security definer set search_path = public as $$
declare
  inv public.project_invites;
begin
  if auth.uid() is null then
    raise exception 'You need to be signed in to accept an invite.';
  end if;
  select * into inv from public.project_invites
  where token = invite_token and not revoked and expires_at > now();
  if inv.id is null then
    raise exception 'This invite link is invalid or has expired.';
  end if;
  insert into public.project_members (project_id, user_id, role)
  values (inv.project_id, auth.uid(), 'member')
  on conflict (project_id, user_id) do nothing;
  return query
    select owner.username, p.slug
    from public.projects p join public.profiles owner on owner.id = p.owner_id
    where p.id = inv.project_id;
end;
$$;

revoke all on function public.invite_preview(text) from public, anon;
revoke all on function public.accept_invite(text) from public, anon;
grant execute on function public.invite_preview(text) to authenticated;
grant execute on function public.accept_invite(text) to authenticated;

notify pgrst, 'reload schema';

-- ===== supabase/migrations/003_capture_sessions.sql =====
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

-- ===== supabase/migrations/004_session_summaries_and_questions.sql =====
-- =============================================================================
-- 004: AI session summaries + "Ask about this project"
-- Run after 003. Idempotent. schema.sql includes this.
--
-- Session summaries: when the Jetson stops a recording session it writes a short
-- Perceptron summary of what changed during it (and who made the changes).
-- Questions: the website inserts a question; the Jetson answers it with Perceptron
-- using the project's change history, and the website shows the answer live.
-- =============================================================================

alter table public.capture_sessions add column if not exists stopped_at timestamptz;
alter table public.capture_sessions add column if not exists change_count int;
alter table public.capture_sessions add column if not exists summary text;
alter table public.capture_sessions add column if not exists summary_state text
  check (summary_state in ('pending', 'ready', 'failed'));

create table if not exists public.project_questions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  asked_by uuid default auth.uid() references auth.users on delete set null,
  question text not null check (length(trim(question)) between 1 and 1000),
  answer text,
  state text not null default 'pending' check (state in ('pending', 'answered', 'failed')),
  created_at timestamptz default now(),
  answered_at timestamptz
);

create index if not exists project_questions_project_idx on public.project_questions (project_id, created_at desc);
create index if not exists project_questions_pending_idx on public.project_questions (state, created_at) where state = 'pending';

alter table public.project_questions enable row level security;

-- Members can read and ask; only the Jetson (secret key, bypasses RLS) writes answers.
drop policy if exists "questions: read" on public.project_questions;
drop policy if exists "questions: insert" on public.project_questions;
drop policy if exists "questions: delete own" on public.project_questions;
create policy "questions: read" on public.project_questions
  for select to authenticated using (public.is_project_member(project_id));
create policy "questions: insert" on public.project_questions
  for insert to authenticated
  with check (public.is_project_member(project_id) and asked_by = auth.uid() and state = 'pending' and answer is null);
create policy "questions: delete own" on public.project_questions
  for delete to authenticated using (asked_by = auth.uid());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'project_questions'
  ) then
    alter publication supabase_realtime add table public.project_questions;
  end if;
end;
$$;

notify pgrst, 'reload schema';

-- ===== supabase/migrations/005_invite_by_email.sql =====
-- =============================================================================
-- 005: invite by email
-- Run after 002. Idempotent. schema.sql includes this.
--
-- add_member_by_email: the project owner types an email. If someone already has an
-- account with that email they're added to the team right away and their username is
-- returned; otherwise it returns null and the website emails them an invite link instead.
-- Only the owner can call it, so it can't be used to probe which emails have accounts.
-- =============================================================================

create or replace function public.add_member_by_email(pid uuid, member_email text)
returns text language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
  uname text;
begin
  if not public.is_project_owner(pid) then
    raise exception 'Only the project owner can invite people.' using errcode = '42501';
  end if;
  select u.id into uid from auth.users u where lower(u.email) = lower(trim(member_email)) limit 1;
  if uid is null then
    return null;
  end if;
  insert into public.project_members (project_id, user_id, role)
  values (pid, uid, 'member')
  on conflict (project_id, user_id) do nothing;
  select username into uname from public.profiles where id = uid;
  return coalesce(uname, trim(member_email));
end;
$$;

revoke all on function public.add_member_by_email(uuid, text) from public, anon;
grant execute on function public.add_member_by_email(uuid, text) to authenticated;

notify pgrst, 'reload schema';
