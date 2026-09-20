# Ninja Zenshin Tracker - Data Sync Implementation

Complete system to automatically sync clan rankings from Ninja Zenshin game to your tracker.

## What You're Getting

This package includes everything needed to:
- ✅ Automatically fetch clan data every 5 minutes
- ✅ Store rankings in a database (Supabase)
- ✅ Display live, updated clan rankings on your site
- ✅ Track sync history and errors
- ✅ Optional: Track clan ranking changes over time

## Reliability

Production syncing is handled by **GitHub Actions**, not Vercel Cron. The `Ninja Zenshin Full Sync` workflow runs every 5 minutes via a scheduled trigger and keeps `workflow_dispatch` available for manual runs. Each run calls `GET https://chaoszenshintracker.vercel.app/api/sync-all`.

`vercel.json` intentionally keeps Git-based deployments disabled; production deployments continue through the dedicated Vercel Production Deploy GitHub Action.

> The `/api/sync-all` route only requires an `Authorization: Bearer <CRON_SECRET>` header when `CRON_SECRET` is configured in the deployment environment. The scheduled workflow currently calls the endpoint without that header, so `CRON_SECRET` must remain unset unless the workflow is updated to supply the matching GitHub Actions secret.

## Files Overview

```
├── SETUP_GUIDE.md              👈 START HERE - Full step-by-step guide
├── SCRAPER_DEBUG.md            Troubleshooting + testing the scraper
├── schema.sql                  Database table structure
├── vercel.json                 Vercel project/deployment settings
├── .env.local.example          Environment variables template
├── package.json.snippet        Dependencies to add
│
├── lib/
│   ├── scraper.js              Fetches clan data from Ninja Zenshin
│   └── db.js                   Supabase database operations
│
├── pages/api/
│   ├── sync-clans.js           Legacy sync endpoint
│   └── clans.js                Frontend API endpoint
│
├── components/
│   └── ClanRanking.jsx         Updated frontend component
│
└── (old files)
    ├── app.js                  Court rotation app (from earlier)
    └── index.html              Court rotation HTML
```

## Quick Setup (5 Steps)

1. **Create Supabase project** (free tier)
2. **Run SQL schema** (`schema.sql`)
3. **Copy .env.local** with your Supabase credentials
4. **Install dependencies**: `npm install cheerio @supabase/supabase-js`
5. **Deploy to Vercel** with env variables

See `SETUP_GUIDE.md` for detailed instructions.

## Architecture

```
Ninja Zenshin Game
        ↓
[Scraper] (parses HTML)
        ↓
[GitHub Actions] (every 5 min)
        ↓
[API: /api/sync-all]
        ↓
[Supabase DB]
        ↓
[API: /api/clans] ← Your Frontend
        ↓
[ClanRanking Component]
```

## Key Files Explained

### `lib/scraper.js`
- Fetches HTML from `https://ninjazenshin.online/?panel=clan-ranking`
- Parses with Cheerio to extract clan data (rank, name, master, members, reputation)
- Returns structured JSON

### `pages/api/sync-clans.js`
- Legacy sync endpoint from the original implementation
- The current scheduled workflow uses `/api/sync-all` instead

### `pages/api/clans.js`
- Your frontend calls this to get latest clan data
- Returns cached rankings from database
- Includes last-updated timestamp

### `components/ClanRanking.jsx`
- Replaces your old "syncing" display
- Shows real clan data with refresh button
- Auto-refreshes every 30 seconds (toggle on/off)
- Status indicators (synced ✓, error ⚠️, syncing ⏳)

## What Happens After Deploy

1. **First scheduled run** (at the next 5-minute GitHub Actions interval)
   - Scraper fetches clan data
   - Saves to Supabase
   - Frontend starts showing real data

2. **Every 5 Minutes**
   - GitHub Actions runs automatically
   - Database updates with latest rankings
   - Your site shows fresh data

3. **Frontend Auto-Refresh**
   - Every 30 seconds, fetches `/api/clans`
   - Shows last update time
   - Manual refresh button available

## Costs

- **Supabase**: Free (up to ~500K rows/month)
- **GitHub Actions**: Uses repository Actions minutes/quota
- **Bandwidth**: ~1KB per sync (negligible)

## Testing Before Deploy

```bash
# 1. Test scraper locally
node --input-type=module test-scraper.js

# 2. Test with debug output
node -e "import('./lib/scraper.js').then(m => m.fetchClanData(true))"

# 3. Check database connection
node -e "import('./lib/db.js').then(m => m.getLatestClans(5))"

# 4. Manual sync test
curl https://chaoszenshintracker.vercel.app/api/sync-all
```

## Common Issues

| Problem | Solution |
|---------|----------|
| Scraper returns 0 clans | HTML structure changed → see `SCRAPER_DEBUG.md` |
| Scheduled sync not running | Check **GitHub Actions** → **Ninja Zenshin Full Sync** and verify the workflow is enabled |
| "Unauthorized" error | If `CRON_SECRET` is configured, the caller must send the matching `Authorization: Bearer ...` header |
| Database connection fails | Check Supabase URL/key, ensure project is active |
| Frontend shows "No data" | The scheduled workflow may not have run yet; check the GitHub Actions run and `sync_log` table |

## Next Steps (Upgrades)

After getting data syncing working:

1. **Track Changes**: Show rank ↑/↓ and reputation +/- per update
2. **Sync Player Leaderboards**: Add PvE/PvP leaderboard data
3. **Add Alerts**: Discord webhook when clan enters top 10
4. **Historical Charts**: Graph reputation trends over time
5. **Player Search**: Find player in which clan, tracking stats

See enhancements section in `SETUP_GUIDE.md`.

## Need Help?

1. **Setup questions**: Check `SETUP_GUIDE.md` section by section
2. **Scraper not working**: Follow `SCRAPER_DEBUG.md`
3. **Vercel issues**: Check function logs in Vercel dashboard
4. **Database issues**: Check Supabase logs and `sync_log` table

---

**Ready?** → Open `SETUP_GUIDE.md` and follow the 8 steps.

Good luck! 🎯
