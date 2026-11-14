# Member and staff accounts

Project: `cmsnlbvkxwsbzankxxts`.

## What is implemented

- Public member registration with name, email and password (12-character minimum).
- Verification email, verification resend, sign-in, sign-out and password reset.
- Verified member profile and staff dashboard, with editable display name.
- Code-authorized staff creation without owner sign-in. New staff follow their email
  link, verify their email and choose a password. Existing verified members can
  be approved as staff without creating a duplicate account.
- Database-enforced access: unverified users cannot read profiles; users can
  read only their own profile and update only their own name. Browser metadata
  cannot grant roles. Staff approvals require the correct server-checked staff authorization code.
  Browser flags and metadata cannot authorize invitations.

## Configure the project

1. Apply `migrations/202611140001_members_and_staff.sql` using the Supabase SQL
   Editor, or push the migration with the Supabase CLI. It creates new tables;
   if a table with one of these names already exists, inspect it before adapting
   the migration. Do not overwrite existing application data.
2. Under Authentication → Email, keep **Confirm email** enabled, enable email
   signup, and set the minimum password length to **12**.
3. Under Authentication → URL Configuration, set Site URL to
   `https://fruit-punchy-kopi-co.vercel.app`. Add these exact redirect URLs:

   ```text
   https://fruit-punchy-kopi-co.vercel.app/?account=callback
   https://fruit-punchy-kopi-co.vercel.app/?account=set-password
   https://fruit-punchy-kopi-co.vercel.app/?account=reset
   ```

   Add localhost equivalents only for local development. Production login links
   deliberately use the stable production domain, not arbitrary preview URLs.
4. Configure custom SMTP with an owner-controlled verified sender/domain under
   Authentication → Email → SMTP. Supabase's default sender is limited to the
   project's team addresses and is unsuitable for public member registration.
   Set appropriate email rate limits for your sender. Keep SMTP credentials in
   Supabase; never put them in Vite variables or source control.
5. Optionally paste `templates/confirm-signup.html` into the Confirm Signup email
   template, and `templates/invite-staff.html` into Invite User. Keep
   `{{ .ConfirmationURL }}` intact. The browser client consumes Supabase's
   standard verification redirect and invited-user session.
6. Deploy the Edge Function:

   ```sh
   supabase functions deploy invite-staff --remote=cmsnlbvkxwsbzankxxts --use-api
   ```

   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are supplied by the Supabase
   Edge runtime. The service-role key is **never** sent to the website. The
   function verifies the separate staff authorization code itself; owner sign-in
   is not required. `verify_jwt = false` allows this code-authorized flow.
   The function defaults to the production website origin. If the domain changes,
   set its `SITE_URL` secret to the new canonical origin before deploying.
7. Put the public URL and public publishable/legacy anon key into `.env.local`
   locally and the matching Vercel build environment variables:

   ```text
   VITE_SUPABASE_URL
   VITE_SUPABASE_PUBLISHABLE_KEY
   VITE_AUTH_EMAIL_READY
   ```

   Rebuild after changing these. Never use a service-role or `sb_secret_` key.
   Keep `VITE_AUTH_EMAIL_READY=false` until custom SMTP delivery has been tested;
   then set it to `true` and redeploy. Until then, verified users can sign in but
   registration, password-reset, verification-resend and staff-invite submissions
   are disabled with a clear message.
8. Register the owner through the member form and verify the owner's email.
   Replace the email placeholder in `bootstrap-admin.sql` and execute it in the
   SQL Editor as project owner. This is the only initial admin bootstrap; the
   first person to register is deliberately **not** made an administrator.

## Staff onboarding

The four account pages are:

- Member creation: `/?account=join`
- Member login: `/?account=signin`
- Code-authorized staff creation: `/?account=staff-create`
- Staff sign-in: `/?account=staff`

When the public Supabase configuration is absent, these pages remain viewable
but submission is disabled with an activation-pending notice. Do not enable the
Vercel account configuration until the database and email delivery are ready.

The staff creator enters a name, email and staff authorization code. The button
is enabled only after the code is confirmed by Supabase; the invitation request
checks the code again independently. Owner sign-in is not required. The
staff member clicks the email link → chooses a password → enters the staff
dashboard. Merely receiving an invitation does not grant access. Auth must
record the email as confirmed before the trigger grants the staff role.

Staff creation also requires the separate `STAFF_CREATION_CODE` stored in the
owner's ignored `.env.smtp.local` file. This is not the Gmail App Password. Only
its SHA-256 hash is stored as the Edge Function secret `STAFF_CREATION_CODE_HASH`;
neither the staff code nor the SMTP password belongs in Vite or Git. The server
rejects missing/incorrect codes before creating an invitation or sending email,
and rejects all invitations if the code secret is absent. The code authorizes invitation creation without an owner session. New staff
still require email verification before accessing their profile. Rotate the code
by generating a fresh random value locally, updating the server hash, and
replacing the local value. No browser redeploy is needed for a code rotation.

Invitations expire after seven days. Email-link expiry is separately controlled
by Supabase Auth; an expired link must be reissued. The owner can retry after a
minute. If SMTP fails, the screen reports the failure; no success is fabricated.
An approved email remains on the staff allowlist until expiry even if delivery
fails, so the owner should revoke a mistaken pending approval directly in the
`staff_invitations` table by deleting that row before it is accepted.

Member and staff dashboards currently provide account/profile access. Loyalty
points, orders, rosters, payroll, and member-directory access are not implemented.

## Verification before public launch

Use owner-controlled test addresses for these checks:

1. Register a member. Confirm that a real email arrives and sign-in is blocked
   until its verification link is opened. Test the link from a second browser.
2. Resend verification and test an expired link.
3. Verify password reset and invited staff password setup.
4. Using the staff authorization code, invite a new staff address. Confirm that profile access is blocked
   before verification and the role becomes staff afterwards.
5. Try to update `role` or read another profile as a member; both must be denied.
   Try sending an invitation with a missing or incorrect staff code; it must be
   denied even after a previous successful code-validation request.
6. Confirm sign-out, name changes and mobile keyboard navigation.

Local security tests run with `pnpm test:security`; they exercise the actual SQL
migration in PostgreSQL (PGlite) with simulated Supabase Auth roles and claims.
They do not prove SMTP delivery or hosted-project configuration. Record real
email-delivery and hosted authentication results separately.
