begin;

-- Membership approval is the access gate. Password authentication remains required.
create or replace function public.is_active_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.status = 'Active'
      and p.username is not null
  );
$$;
revoke all on function public.is_active_member() from public, anon;
grant execute on function public.is_active_member() to authenticated;

-- Existing accounts predate the Auth autoconfirm setting. Remove that old gate;
-- Pending/Rejected profiles still cannot sign in or read protected records.
update auth.users set email_confirmed_at = now()
where email_confirmed_at is null and email is not null and email <> ''
  and id in (select id from public.profiles where status = 'Active');

-- Accounts registered before autoconfirm was enabled can still be approved later.
create function public.allow_approved_member_login()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update auth.users set email_confirmed_at = now()
  where id = new.id and email_confirmed_at is null;
  return new;
end;
$$;
revoke all on function public.allow_approved_member_login() from public, anon, authenticated;
create trigger approved_member_login
after update of status on public.profiles
for each row when (new.status = 'Active' and old.status is distinct from new.status)
execute function public.allow_approved_member_login();

commit;
