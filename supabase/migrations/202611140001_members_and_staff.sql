begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null default '' check (char_length(display_name) <= 100),
  role text not null default 'member' check (role in ('member', 'staff', 'admin')),
  created_at timestamptz not null default now()
);

create table public.staff_invitations (
  email text primary key check (email = lower(trim(email))),
  display_name text not null check (char_length(display_name) between 1 and 100),
  invited_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz
);

alter table public.profiles enable row level security;
alter table public.staff_invitations enable row level security;

create function public.is_verified_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users
    where id = (select auth.uid()) and email_confirmed_at is not null
  );
$$;
revoke all on function public.is_verified_user() from public, anon;
grant execute on function public.is_verified_user() to authenticated;

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant all on public.profiles to service_role;
revoke all on public.staff_invitations from anon, authenticated;
grant all on public.staff_invitations to service_role;

create policy "Verified users read their own profile" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) and (select public.is_verified_user()));

create policy "Verified users update their own name" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) and (select public.is_verified_user()))
  with check (id = (select auth.uid()) and (select public.is_verified_user()));

-- The browser may supply a name, but never a role. Staff grants require a
-- server-created invitation AND the Auth email-confirmation timestamp.
create function public.sync_fruit_punchy_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  invited_email text;
begin
  if tg_op = 'INSERT' then
    insert into public.profiles (id, email, display_name, role)
    values (
      new.id, coalesce(lower(new.email), ''),
      left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 100), 'member'
    );
  else
    update public.profiles set email = coalesce(lower(new.email), '') where id = new.id;
  end if;

  if new.email_confirmed_at is not null then
    select email into invited_email
      from public.staff_invitations
      where email = lower(new.email) and accepted_at is null and expires_at > now()
      for update;
    if invited_email is not null then
      update public.profiles set role = 'staff' where id = new.id and role <> 'admin';
      update public.staff_invitations set accepted_at = now() where email = invited_email;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.sync_fruit_punchy_profile() from public, anon, authenticated;

create trigger fruit_punchy_new_user
after insert on auth.users for each row execute function public.sync_fruit_punchy_profile();
create trigger fruit_punchy_verified_user
after update of email, email_confirmed_at on auth.users
for each row execute function public.sync_fruit_punchy_profile();

-- Existing Auth users are members; no existing metadata can elevate a role.
insert into public.profiles (id, email, display_name, role)
select id, coalesce(lower(email), ''), left(coalesce(raw_user_meta_data ->> 'display_name', ''), 100), 'member'
from auth.users on conflict (id) do nothing;

commit;
