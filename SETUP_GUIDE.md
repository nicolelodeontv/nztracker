# Ninja Zenshin Tracker - Data Sync Setup Guide

This guide walks you through setting up automated clan data syncing from the Ninja Zenshin game to your tracker.

## Architecture Overview

```
Ninja Zenshin Game
        ↓
   [Scraper] (fetches HTML)
        ↓
   [Vercel Cron] (runs every 5 min)
        ↓
   [API Route: /api/sync-clans]
        ↓
   [Supabase Database]
        ↓
   [API Route: /api/clans] ← Frontend
        ↓
   [ClanRanking Component]
```

---

## Step 1: Set Up Supabase (Database)

### 1.1 Create a Supabase Account
- Go to [supabase.com](https://supabase.com)
- Sign up with GitHub
- Create a new project (free tier is fine)

### 1.2 Set Up Database Tables
1. Go to **SQL Editor** in Supabase
2. Copy and paste the contents of `schema.sql`
3. Run the query
4. Verify tables were created: `clans`, `sync_log`, `clan_history`

### 1.3 Get Your Credentials
1. Go to **Project Settings** → **API**
2. Copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `Service Role Secret` (⚠️ keep private) → `SUPABASE_SERVICE_ROLE_KEY`

---

## Step 2: Configure Environment Variables

### 2.1 Create `.env.local`
1. Copy `.env.local.example` to `.env.local`
2. Fill in your Supabase credentials:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
   CRON_SECRET=your-random-secret-here
   ```

### 2.2 Generate CRON_SECRET
Run this in your terminal:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Use the output as your `CRON_SECRET`.

---

## Step 3: Install Dependencies

```bash
npm install cheerio @supabase/supabase-js
```

---

## Step 4: Update Your Project Structure

Make sure your project has this layout:
```
your-project/
├── pages/
│   └── api/
│       ├── clans.js           (new)
│       └── sync-clans.js       (new)
├── components/
│   └── ClanRanking.jsx         (new - replaces old component)
├── lib/
│   ├── db.js                   (new)
│   └── scraper.js              (new)
├── vercel.json                 (new)
├── .env.local                  (create from example)
└── package.json
```

---

## Step 5: Update Your Main Page

Replace your current ranking display with the new component:

```jsx
import ClanRanking from '@/components/ClanRanking';

export default function Home() {
  return (
    <div>
      <h1>Ninja Zenshin Tracker</h1>
      <ClanRanking />
    </div>
  );
}
```

---

## Step 6: Deploy to Vercel

### 6.1 Push to GitHub
```bash
git add .
git commit -m "Add data sync system"
git push origin main
```

### 6.2 Deploy
1. Go to [vercel.com](https://vercel.com)
2. Import your GitHub repo
3. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CRON_SECRET`
4. Deploy

### 6.3 Enable Vercel Crons
Crons are automatically enabled with the `vercel.json` file. They'll run at 5-minute intervals.

---

## Step 7: Test the Sync

### 7.1 Manual Test
Run a manual sync to test everything:
```bash
curl -X POST https://your-site.vercel.app/api/sync-clans \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

You should get:
```json
{
  "success": true,
  "clans_synced": 73,
  "timestamp": "2026-09-13T...",
  "message": "Successfully synced 73 clans"
}
```

### 7.2 Check Database
1. Go to Supabase → **Browser**
2. Click `clans` table
3. Verify rows are appearing

### 7.3 Check Frontend
Visit your site → should show clan rankings with "✓ Synced" status

---

## Step 8: Monitor & Troubleshoot

### Check Sync Logs
```javascript
// In Supabase → SQL Editor
SELECT * FROM sync_log ORDER BY synced_at DESC LIMIT 20;
```

### Common Issues

**Issue: "0 clans synced"**
- HTML selector in `scraper.js` may have changed
- Check the actual HTML structure of https://ninjazenshin.online/?panel=clan-ranking
- Update the `cheerio` selector in `lib/scraper.js`

**Issue: Cron not running**
- Verify `vercel.json` is in root directory
- Check Vercel dashboard → **Integrations** → **Crons** → should show your route
- Environment variables must be set in Vercel project

**Issue: Database connection error**
- Verify Supabase URL and Service Role Key in `.env.local`
- Check Supabase project is active (not paused)
- Check RLS (Row Level Security) — may need to disable for testing

**Issue: "Unauthorized" on manual cron test**
- Make sure `Authorization: Bearer YOUR_CRON_SECRET` header matches `CRON_SECRET` in env

---

## Optional Enhancements

### 1. Add Change Tracking
```javascript
// In db.js - track rank/reputation changes
async function trackClanChanges(newClans) {
  // Compare with previous batch
  // Insert into clan_history table
  // Show badges: ↑ ↓ = on frontend
}
```

### 2. Add Player Syncing
Create a similar sync for:
- PvE Leaderboard: `/api/sync-players-pve`
- PvP Leaderboard: `/api/sync-players-pvp`

### 3. Add Alerts
- Notify when a clan enters top 10
- Notify when reputation crosses a threshold
- Send via Discord webhook or email

### 4. Archive Old Data
```javascript
// Clean up data older than 30 days
async function archiveOldData() {
  await supabase
    .from('clans')
    .delete()
    .lt('fetched_at', new Date(Date.now() - 30*24*60*60*1000).toISOString());
}
```

---

## Costs

- **Supabase**: Free tier covers ~500K rows/month (more than enough)
- **Vercel Crons**: Free (5-minute minimum interval)
- **Bandwidth**: Negligible

---

## Support

If sync fails:
1. Check Vercel logs: **Dashboard** → **Deployments** → **Function Logs**
2. Check Supabase logs: **Logs** tab in project
3. Run manual cron test to see exact error

---

## Next Steps

✅ Data sync running
📊 Next: Add historical tracking
📈 Then: Add trend visualizations
🔔 Then: Add alerts/notifications
