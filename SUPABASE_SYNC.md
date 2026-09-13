# NZ Tracker — Supabase data sync

This adds a durable clan-ranking sync pipeline to the existing Next.js app.

## Architecture

Ninja Zenshin game → Vercel Cron (every 5 minutes) → `/api/sync-clans` → scraper/parser → Supabase → `/api/clans` → frontend.

The scraper uses cache-busting and the existing shared ranking parser. The server timestamp captured with each source response is stored as `captured_at`, so the database becomes the durable source of truth instead of browser localStorage or serverless memory.

## Supabase setup

1. Create a free Supabase project.
2. Open SQL Editor and run [`schema.sql`](./schema.sql).
3. In Vercel Project Settings → Environment Variables, add:
   - `SUPABASE_URL` — your project URL
   - `SUPABASE_SERVICE_ROLE_KEY` — the server-only service-role key
   - `CRON_SECRET` — a long random secret (recommended)
4. Redeploy.

Never expose `SUPABASE_SERVICE_ROLE_KEY` as a `NEXT_PUBLIC_*` variable.

## Endpoints

- `GET /api/sync-clans` — cron/manual sync endpoint. Protected by `CRON_SECRET` when configured.
- `GET /api/clans?limit=100&season=Season%202` — reads the latest durable rankings.

## Verification

After environment variables are configured, call `/api/sync-clans` once from a server-side/admin context. A successful response reports the number of clans captured and whether Supabase stored them. Then `/api/clans` should return the same data.

Vercel Cron invokes the sync every five minutes using the `vercel.json` schedule.
