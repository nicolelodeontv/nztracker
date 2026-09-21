# Ninja Zenshin Tracker - Data Sync Implementation

Production: https://chaoszenshintracker.vercel.app

Complete system to automatically sync Ninja Zenshin clan rankings and tracked-member REP history to the tracker.

## What You're Getting

- Automatically fetch the Chaos clan data every 5 minutes
- Store ranking cache, sync status, and member history in Supabase Postgres
- Display live, updated clan rankings on the site
- Track member REP history with 5-minute monitoring windows and REP-change points
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

## Sync Authorization

`/api/monitor` requires server-to-server authorization on every request:

```
Authorization: Bearer <CRON_SECRET>
```

Missing or incorrect authorization returns HTTP 401. `CRON_SECRET` must exist in Vercel Production and in GitHub Actions secrets. The browser must never receive or store this secret.

`/api/sync-all` remains available for full-sync diagnostics and backup automation.

The browser must never receive `CRON_SECRET`. The dashboard's background sync intentionally uses `GET /api/sync`, which remains the browser-facing sync exception and relies on the tracker sync interval/lock rather than the cron secret. `/api/clan-members` also remains public because the browser UI calls it directly and the route does not write tracking state.

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

The production trigger is an **external HTTP scheduler running every 5 minutes** and calling:

```
GET https://chaoszenshintracker.vercel.app/api/monitor
Authorization: Bearer <CRON_SECRET>
```

GitHub Actions also runs the same endpoint every 5 minutes as a redundant backup. The monitor uses a durable five-minute window key so two triggers in the same window do not create duplicate snapshots. Failed windows release their claim so a backup trigger can retry.

Unchanged member snapshots are not written. Existing 30-day retention remains enabled.

Vercel Hobby is not used as the five-minute scheduler; Hobby Cron is not suitable for this cadence.

The backup workflow requires the API response to report a successful or idempotently skipped run:

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
[External scheduler] ─┐
[GitHub Actions backup] ─┤ every 5 min
        ↓
[API: /api/monitor]
        ├── Live Chaos roster/REP → Supabase
        ├── Sync heartbeat → rep_tracker_kv
        └── Monitor-window idempotency → rep_tracker_kv
        ↓
[Next.js APIs / Dashboard]
```


## Quick Setup

1. Run `supabase/migrations/20260921112500_supabase_primary_storage.sql` in the production Supabase project.
2. Set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in Vercel as server-only environment variables.
3. Set `TRACKED_CLAN_IDS` if you want to track one or more specific clans. If unset, `rep_tracker_config.clan_id` is used.
4. In Vercel → Settings → Environment Variables, add `CRON_SECRET` to **Production**.
5. In GitHub → repository → Settings → Secrets and variables → Actions, add the same `CRON_SECRET` value.
6. Deploy the application.
7. Configure an external scheduler to call `GET /api/monitor` every 5 minutes with the bearer header.
8. Open `/api/health` and confirm `provider: "supabase"` and durable storage.
9. Confirm `/api/sync-status` reports the latest successful monitor run.
10. Open `/api/member-history?clanId=<id>&season=<season>&hours=168` to verify the history response.

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
| Manual sync workflow fails the jq check | Inspect the JSON response for `membersSeen`, `memberErrors`, and history errors |
| `/api/sync-status` returns 503 | Read `readErrors.database`; the endpoint no longer hides database read failures |
| History has no points | Confirm the migration has been run and the service-role/secret key can access the new tables |

## Timezone and Baseline Rules

- The game server is SGT, represented explicitly as IANA `Asia/Singapore`.
- Today is `00:00–23:59:59 Asia/Singapore`; the day boundary is `16:00 UTC`.
- Season REP resets each season. Season Gain is current REP minus the season baseline, which defaults to `0` unless the source explicitly provides another baseline.
- Daily Gain is current REP minus the last accepted REP known at or before the SGT day boundary.
- The dashboard must not use Vercel/browser local time for day boundaries.

## Production Health Monitoring

The `Production Health Check` workflow checks `/api/sync-status` and `/api/dashboard`. The monitor itself is driven by the external five-minute scheduler with GitHub Actions as a redundant five-minute backup.

A stale monitor is treated as:

- **LIVE**: <= 7 minutes since the last successful monitor sync.
- **AGING**: > 7 and <= 15 minutes.
- **STALE**: > 15 minutes.

The dashboard displays an explicit warning when the monitor is delayed or stale.

