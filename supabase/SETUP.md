# Member management deployment

The website now uses username/password member login. Staff menus and staff creation are no longer part of the website UI. Existing records and historical migrations are preserved.

## Activate in Supabase

Project: `nbkoh project` (`tufjpeqcunebcxnucrxx`). The previous `fruitpunchy` project (`cmsnlbvkxwsbzankxxts`) is retained separately; app deployments use the public connection variables for `nbkoh project`.

The switch configures Auth callbacks, email confirmation, the member/admin functions, and database policies. Gmail SMTP is declared with sender `naiboon1963@gmail.com`, host `smtp.gmail.com`, and SSL port `465`. Supply `GMAIL_SMTP_PASSWORD` through the environment before pushing SMTP configuration. Use a Gmail app password, never the account's regular password. Local credentials belong in the ignored `.env.smtp.local`, never source control. The previous project's SMTP password is not exported by Supabase and must be supplied again for this project. Until SMTP is applied, Supabase's default sender is intended for testing and restricts recipient delivery.

1. Apply all migrations in filename order. For an existing installation with the first two migrations already applied, apply only `migrations/202611210001_member_usernames_and_status.sql` through the Supabase SQL Editor or authenticated CLI. Do not rerun the historical migrations.
2. Keep email authentication enabled, email confirmation enabled, and minimum password length at 12. Configure and test the email sender for public registration.
3. Deploy `functions/member-auth/index.ts` as the `member-auth` Edge Function. Its gateway JWT verification must be disabled, as specified in `config.toml`; the function validates login credentials and membership status itself. It uses Supabase's automatically provided `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` only on the server.
4. Set the Edge Function secret `MEMBER_SITE_URL` to the canonical website origin, `https://fruit-punchy-kopi-co.vercel.app` for the production Vercel deployment.
5. Add the canonical origin's exact `/?account=callback` and `/?account=reset` URLs to Supabase Authentication URL Configuration. Set the Site URL to the same canonical origin.
6. Rebuild the website with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from the ignored `.env.local`, and publish only after the migration and Edge Function are ready. The new member flow does not use the legacy `VITE_AUTH_EMAIL_READY` flag; SMTP errors are handled by the server.

## Existing members and activation

Existing profiles keep their IDs, email addresses, roles, and names. Their full name is populated from the previous display name. Every profile starts with status `Pending`; existing profiles have no username until one is assigned directly in the Supabase Table Editor.

For each approved member, assign a unique lowercase username (3–30 letters, digits or underscores), review the full name and telephone number, and change status to `Active`. Do not change approval using Auth user metadata. Members cannot change their status or role through the website.

Statuses are `Pending`, `Active`, and `Rejected`. The `/admin` page provides password-protected member approval and staff promotion. Legacy profiles without a username can be assigned one during approval. Approval does not bypass email verification.

## Admin console

Apply `20261121034501_admin_member_management.sql`, then deploy `functions/admin-members/index.ts` with gateway JWT verification disabled, as declared in `config.toml`. This endpoint verifies its own signed admin session before every read or write.

Configure the server-only secrets `ADMIN_PASSWORD_HASH` and `ADMIN_SESSION_SECRET`. The password hash uses `pbkdf2-sha256:210000:<base64url salt>:<base64url derived 32 bytes>`. The signing secret must contain at least 32 random characters. The initial password is configured during deployment and is never embedded in the website bundle or migrations. To rotate the admin password, replace the hash and signing secret together; replacing the signing secret invalidates existing admin sessions.

Admin sessions last 15 minutes, remain in browser memory, and are discarded by the Lock administration button or a page reload. Login attempts are throttled in the database. Approval and staff promotion run transactionally and are recorded in `admin_private.member_actions`. Ordinary members and anonymous callers cannot execute these operations or read the private audit log. Staff promotion is available only after membership is Active; it preserves the member's existing login credentials.

## Access enforcement

The server authenticates the password and then reads the current membership status. Pending users receive the requested error and no login tokens. Active users must also have a verified email. Database RLS independently blocks Pending and Rejected users even if they already have an Auth session or call Supabase directly. Apply equivalent `is_active_member()` policies to future member-only tables.

Username uniqueness is case-insensitive because values are normalized to lowercase and protected by a database unique constraint. Concurrent duplicate registrations cannot create two profiles with the same username. Duplicate username messages intentionally reveal username availability, but never return email addresses.

## Verification

Run `npm test` and `npm run build`. Before publishing, use owner-controlled accounts to verify signup email delivery, Pending rejection, manual activation, username/password login, password reset, username/full-name display and logout against the live project. Local tests exercise the actual migration and server handler; they do not establish hosted deployment or SMTP readiness.
