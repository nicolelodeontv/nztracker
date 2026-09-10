# 🥷 Ninja Zenshin Clan Tracker 2.0

A community-built live tracker for monitoring **Ninja Zenshin Clan Ranking** data in a compact, high-readability interface focused on reliable live monitoring and reputation intelligence.

**Live site:** https://nztracker-meow-7e9e.vercel.app/

**Source:** https://ninjazenshin.online/?panel=clan-ranking

## Core features

### 🏆 Live Clan Ranking

The main workspace shows:

**# · Clan · Master · Members · Reputation · Gain · Total Gain**

Ranking refreshes every 3 seconds through the Next.js API route.

### 👥 Live Member Data

Click any clan name to open the member intelligence panel.

Member view includes:

**# · Member · Lv · Rep · Before · Gain · Measured · Status · Total**

The member panel refreshes while open and protects against false gains when reputation resets.

### 🛡️ Reliability and fallback

`/api/clan-members` uses this recovery chain:

```text
Live legacy member source
        ↓
AMF ClanService.getMemberList
        ↓
Last-known server cache
        ↓
Last-known browser cache
```

A temporary upstream outage no longer has to blank the member panel.

### 💾 Season-aware durable history

The tracker stores member reputation history separately by:

**Season → Clan → Member → timestamped reputation points**

History is sampled at 5-minute intervals or immediately when a member's reputation changes. Up to 30 days are retained server-side when the project's private Vercel Blob store is connected.

The client also keeps a local fallback so the UI can continue reporting during a storage outage.

### 📈 Live member intelligence

The Live Member panel supports:

**1H · 3H · 5H · 6H · 12H · 24H · 7D**

and calculates:

- Top gainers
- Zero-gain members
- Reset detection
- Missing-history detection
- Active/new status
- Measured hours
- Timestamp history

### ⏱️ Background member monitoring

Member reputation snapshots are collected automatically every **5 minutes** through GitHub Actions, even when nobody has the website open. The scheduled job calls `/api/monitor`, which fetches live member data and records durable snapshots into private Vercel Blob history.

```text
GitHub Actions (every 5 min)
            ↓
     /api/monitor
            ↓
  Ninja Zenshin members
            ↓
     Vercel Blob history
            ↓
   Before → Gain → After
```

### ⇩ Export

CSV exports contain:

**Before Rep · After Rep · Rep Gain · Measured Hours · Start Time · End Time · Status · Current Total Gain**

and a detailed timestamp-history section.

A separate **Discord-ready summary** can be copied or exported as a text file.

### ❤️ API health

The Live Member header shows real-time service state for:

**Ranking · Members · History · Sync age**

Stale or last-known member data is explicitly labeled instead of being presented as live.

### 📱 Compact responsive UI

The tracker uses a compact dark monitoring layout with:

- Large readable headings and table values
- Touch-safe segmented period controls
- Mobile-safe modal behavior
- Horizontally scrollable wide tables
- Strong active/stale/error indicators
- No native export-period selector styling conflicts

## Data flow

```text
Ninja Zenshin
     │
     ├── Clan Ranking ───────────────┐
     │                              │
     └── Clan Members ──────────────┤
                                    ▼
                           Next.js API routes
                    ┌───────────────┼────────────────┐
                    │               │                │
             /api/clan-ranking /api/clan-members /api/member-history
                    │               │                │
                    └───────────────┼────────────────┘
                                    ▼
                                Tracker UI
                                    │
                         ┌──────────┴──────────┐
                         │                     │
                  Durable history        Local fallback
                    Vercel Blob            localStorage
```

## API routes

### `/api/clan-ranking`

Retrieves and parses the live Ninja Zenshin clan ranking source.

### `/api/clan-members`

Retrieves live member data with fallback handling and last-known caching.

### `/api/member-history`

Reads and writes season-separated timestamped reputation history.

### `/api/health`

Reports tracker service and history-storage readiness for the UI.

### `/api/monitor`

Runs the scheduled production data check and persists live member snapshots for background reputation tracking.

## Durable history storage

The 2.0 history service uses **private Vercel Blob** when the project is connected to a Blob store. Vercel Blob supports durable private storage and current Vercel deployments can authenticate with short-lived OIDC credentials when the store is connected.

If Blob storage is not connected, the UI clearly reports **HISTORY LOCAL** and uses the browser fallback rather than falsely claiming server persistence.

## Tech stack

- Next.js 16
- React 19
- JavaScript
- CSS
- Cheerio
- `@vercel/blob`
- Vercel
- Node.js 24.x
