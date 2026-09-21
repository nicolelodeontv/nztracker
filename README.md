# Ninja Zenshin Tracker - Data Sync Implementation

Complete system to automatically sync Ninja Zenshin clan rankings and tracked-member REP history to the tracker.

## What You're Getting

- Automatically sync the tracked clan every 10 seconds
- Store current rankings, member state, sync status, ranking history, and REP history in Supabase Postgres
- Display near-real-time member REP updates without repeatedly loading the heavy dashboard payload
- Track member REP changes with live member heartbeats
- Retain member and ranking history for 30 days
- Keep sync history and errors auditable

## Storage

Supabase Postgres is the **only durable storage provider** for member history, ranking cache, and sync status.

Server-side credentials are required:

```
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SECRET_KEY=YOUR_SB_SECRET_KEY
```

Do not expose these as `NEXT_PUBLIC_*` variables.

## Sync Authorization

Production sync and diagnostic endpoints use `CRON_SECRET` for server-to-server authorization:

- `/api/sync-all` — production full sync called by Supabase pg_cron.
- `/api/sync-clans` — protected legacy sync endpoint.
- `/api/monitor` — protected manual diagnostic endpoint.
- `/api/source-debug` — admin-only persisted upstream source diagnostic endpoint.
- `/api/monitor-health` — protected external health-check endpoint used by the GitHub backup workflow.

When `CRON_SECRET` is unset, these endpoints remain open for backwards compatibility and emit a server-side warning. Once `CRON_SECRET` is configured, requests without the exact `Authorization: Bearer <secret>` header return HTTP 401.

The Supabase pg_cron job must send the bearer header. The GitHub Actions manual diagnostic workflow reads the same value from the repository `CRON_SECRET` secret.

The browser must never receive `CRON_SECRET`. The dashboard's background sync intentionally uses `GET /api/sync`, which remains the browser-facing sync exception and relies on the tracker sync interval/lock rather than the cron secret. `/api/clan-members` also remains public because the browser UI calls it directly and the route does not write tracking state.

The storage tables are:

- `rep_tracker_member_points` — sampled REP history points
- `rep_tracker_member_latest` — latest member state used to decide whether a new point is needed
- `rep_tracker_kv` — ranking cache, sync heartbeat, sync-health state, alert dedupe, and retention guards

The ranking cache uses `ranking-cache:latest`; the sync heartbeat uses `sync-status:latest`; sync health state uses `sync-health:latest`.

RLS is enabled across tracker tables with explicit service-role-only policies; public/anon/authenticated access remains denied. The server uses the Supabase secret/service-role credential.

## Member Tracking

Only configured clan IDs are fetched for member history.

`TRACKED_CLAN_IDS` is a comma-separated server-side environment variable. If it is unset, the tracker falls back to the clan ID stored in `rep_tracker_config`.

A member point is recorded when:

1. There is no previous point.
2. At least 5 minutes have passed since the last point.
3. REP changed since the last point.

The latest-member table is updated on every successful live snapshot so `last_seen_at` stays current. History points older than 30 days are removed at most once per hour. Sync-run diagnostics older than 90 days are also pruned at most once per hour.

## Reliability

Production syncing is handled by **Supabase pg_cron**, with the `nztracker-full-sync-5m` job running every 10 seconds and calling `/api/monitor`. The member pipeline is the near-real-time path; discovery remains cached for about 5 minutes, while the stored global ranking is independently refreshed at most once per minute so ranking work cannot dominate the ten-second member cadence.

The repository's GitHub monitor backup runs every 5 minutes and is protected by the same cron secret; the Supabase scheduler remains primary. A separate Supabase HTTP-health job records the actual `/api/monitor` response from `pg_net`, because a successful cron enqueue is not the same as a successful application response.

The workflow requires the API response to report more than zero members:

```bash
echo "$response" | jq -e '(.membersSeen // 0) > 0'
```

A run with zero members or member errors is reported as `warning`, not `success`.

A ranking-cache write failure is isolated from member monitoring so the member pipeline can continue and report the cache error. `/api/monitor-health` checks for stale runs, zero-member runs, member errors, sync errors, and ranking-cache failures, and sends deduplicated Discord alerts when `DISCORD_WEBHOOK_URL` is configured.

`vercel.json` intentionally keeps Git-based deployments disabled; production deployments continue through the dedicated Vercel Production Deploy GitHub Action.

## Architecture

```text
Ninja Zenshin Game
        ↓
[Supabase pg_cron] (every 10 sec)
        ↓
[API: /api/monitor]
        ├── Tracked members → canonical member state + 5-minute REP samples
        ├── Discovery/ranking cache → refreshed about every 5 minutes
        ├── Last-known member cache → durable fallback in rep_tracker_kv
        └── Sync health → rep_tracker_kv
        ↓
[Supabase HTTP-health job] (every 1 min)
        └── actual pg_net HTTP result → rep_tracker_kv
        ↓
[Next.js APIs / Dashboard]
```

## Quick Setup

1. Run `supabase/migrations/20260921112500_supabase_primary_storage.sql` in the production Supabase project.
2. Set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in Vercel as server-only environment variables.
3. Set `TRACKED_CLAN_IDS` if you want to track one or more specific clans. If unset, `rep_tracker_config.clan_id` is used.
4. Deploy the application.
5. Open `/api/health` and confirm `provider: "supabase"` and a durable storage status.
6. Open `/api/monitor` or confirm the Supabase pg_cron job is invoking `/api/monitor` every 10 seconds; verify `membersSeen > 0` and history points are stored.
7. Open `/api/member-history?clanId=<id>&season=<season>&hours=168` to verify the history response.

## Canonical Supabase Tables

The active application uses:

- `rep_tracker_config`
- `rep_tracker_seasons`
- `rep_tracker_members`
- `rep_tracker_member_latest`
- `rep_tracker_snapshots`
- `rep_tracker_member_points`
- `rep_tracker_ranking_history`
- `rep_tracker_sync_runs`
- `rep_tracker_audit_log`
- `rep_tracker_finalizations`
- `rep_tracker_hours`
- `rep_tracker_kv`

The legacy ranking, leaderboard, clan-member, sync-log, and old clan-history tables are retired by the staged cleanup migration.

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

## Production Health Monitoring

The primary sync runs from **Supabase pg_cron** every 10 seconds. GitHub Actions provides a 5-minute backup monitor, while the `Production Health Check` workflow runs every 15 minutes plus `workflow_dispatch`.

Health monitoring checks:

- `/api/sync-status` for current cadence and recent execution.
- `/api/dashboard` for configured canonical data.
- `/api/monitor-health` with the cron secret for missed syncs, member/ranking health, and the persisted actual HTTP response from `pg_net`.

The member source uses AMF first, then the public member endpoint as a live fallback, and retries transient upstream errors before failing. A valid legacy fallback is treated as a successful data sync with `sourceHealth: degraded`, rather than as a failed sync, while the original AMF error/timing remains visible to admins.


## Canonical data model

The current dashboard reads current member state from `rep_tracker_member_latest` and current global clan rankings from `rep_tracker_kv` (`ranking-cache:latest`). Ranking history is sampled into `rep_tracker_ranking_history` and retained for 30 days.

The older multi-source ranking, leaderboard, and sync tables are retired by `20260921150100_remove_legacy_storage.sql`. Apply that migration only after the canonical application has been deployed and the production smoke test passes.

The dashboard exposes:
- ten-second sync countdown and freshness
- sync health strip with member/ranking state, actual HTTP status, sync completion rate, missed intervals, source health, and last recorded error
- 5-second lightweight live refreshes with a 60-second full dashboard refresh cadence
- Period-history polling runs every 60 seconds and pauses outside the Dashboard/Members views to reduce repeated history queries.
- persisted AMF/legacy source diagnostics and explicit degraded-fallback state
- compact operations tabs for overview, REP pace/attention, and global ranking
- member filtering, search, and sorting
- global clan rank, gap to the next rank, and pace estimate
- 1H / 3H / 6H / 12H / 24H / 7D REP burn analysis
- needs-attention member signals
- live member detail refresh with keyboard-accessible drawer controls

Production deployments include a smoke test for `/api/sync-status`, `/api/health`, `/api/dashboard`, and authenticated `/api/monitor-health`.
