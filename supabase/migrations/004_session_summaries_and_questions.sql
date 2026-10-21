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
