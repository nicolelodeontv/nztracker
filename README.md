# 🥷 Ninja Zenshin Clan Tracker 3.0

A community-built Ninja Zenshin operations dashboard for live clan ranking, member reputation monitoring, durable background history, FD operations, alerts, timelines and Discord-ready reporting.

**Live site:** https://nztracker.vercel.app/

**Source:** https://ninjazenshin.online/?panel=clan-ranking

## 3.0 upgrades

### ⚡ True 1-second Live Mode

The open dashboard refreshes live clan ranking every second. The selected clan's member panel also refreshes every second while open. The countdown and server clock update independently every second.

### ⏱️ Background Sync Command Center

The dashboard exposes the durable monitor heartbeat:

**Background Sync · Last Snapshot · Next Expected · Clans · Members · History · Source**

The background monitor runs independently of an open browser through GitHub Actions every 5 minutes and persists snapshots to private Vercel Blob.

### 💾 Server history is the source of truth

Member **Before / Gain / 6H / 24H / Total** calculations are based on durable server-side timestamp history first. Browser localStorage is used only as a fallback when server history cannot be read.

History is stored as:

**Season → Clan → Member → timestamped reputation points**

Up to 30 days are retained. A point is sampled every 5 minutes or immediately when reputation changes.

### 📈 Member intelligence

The Live Member Data panel provides:

**1H · 3H · 5H · 6H · 12H · 24H · 7D**

and includes:

- Before / After / Gain
- Gain per hour
- 6H and 24H gain
- Active, Recent, Idle, No Gain, Missing and Reset states
- Rep change event log
- Activity timeline
- Rep trend visualization
- Automatic alerts
- Top contributors

### 🎯 FD Operations Mode

FD Mode highlights current clan rank, 24H gain, active members, members under the 10,000 rep target, mini-burn candidates, top contributors, and reset/missing warnings.

### 🚨 Automatic alerts

The tracker detects and flags:

**+10K gain · fast gain · no activity · rep reset · missing history**

Unexpected negative reputation movement is treated as a reset rather than counted as positive gain.

### 🛡️ Data integrity protection

The monitor rejects or excludes unsafe snapshots when it encounters stale upstream member data, empty member responses, duplicate member records, source errors, partial member responses, or reputation resets.

### 📊 Clan Intelligence

The dashboard provides a focused intelligence panel for the primary clan (CHAOS when present):

**Rank · Reputation · 24H Gain · Active Members · Gap to #1 · Lead over next clan · Top contributors**

### 📜 Rep Change Event Log

Member reputation changes are normalized into timestamped events with **Time · Member · Change · Rate/H · Type**.

Filters include **ALL · CHAOS · 1K+ · 5K+ · RESET**.

### 📤 One-click reporting

CSV exports include member intelligence and event history. The Discord report can be copied directly into Discord.

## Background architecture

```text
GitHub Actions (every 5 minutes)
              ↓
        /api/monitor
              ↓
     Ninja Zenshin source
              ↓
   live member validation
              ↓
      private Vercel Blob
              ↓
   server-side reputation history
              ↓
       Before → Gain → After
```

The open browser does not need to stay running for member history to accumulate.

## API routes

- `/api/clan-ranking` — live Ninja Zenshin clan ranking parser.
- `/api/clan-members` — live member data with upstream recovery and last-known protection.
- `/api/member-history` — durable season-separated timestamped reputation history.
- `/api/health` — service and durable-storage readiness.
- `/api/monitor` — scheduled validated snapshot collector.
- `/api/sync-status` — durable monitor heartbeat used by the Background Sync Command Center.

## Storage

NZ Tracker 3.0 uses **private Vercel Blob** for durable history and monitor status. Neon is not used.

When durable storage is unavailable, the UI explicitly falls back to local history instead of claiming that the data is durable.

## Tech stack

- Next.js 16
- React 19
- JavaScript
- CSS
- Cheerio
- `@vercel/blob` 2.8.0
- Vercel
- Node.js 24.x
