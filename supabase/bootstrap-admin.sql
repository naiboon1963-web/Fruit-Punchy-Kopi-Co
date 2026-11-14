-- Run only in the Supabase SQL Editor as the project owner, AFTER registering
-- and verifying the owner's email on the website. No automatic first-user admin.
-- Replace the placeholder below with the verified owner's exact email.
do $$
declare
  owner_id uuid;
begin
  select id into owner_id from auth.users
    where lower(email) = lower('REPLACE_WITH_VERIFIED_OWNER_EMAIL')
      and email_confirmed_at is not null;
  if owner_id is null then
    raise exception 'The owner must register and verify this exact email first.';
  end if;
  update public.profiles set role = 'admin' where id = owner_id;
  if not found then raise exception 'Run the members and staff migration first.'; end if;
end;
$$;
