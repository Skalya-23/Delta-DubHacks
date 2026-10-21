# Delta (Δ): frontend

> This folder is the **web app** only. The camera/Jetson + Perceptron Mk1 code lives in [`../backend`](../backend) (owned by the backend team). Both talk through the shared Supabase database in [`../supabase`](../supabase).

**Version control for the physical world.**

Delta watches your workbench and saves every change, so you can see what changed and go back to when it worked. A camera on an NVIDIA Jetson looks down at the bench; whenever something moves, gets added or disappears, Delta saves a **change** with before/after photos, and Perceptron's Mk1 vision model describes it in plain words. The web app shows it all on a **timeline**: mark each change *Works*, *Broken* or *Not tested*, save **checkpoints**, compare any two moments, keep project notes, and follow a step-by-step checklist to put the bench back the way it was.

Design notes: [`DESIGN.md`](DESIGN.md).

Built for DubHacks 2026 with Vite + React + TypeScript, Tailwind, shadcn/ui, and Supabase (auth, Postgres, storage, realtime).

> The database still uses Git-style names internally (`commits`, `checkpoints`, `project_docs`). The interface calls them changes, checkpoints and notes.

## Setup

1. **Create a Supabase project** at [supabase.com](https://supabase.com).
2. **Run the schema.** Open *SQL Editor → New query*, paste all of [`supabase/schema.sql`](../supabase/schema.sql), and run it once. It creates the tables, triggers, Row Level Security policies, the private `frames` storage bucket and the realtime publication.
   Already ran an older `schema.sql`? Just run [`supabase/migrations/002_invites.sql`](../supabase/migrations/002_invites.sql) to add invite links.
3. **Turn off email confirmation** (for the hackathon): *Authentication → Sign In / Providers → Email →* turn off **Confirm email**.
4. **Configure env vars:**
   ```bash
   cp .env.example .env.local
   ```
   Fill in the values from *Project Settings → API Keys*:
   - `VITE_SUPABASE_URL`: your project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY`: the publishable key (`sb_publishable_…`)
   - `SUPABASE_SECRET_KEY`: the secret key (`sb_secret_…`). Only the seed script and the Jetson use this. It is never bundled into the frontend.
5. **Install and run:**
   ```bash
   npm install
   npm run dev
   ```
6. **Sign up** at http://localhost:5173/signup.
7. **Load the demo data** (optional, recommended for judging):
   ```bash
   npx tsx scripts/seed.ts you@example.com
   ```
   This creates **Rover Chassis v2** with 25 changes over the last five weeks, generated bench photos, three checkpoints, two notebook pages and some team comments. Change #25 is left waiting for the AI. To see it fill in live during a demo, open it and run:
   ```bash
   npx tsx scripts/seed.ts --complete-pending you@example.com
   ```
   The seed is safe to re-run; it deletes and recreates the project. `npx tsx scripts/seed.ts --preview ./out` writes the generated SVG frames to a folder without touching Supabase.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Type-check and build for production |
| `npm test` | Run the Vitest unit tests (`src/lib/diff.test.ts`) |
| `npm run seed -- you@example.com` | Same as the seed command above |
| `npx tsx scripts/add-photo-change.ts you@example.com` | Add the real breadboard photos as the newest demo change |

## Teams and sharing

- **Invite people** from any project (sidebar → *Invite people*, the button on the Timeline, or Project settings): add someone by username, or create an invite link (valid 7 days, can be turned off). People without an account sign up from the link and join automatically.
- **Shared with you** lists projects other people invited you to.
- **Feed** shows new changes, checkpoints and comments across every project you're on, live.

## How the camera (backend) connects

The Jetson writes directly to Supabase using the secret key, in two stages (pending → described), and the website picks changes up over realtime. The data format the website expects is documented in **[`../supabase/README.md`](../supabase/README.md)**. Each project's ID and a ready-to-paste snippet are under *Project settings (gear icon) → Connect your camera*.

## Deploying to Vercel

1. Import the repo in Vercel, set **Root Directory** to `frontend`, framework preset **Vite**.
2. Add the two environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Do **not** add the secret key.
3. Deploy. `vercel.json` rewrites every route to `index.html` so deep links like `/alice/rover/change/<id>` work.
4. In Supabase, add your Vercel URL under *Authentication → URL Configuration → Site URL*.

## Project layout

```
scripts/seed.ts         Demo data generator (SVG bench frames that match the boxes)
scripts/add-photo-change.ts  Adds a real-photo change (scripts/demo-photos/) to the demo project
src/lib/                Supabase client, types, diff algorithm (+ tests), helpers
src/hooks/              React Query hooks, realtime subscription, auth, theme
src/components/         App shell + sidebar, Delta logo, before/after viewer, flipbook, heatmap, …
src/pages/              Projects, Timeline, change page, compare, go back, checkpoints, notes, settings
```
