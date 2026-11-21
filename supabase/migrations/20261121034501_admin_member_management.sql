begin;

create schema if not exists admin_private;
revoke all on schema admin_private from public, anon, authenticated;
grant usage on schema admin_private to service_role;

create table admin_private.login_attempts (
  bucket text primary key,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 1
);
create table admin_private.member_actions (
  id bigint generated always as identity primary key,
  member_id uuid not null,
  action text not null check (action in ('approve', 'promote')),
  previous_status text not null,
  previous_role text not null,
  resulting_status text not null,
  resulting_role text not null,
  created_at timestamptz not null default now()
);
alter table admin_private.login_attempts enable row level security;
alter table admin_private.member_actions enable row level security;
revoke all on all tables in schema admin_private from public, anon, authenticated;
grant select, insert, update, delete on admin_private.login_attempts to service_role;
grant select, insert on admin_private.member_actions to service_role;
grant usage, select on all sequences in schema admin_private to service_role;

create function public.consume_admin_login_attempt(bucket_key text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare attempt_count integer;
begin
  if bucket_key is null or char_length(bucket_key) <> 43 then return false; end if;
  delete from admin_private.login_attempts where window_started_at < now() - interval '1 day';
  insert into admin_private.login_attempts as current (bucket, window_started_at, attempts)
  values (bucket_key, now(), 1)
  on conflict (bucket) do update set
    attempts = case when current.window_started_at <= now() - interval '15 minutes' then 1 else current.attempts + 1 end,
    window_started_at = case when current.window_started_at <= now() - interval '15 minutes' then now() else current.window_started_at end
  returning attempts into attempt_count;
  return attempt_count <= 10;
end;
$$;
revoke all on function public.consume_admin_login_attempt(text) from public, anon, authenticated;
grant execute on function public.consume_admin_login_attempt(text) to service_role;

create function public.admin_manage_member(target_id uuid, requested_action text, assigned_username text default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare member public.profiles%rowtype; updated_member public.profiles%rowtype;
begin
  select * into member from public.profiles where id = target_id for update;
  if not found then raise exception 'Member not found' using errcode = 'P0002'; end if;
  if member.role = 'admin' or requested_action not in ('approve', 'promote') or requested_action is null then
    raise exception 'Invalid member action' using errcode = '22023';
  end if;
  if requested_action = 'approve' then
    if member.username is null then
      if assigned_username is null or assigned_username !~ '^[a-z0-9_]{3,30}$' then
        raise exception 'A valid username is required' using errcode = '22023';
      end if;
    elsif assigned_username is not null and assigned_username <> member.username then
      raise exception 'Existing usernames cannot be reassigned here' using errcode = '22023';
    end if;
    update public.profiles set status = 'Active', username = coalesce(username, assigned_username)
      where id = target_id returning * into updated_member;
  else
    if member.status <> 'Active' or member.role <> 'member' or member.username is null then
      raise exception 'Only active members can become staff' using errcode = '22023';
    end if;
    update public.profiles set role = 'staff' where id = target_id returning * into updated_member;
  end if;
  insert into admin_private.member_actions(member_id, action, previous_status, previous_role, resulting_status, resulting_role)
    values (target_id, requested_action, member.status, member.role, updated_member.status, updated_member.role);
  return to_jsonb(updated_member);
end;
$$;
revoke all on function public.admin_manage_member(uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_manage_member(uuid, text, text) to service_role;

commit;
