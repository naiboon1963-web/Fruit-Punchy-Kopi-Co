# Fruit Punchy Kopi and Art

Responsive React café website with local fonts, menu photography, mobile navigation, café story, and directions.

## Run locally

```sh
npm install
npm run dev
```

Create a production build with `npm run build`. Run existing security checks with `npm test`.

## Account setup

The public website works without credentials. To enable members and staff accounts, copy `.env.example` to `.env`, add a Supabase project URL and public publishable key, apply the migrations in `supabase/migrations`, and configure email delivery before setting `VITE_AUTH_EMAIL_READY=true`. Never use a service-role key in browser configuration.

Menu prices, opening hours, and café unit information are provisional. Confirm these before a public launch. Photo attribution is available in `public/photo-credits.txt`.
