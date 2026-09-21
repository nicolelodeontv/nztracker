# Ninja Zenshin Tracker - Data Sync Implementation

Complete system to automatically sync Ninja Zenshin clan rankings and tracked-member REP history to the tracker.

## What You're Getting

- Automatically fetch clan data every 5 minutes
- Store ranking cache, sync status, and member history in Supabase Postgres
- Display live, updated clan rankings on the site
- Track member REP history with 5-minute sampling / REP-change points
- Retain member history for 30 days
- Track sync history and errors

## Storage

Supabase Postgres is the **only durable storage provider** for member history, ranking cache, and sync status.

Server-side credentials are required:

```
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SECRET_KEY=YOUR_SB_SECRET_KEY
```

Do not expose these as `NEXT_PUBLIC_*` variables.

The storage tables are:

- `rep_tracker_member_points` — sampled REP history points
- `rep_tracker_member_latest` — latest member state used to decide whether a new point is needed
- `rep_tracker_kv` — ranking cache, sync heartbeat, and retention guard

The ranking cache uses `ranking-cache:latest`; the sync heartbeat uses `sync-status:latest`.

RLS is enabled on all three tables with no public policies. The server uses the Supabase secret/service-role credential.

## Member Tracking

Only configured clan IDs are fetched for member history.

`TRACKED_CLAN_IDS` is a comma-separated server-side environment variable. If it is unset, the tracker falls back to the clan ID stored in `rep_tracker_config`.

A member point is recorded when:

1. There is no previous point.
2. At least 5 minutes have passed since the last point.
3. REP changed since the last point.

The latest-member table is updated on every successful live snapshot so `last_seen_at` stays current. History points older than 30 days are removed at most once per hour.

## Reliability

Production syncing is handled by **GitHub Actions**, not Vercel Cron. The `Ninja Zenshin Full Sync` workflow runs every 5 minutes and calls `/api/sync-all`.

The workflow requires the API response to report more than zero members:

```bash
echo "$response" | jq -e '(.membersSeen // 0) > 0'
```

A run with zero members or member errors is reported as `warning`, not `success`.

A ranking-cache write failure is isolated from member monitoring so the member pipeline can continue and report the cache error.

`vercel.json` intentionally keeps Git-based deployments disabled; production deployments continue through the dedicated Vercel Production Deploy GitHub Action.

## Architecture

```
Ninja Zenshin Game
        ↓
[GitHub Actions] (every 5 min)
        ↓
[API: /api/sync-all]
        ├── Full clan ranking → Supabase
        ├── PvE/PvP → Supabase
        ├── Tracked members → Supabase member history
        ├── Ranking cache → rep_tracker_kv
        └── Sync heartbeat → rep_tracker_kv
        ↓
[Next.js APIs / Dashboard]
```

## Quick Setup

1. Run `supabase/migrations/20260921112500_supabase_primary_storage.sql` in the production Supabase project.
2. Set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in Vercel as server-only environment variables.
3. Set `TRACKED_CLAN_IDS` if you want to track one or more specific clans. If unset, `rep_tracker_config.clan_id` is used.
4. Deploy the application.
5. Open `/api/health` and confirm `provider: "supabase"` and a durable storage status.
6. Open `/api/monitor` or run the scheduled `/api/sync-all` and confirm `membersSeen > 0` and history points are stored.
7. Open `/api/member-history?clanId=<id>&season=<season>&hours=168` to verify the history response.

## Existing Supabase Tables

The implementation continues to reuse the existing:

- `rep_tracker_config`
- `rep_tracker_seasons`
- `rep_tracker_members`
- `rep_tracker_snapshots`
- `rep_tracker_sync_runs`
- `rep_tracker_audit_log`
- `sync_runs`
- ranking and leaderboard tables

No duplicate season, audit, or sync-run tables are introduced.

## Testing

```bash
npm test
npm run build
```

The unit tests cover member-point sampling, member-history response shape, and monitor warning status.

## Common Issues

| Problem | Solution |
|---------|----------|
| `/api/health` reports a Supabase connection error | Check `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in Vercel |
| `/api/monitor` reports zero members | Check the tracked clan configuration and the live member source |
| Sync workflow fails the jq check | Inspect the JSON response for `membersSeen`, `memberErrors`, and history errors |
| `/api/sync-status` returns 503 | Read `readErrors.database`; the endpoint no longer hides database read failures |
| History has no points | Confirm the migration has been run and the service-role/secret key can access the new tables |
