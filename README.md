# Machine log

Record the settings you've used on each machine, what happened, and get warned before you run an experiment you've already done.

Stack: React 18 + Vite 5 + Tailwind 3 on Netlify, Supabase (Postgres + Auth + RLS) for data. No server of your own.

## Set up (about 15 minutes)

1. **Supabase.** Create a project. Open SQL editor → New query, paste all of `supabase/schema.sql`, and run it. This creates the tables, the duplicate check, the photo storage, security policies, and starter machines (3D printer, laser engraver, oven).
2. **Keys.** In Supabase → Project settings → API, copy the Project URL and the anon public key.
3. **Local run (optional).** Copy `.env.example` to `.env`, fill in the two values, then `npm install` and `npm run dev`.
4. **GitHub.** Push this folder to a new repo.
5. **Netlify.** Add new site → Import from Git → pick the repo. Build settings are read from `netlify.toml`. Under Site settings → Environment variables add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then trigger a deploy.
6. **Auth redirect.** In Supabase → Authentication → URL configuration, set Site URL to your Netlify address so confirmation emails link back to the site.
7. **Lock sign-ups (recommended).** Once your team has accounts, turn off "Allow new users to sign up" in Supabase → Authentication → Providers → Email, so strangers can't create accounts.

## Updating an existing setup to this version

If your Supabase project was set up with the original `schema.sql`, run `supabase/update-002.sql` once (SQL editor → New query → paste → Run), then deploy this code. It keeps all your machines and runs. Brand-new projects only need `schema.sql`.

## Features

- **Settings per machine.** Each machine has its own list: add, rename, reorder, group or remove settings, and use number, text or dropdown types. Starter lists exist for 3D printers, laser engravers and ovens.
- **Defaults.** Each setting can have a default value. New runs start from the defaults, changed fields are highlighted, and History shows what differs from them. Use "Save as defaults" on the logging form to make your current settings the defaults.
- **Photos.** Add photos when logging, or later from a run in History. They're resized in the browser (1600 px plus a thumbnail) and stored in a private Supabase Storage bucket.
- **Dark mode.** Toggle in the header; follows the device setting until you choose.

## How the check works

- Two runs count as the same experiment when they're on the same machine, the same material (case and spaces ignored), and every setting is within its tolerance. Tolerances are editable in the Machines and settings tab.
- While you type, `find_similar_runs()` looks up matches and the side panel tells you whether the setup is new, already tried, already failed, or already planned by someone.
- On save, a database trigger refuses an identical setup unless it's ticked as a deliberate repeat with a reason. This lives in Postgres, so it can't be skipped by the website.
- Saving a run as "Planned" before you start it lets teammates see it's in progress, so two people don't test the same thing at once.

## Files

- `supabase/schema.sql` – full setup for a new project: tables, check, photos bucket, security rules, starter lists
- `src/components/NewRun.jsx` – the logging form and live check
- `src/components/CheckPanel.jsx` – the verdict panel
- `src/components/History.jsx` – past runs with photos; open one to record results
- `src/components/Machines.jsx` – add or delete machines; edit each machine's settings, tolerances and defaults
- `src/components/RunDetail.jsx` – one run: result, notes, photos, all settings
- `src/components/SettingField.jsx`, `PhotoPicker.jsx`, `Modal.jsx`, `ThemeToggle.jsx` – shared pieces
- `src/lib/photos.js` – resizing, uploading and deleting photos
- `supabase/update-002.sql` – upgrades a database set up with the original schema
