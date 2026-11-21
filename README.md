# Fruit Punchy Kopi and Art

Responsive React café website with local fonts, menu photography, mobile navigation, café story, and directions.

## Run locally

```sh
npm install
npm run dev
```

Create a production build with `npm run build`. Run existing security checks with `npm test`.

## Account setup

The public website works without credentials. Member accounts use Supabase Auth with username/password login, manual approval. `/members` and its subpaths require an authenticated session and an Active profile; database RLS independently enforces access. Sign in at `/?account=signin` and register at `/?account=join`.

Follow [the deployment guide](supabase/SETUP.md) to configure the public environment variables, migrations, `member-auth` Edge Function, email delivery, and callback URLs. Never use a service-role key in browser configuration.

Manage approvals and upgrade active members to staff at `/admin`. The admin password is checked by the `admin-members` Edge Function; approval and promotion are enforced on the server and logged privately.

Admins can also set new member/staff passwords; existing password hashes cannot be viewed. Staff sign in at `/?account=staff` and access `/staff`. Successful member and staff sessions display username, full name, role, and logout.

Menu prices, opening hours, and café unit information are provisional. Confirm these before a public launch. Photo attribution is available in `public/photo-credits.txt`.
