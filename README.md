# Fruit Punchy Kopi and Art

A responsive neighbourhood café website built with React, Vite, and Tailwind CSS. Rebranded as Fruit Punchy Kopi and Art, around the owner’s hand-painted fruit-character logo, with soft mint, mango yellow, berry red, warm cream, and the tagline “A little kopi. A lot of colour.”

## Development

Use a current Node.js LTS release and pnpm.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm build
pnpm preview
```

## Deployment

Import this repository into Vercel with the Vite framework preset, or run `vercel` from the project directory. The build command is `pnpm build` and the output directory is `dist`. No environment variables are required. The supplied PRD is excluded from the deployment.

## Content awaiting owner confirmation

The menu and prices (S$2.80, S$6.50, S$8.90), recipes, business hours, café unit number, and final photography remain proposals from the PRD. The preview explicitly identifies those details. Replace the representative imagery and confirm the business information before using the website as an official business listing.

Image attribution and licences are provided in `public/photo-credits.txt` and linked from the footer. Fonts are self-hosted under their SIL Open Font Licences, included in `public/fonts/`.

The owner-supplied logo is preserved in `public/images/fruit-punchy-logo-original.png`. The web version preserves the full updated picture, including its lettering and artwork, and converts it to WebP. The favicon uses the small fruit characters from that picture. The same artwork is used in the header, hero, footer and favicon.

## Member and staff accounts

The Supabase integration adds member email/password registration and verification,
password recovery, verified profiles, and owner-approved staff email invitations.
See `supabase/SETUP.md` for migration, email delivery, redirect URL, Edge Function,
and first-owner setup. Staff roles are assigned by the server after email
verification; clients can update only their own display name.

```sh
pnpm test:security
```

Create `.env.local` from `.env.example` for local development. Only the public
Supabase URL and publishable/legacy anon key belong in `VITE_` variables.
