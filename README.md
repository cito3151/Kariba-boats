# Kariba Lake Connect

A boat-booking marketplace for Lake Kariba, Zimbabwe. Tourists compare and book verified
boats; boat-operating companies list their fleet and file proof that they own it; hotels
and travel agencies book on behalf of guests; administrators verify companies and approve
listings before anything reaches the public.

## Stack

| | |
|---|---|
| UI | React 19, TypeScript, Vite 8 |
| Styling | Tailwind CSS v4 (via `@tailwindcss/vite`) |
| Routing | react-router-dom 7 |
| Motion | framer-motion |
| Icons | lucide-react |
| Backend | Supabase (Postgres, Auth, Storage) |
| Linting | oxlint |

## Getting started

Requires Node 20 or newer and a Supabase project.

```bash
npm install
cp .env.example .env.local   # then fill both values
npm run dev
```

The app refuses to boot without both environment variables, because a half-configured
client fails later and more confusingly than it does at startup:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Both are in the Supabase dashboard under **Project Settings → API**. Use the publishable
key, not the secret or `service_role` key: it is shipped to the browser, and row level
security is what actually protects the data. `.env.local` is gitignored.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Type-check (`tsc -b`) then build for production |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | oxlint over the project |
| `npm run build:brand` | Regenerate brand imagery (see below) |

There is no test runner configured in this project.

## Roles

`user_role` is a Postgres enum: `tourist`, `owner`, `hotel`, `agency`, `admin`. Admins may
additionally carry `is_super_admin`, which gates role management and publishing legal
documents.

Owners, hotels and agencies sign up in a **pending** state and cannot act on the platform
until an administrator verifies the account. Owners belong to a **company**, which is the
tenant that owns the fleet and carries the verified badge tourists see; several logins can
belong to one company. A company is verified only once an administrator has approved a
document of every required kind.

## Database

Migrations live in `supabase/migrations/`, applied in filename order. They are the source
of truth for schema, row level security, and the `security definer` RPCs the client calls
instead of writing privileged columns directly.

Two conventions are worth knowing before adding one:

- **Privileged columns are protected in two layers**: a column-level `GRANT` *after* an
  explicit `REVOKE` (Postgres grants table-wide UPDATE by default, so a bare
  `grant update (cols)` is a no-op), plus a `BEFORE INSERT OR UPDATE` guard trigger.
  Either alone has been insufficient in practice.
- **Guard triggers exempt callers where `auth.uid()` is null.** The service role and
  migrations bypass row level security but still fire triggers, so they must pass through.

Design notes and specs for larger pieces of work are in `docs/superpowers/`.

## Brand assets

`src/assets/kariba connect logo.png` is the source of truth for the brand. Every derived
image — the header mark, favicons, the Open Graph preview — is generated from it by
`scripts/build-brandmark.mjs`:

```bash
npm run build:brand
```

Do not hand-edit the generated files; change the source or the script and regenerate.

## Before deploying

`index.html` carries an HTML comment listing the metadata that needs a real domain
(`og:image` is relative, and `og:url` is deliberately absent). Both need filling in for
link previews to resolve correctly.
