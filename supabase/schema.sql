-- =============================================================================
-- Physical Git: full Supabase schema
-- Paste into the Supabase SQL Editor and run once on a fresh project.
-- =============================================================================

-- gen_random_uuid() is built into Postgres 13+, no extension needed.

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique not null,
  display_name text,
  created_at timestamptz default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  name text not null,
  slug text not null,
  description text,
  readme text default '',
  live_stream_url text,
  active_user_id uuid references auth.users on delete set null,
  created_at timestamptz default now(),
  unique (owner_id, slug)
);

create table public.project_members (
  project_id uuid references public.projects on delete cascade,
  user_id uuid references auth.users on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  primary key (project_id, user_id)
);

create table public.commits (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  seq int not null,
  author_id uuid references auth.users on delete set null,
  title text,
  mk1_summary text,
  objects_before jsonb not null default '[]',
  objects_after jsonb not null default '[]',
  changes jsonb not null default '[]',
  processing_state text not null default 'pending'
    check (processing_state in ('pending', 'described', 'failed')),
  status text not null default 'untested'
    check (status in ('untested', 'working', 'broken')),
  is_hidden boolean not null default false,
  user_description text default '',
  captured_at timestamptz not null default now(),
  created_at timestamptz default now(),
  unique (project_id, seq)
);

create table public.frames (
  id uuid primary key default gen_random_uuid(),
  commit_id uuid not null references public.commits on delete cascade,
  project_id uuid not null references public.projects on delete cascade,
  kind text not null check (kind in ('before', 'after', 'sequence')),
  frame_index int not null default 0,
  storage_path text not null,
  width int,
  height int,
  captured_at timestamptz default now()
);

create table public.commit_notes (
  id uuid primary key default gen_random_uuid(),
  commit_id uuid not null references public.commits on delete cascade,
  project_id uuid not null references public.projects on delete cascade,
  author_id uuid not null default auth.uid() references auth.users on delete cascade,
  body text not null,
  created_at timestamptz default now()
);

create table public.checkpoints (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  commit_id uuid not null references public.commits on delete cascade,
  name text not null,
  description text default '',
  photo_path text,
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz default now(),
  unique (project_id, name)
);

create table public.project_docs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  title text not null,
  body text default '',
  updated_by uuid default auth.uid() references auth.users on delete set null,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------

create index commits_project_captured_idx on public.commits (project_id, captured_at desc);
create index frames_commit_idx on public.frames (commit_id);
create index frames_project_kind_idx on public.frames (project_id, kind);
create index commit_notes_commit_idx on public.commit_notes (commit_id);
create index checkpoints_project_idx on public.checkpoints (project_id);
create index checkpoints_commit_idx on public.checkpoints (commit_id);
create index project_docs_project_idx on public.project_docs (project_id);
create index project_members_user_idx on public.project_members (user_id);

-- -----------------------------------------------------------------------------
-- Helper functions (security definer avoids RLS recursion)
-- -----------------------------------------------------------------------------

create or replace function public.is_project_member(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.project_members where project_id = pid and user_id = auth.uid());
$$;

create or replace function public.is_project_owner(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.projects where id = pid and owner_id = auth.uid());
$$;

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------

-- Create a profile for every new auth user. If the username is taken, add a short suffix.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base text;
  candidate text;
begin
  base := lower(coalesce(nullif(trim(new.raw_user_meta_data->>'username'), ''), split_part(new.email, '@', 1), 'user'));
  base := regexp_replace(base, '[^a-z0-9_-]', '-', 'g');
  if base = '' then base := 'user'; end if;
  candidate := base;
  if exists (select 1 from public.profiles where username = candidate) then
    candidate := base || '-' || substr(replace(new.id::text, '-', ''), 1, 4);
  end if;
  insert into public.profiles (id, username, display_name)
  values (new.id, candidate, coalesce(new.raw_user_meta_data->>'display_name', candidate));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for anyone who signed up before this schema was run.
insert into public.profiles (id, username, display_name)
select
  u.id,
  regexp_replace(lower(coalesce(nullif(trim(u.raw_user_meta_data->>'username'), ''), split_part(u.email, '@', 1), 'user')), '[^a-z0-9_-]', '-', 'g')
    || '-' || substr(replace(u.id::text, '-', ''), 1, 4),
  coalesce(u.raw_user_meta_data->>'username', split_part(u.email, '@', 1))
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

-- Prefer the plain username when it isn't taken.
update public.profiles p
set username = regexp_replace(p.username, '-[0-9a-f]{4}$', '')
where p.username ~ '-[0-9a-f]{4}$'
  and not exists (select 1 from public.profiles q where q.username = regexp_replace(p.username, '-[0-9a-f]{4}$', ''));

-- Add the project owner as an 'owner' member.
create or replace function public.handle_new_project()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.project_members (project_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (project_id, user_id) do update set role = 'owner';
  return new;
end;
$$;

create trigger on_project_created
  after insert on public.projects
  for each row execute function public.handle_new_project();

-- Number commits per project and attribute them to whoever is at the bench.
create or replace function public.handle_new_commit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Serialize inserts per project so two simultaneous commits never get the same seq.
  perform pg_advisory_xact_lock(hashtext(new.project_id::text));
  select coalesce(max(seq), 0) + 1 into new.seq from public.commits where project_id = new.project_id;
  if new.author_id is null then
    select active_user_id into new.author_id from public.projects where id = new.project_id;
  end if;
  return new;
end;
$$;

create trigger on_commit_insert
  before insert on public.commits
  for each row execute function public.handle_new_commit();

-- Keep project_docs.updated_at fresh.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger project_docs_touch
  before update on public.project_docs
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.commits enable row level security;
alter table public.frames enable row level security;
alter table public.commit_notes enable row level security;
alter table public.checkpoints enable row level security;
alter table public.project_docs enable row level security;

-- profiles
create policy "profiles: read" on public.profiles
  for select to authenticated using (true);
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- projects
-- (owner_id check lets INSERT ... RETURNING work before the membership trigger has run)
create policy "projects: read" on public.projects
  for select to authenticated using (owner_id = auth.uid() or public.is_project_member(id));
create policy "projects: insert" on public.projects
  for insert to authenticated with check (owner_id = auth.uid());
create policy "projects: update" on public.projects
  for update to authenticated using (public.is_project_member(id)) with check (public.is_project_member(id));
create policy "projects: delete" on public.projects
  for delete to authenticated using (owner_id = auth.uid());

-- project_members
create policy "members: read" on public.project_members
  for select to authenticated using (public.is_project_member(project_id));
create policy "members: insert by owner" on public.project_members
  for insert to authenticated with check (public.is_project_owner(project_id));
create policy "members: delete by owner" on public.project_members
  for delete to authenticated using (public.is_project_owner(project_id));

-- commits, frames, checkpoints, project_docs: full access for members
create policy "commits: read" on public.commits
  for select to authenticated using (public.is_project_member(project_id));
create policy "commits: insert" on public.commits
  for insert to authenticated with check (public.is_project_member(project_id));
create policy "commits: update" on public.commits
  for update to authenticated using (public.is_project_member(project_id)) with check (public.is_project_member(project_id));
create policy "commits: delete" on public.commits
  for delete to authenticated using (public.is_project_member(project_id));

create policy "frames: read" on public.frames
  for select to authenticated using (public.is_project_member(project_id));
create policy "frames: insert" on public.frames
  for insert to authenticated with check (public.is_project_member(project_id));
create policy "frames: update" on public.frames
  for update to authenticated using (public.is_project_member(project_id)) with check (public.is_project_member(project_id));
create policy "frames: delete" on public.frames
  for delete to authenticated using (public.is_project_member(project_id));

create policy "checkpoints: read" on public.checkpoints
  for select to authenticated using (public.is_project_member(project_id));
create policy "checkpoints: insert" on public.checkpoints
  for insert to authenticated with check (public.is_project_member(project_id));
create policy "checkpoints: update" on public.checkpoints
  for update to authenticated using (public.is_project_member(project_id)) with check (public.is_project_member(project_id));
create policy "checkpoints: delete" on public.checkpoints
  for delete to authenticated using (public.is_project_member(project_id));

create policy "docs: read" on public.project_docs
  for select to authenticated using (public.is_project_member(project_id));
create policy "docs: insert" on public.project_docs
  for insert to authenticated with check (public.is_project_member(project_id));
create policy "docs: update" on public.project_docs
  for update to authenticated using (public.is_project_member(project_id)) with check (public.is_project_member(project_id));
create policy "docs: delete" on public.project_docs
  for delete to authenticated using (public.is_project_member(project_id));

-- commit_notes
create policy "notes: read" on public.commit_notes
  for select to authenticated using (public.is_project_member(project_id));
create policy "notes: insert" on public.commit_notes
  for insert to authenticated with check (public.is_project_member(project_id) and author_id = auth.uid());
create policy "notes: update own" on public.commit_notes
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "notes: delete own" on public.commit_notes
  for delete to authenticated using (author_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Storage: private "frames" bucket
-- Paths: {project_id}/{commit_id}/{kind}_{frame_index}.jpg
--        {project_id}/checkpoints/{checkpoint_id}.jpg
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('frames', 'frames', false)
on conflict (id) do nothing;

create policy "frames bucket: read" on storage.objects
  for select to authenticated
  using (bucket_id = 'frames' and public.is_project_member(((storage.foldername(name))[1])::uuid));

create policy "frames bucket: insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'frames' and public.is_project_member(((storage.foldername(name))[1])::uuid));

create policy "frames bucket: update" on storage.objects
  for update to authenticated
  using (bucket_id = 'frames' and public.is_project_member(((storage.foldername(name))[1])::uuid));

create policy "frames bucket: delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'frames' and public.is_project_member(((storage.foldername(name))[1])::uuid));

-- -----------------------------------------------------------------------------
-- Realtime
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'commits'
  ) then
    alter publication supabase_realtime add table public.commits;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Invite links (same as supabase/migrations/002_invites.sql)
-- -----------------------------------------------------------------------------

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


-- -----------------------------------------------------------------------------
-- Recording sessions (same as supabase/migrations/003_capture_sessions.sql)
-- -----------------------------------------------------------------------------

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

-- -----------------------------------------------------------------------------
-- AI session summaries + questions (same as supabase/migrations/004_session_summaries_and_questions.sql)
-- -----------------------------------------------------------------------------

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

-- -----------------------------------------------------------------------------
-- Invite by email (same as supabase/migrations/005_invite_by_email.sql)
-- -----------------------------------------------------------------------------

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

-- Make the API pick up the new tables immediately.
notify pgrst, 'reload schema';
