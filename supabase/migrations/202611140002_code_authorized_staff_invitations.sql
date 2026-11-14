-- Staff invitations may now be authorized with the server-checked staff code
-- without a signed-in owner. Keep RLS and all browser write restrictions intact.
alter table public.staff_invitations alter column invited_by drop not null;
