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
