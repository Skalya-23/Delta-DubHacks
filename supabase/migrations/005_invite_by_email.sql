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
