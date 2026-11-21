begin;

-- Preserve all existing records. They remain blocked until the café team
-- assigns a username and explicitly sets status to Active.
alter table public.profiles
  add column username text,
  add column full_name text not null default '',
  add column telephone text not null default '',
  add column status text not null default 'Pending';
update public.profiles set full_name = display_name;
alter table public.profiles
  add constraint profiles_username_format check (username is null or username ~ '^[a-z0-9_]{3,30}$'),
  add constraint profiles_username_unique unique (username),
  add constraint profiles_status_valid check (status in ('Pending', 'Active', 'Rejected')),
  add constraint profiles_full_name_length check (char_length(full_name) <= 100),
  add constraint profiles_telephone_length check (char_length(telephone) <= 30);

create or replace function public.is_active_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p join auth.users u on u.id = p.id
    where p.id = (select auth.uid()) and p.status = 'Active'
      and p.username is not null and u.email_confirmed_at is not null
  );
$$;
revoke all on function public.is_active_member() from public, anon;
grant execute on function public.is_active_member() to authenticated;

revoke update on public.profiles from authenticated;
revoke update (display_name) on public.profiles from authenticated;
drop policy "Verified users read their own profile" on public.profiles;
drop policy "Verified users update their own name" on public.profiles;
create policy "Active members read their own profile" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) and (select public.is_active_member()));

create or replace function public.sync_fruit_punchy_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
declare member_username text;
begin
  if tg_op = 'INSERT' then
    member_username := nullif(lower(trim(new.raw_user_meta_data ->> 'username')), '');
    insert into public.profiles (id, email, display_name, full_name, telephone, username, role, status)
    values (new.id, coalesce(lower(new.email), ''),
      left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'display_name', ''), 100),
      left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'display_name', ''), 100),
      left(coalesce(new.raw_user_meta_data ->> 'telephone', ''), 30),
      member_username, 'member', 'Pending');
  else
    -- Auth metadata cannot change a username, role, or approval status.
    update public.profiles set email = coalesce(lower(new.email), '') where id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.sync_fruit_punchy_profile() from public, anon, authenticated;
commit;
