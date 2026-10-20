# Machine log

Record the settings you've used on each machine, what happened, and get warned before you run an experiment you've already done.

Stack: React 18 + Vite 5 + Tailwind 3 on Netlify, Supabase (Postgres + Auth + RLS) for data. No server of your own.

## Set up (about 15 minutes)

1. **Supabase.** Create a project. Open SQL editor → New query, paste all of `supabase/schema.sql`, and run it. This creates the tables, the duplicate check, security policies, and starter machines (3D printer, laser engraver, oven) with sensible settings.
2. **Keys.** In Supabase → Project settings → API, copy the Project URL and the anon public key.
3. **Local run (optional).** Copy `.env.example` to `.env`, fill in the two values, then `npm install` and `npm run dev`.
4. **GitHub.** Push this folder to a new repo.
5. **Netlify.** Add new site → Import from Git → pick the repo. Build settings are read from `netlify.toml`. Under Site settings → Environment variables add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then trigger a deploy.
6. **Auth redirect.** In Supabase → Authentication → URL configuration, set Site URL to your Netlify address so confirmation emails link back to the site.
7. **Lock sign-ups (recommended).** Once your team has accounts, turn off "Allow new users to sign up" in Supabase → Authentication → Providers → Email, so strangers can't create accounts.

## Ask Claude or ChatGPT

The "Ask Claude or ChatGPT" button opens a side panel. Type a question (or pick a suggested one), choose which records to include, and click a button. The site writes your question with your logged runs attached, copies it, and opens a new Claude or ChatGPT chat. Paste and send.

This uses your existing Claude or ChatGPT account, so there are no API keys or extra costs. Everything happens in the browser; there's no server code.

## How the check works

- Two runs count as the same experiment when they're on the same machine, the same material (case and spaces ignored), and every setting is within its tolerance. Tolerances are editable in the Machines and settings tab.
- While you type, `find_similar_runs()` looks up matches and the side panel tells you whether the setup is new, already tried, already failed, or already planned by someone.
- On save, a database trigger refuses an identical setup unless it's ticked as a deliberate repeat with a reason. This lives in Postgres, so it can't be skipped by the website.
- Saving a run as "Planned" before you start it lets teammates see it's in progress, so two people don't test the same thing at once.

## Files

- `supabase/schema.sql` – tables, check function, trigger, RLS, seed data
- `src/components/NewRun.jsx` – the logging form and live check
- `src/components/CheckPanel.jsx` – the verdict panel
- `src/components/History.jsx` – past runs, filter, record results, start a new run from an old one
- `src/components/Machines.jsx` – machines, settings and tolerances
- `src/components/Assistant.jsx` – the Ask Claude or ChatGPT panel
- `src/lib/buildPrompt.js` – turns your runs into a question you can paste
