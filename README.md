# 🥷 Ninja Zenshin Clan Tracker 3.0

A production-focused Ninja Zenshin clan operations tracker with durable background monitoring, server-first reputation history, live intelligence, FD mode, and Discord reporting.

Live site: https://nztracker.vercel.app/
Source: https://ninjazenshin.online/?panel=clan-ranking

## Reliability
- GitHub Actions monitors every 5 minutes, independent of an open browser.
- Private Vercel Blob stores 30 days of timestamped member reputation history.
- Server history is the source of truth; localStorage is fallback only.
- Source integrity guards reject stale, empty, duplicate, partial, and invalid snapshots.
- Background Sync Command Center exposes last/next snapshot, clan/member counts, durable status, and source.

## Live intelligence
- ~1 second UI refresh for ranking and open member panels.
- Live REP, gain, gain/minute, gain/hour, 6H and 24H intelligence.
- Member activity statuses: ACTIVE, RECENT, IDLE, NO GAIN, MISSING, NEW, RESET.
- Timestamped member timelines with 1H, 3H, 6H, 12H, 24H and 7D views.
- Clan comparison, takeover gap, event log, alerts, and top-gainer panels.

## Clan operations
- NORMAL / FD MODE.
- FD contributors, under-target members, and mini-burn candidates.
- One-click Discord-ready report.
- CSV export with historical measurements.

## API
- `/api/clan-ranking`
- `/api/clan-members`
- `/api/member-history`
- `/api/monitor`
- `/api/sync-status`
- `/api/health`

## Storage
History is private Vercel Blob. No Neon dependency is used.

## Stack
Next.js 16 · React 19 · JavaScript · Cheerio · Vercel Blob · Vercel · GitHub Actions · Node.js 24.x
