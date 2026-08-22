# Ninja Zenshin Live Clan Tracker

A lightweight live dashboard for monitoring **Ninja Zenshin Clan Ranking** data in a dedicated dark gaming-style interface.

## Live Tracker

The tracker pulls the current Clan Ranking from Ninja Zenshin and refreshes automatically every 30 seconds.

Source:

`https://ninjazenshin.online/?panel=clan-ranking`

## Features

### Clan Ranking

- Live Season / Clan Ranking data
- Clan rank, name, master, member count, and reputation
- Automatic 30-second refresh
- Manual refresh button
- Auto-refresh ON/OFF toggle
- Search by clan name or master
- Sort clans by rank, reputation, or member count
- Favorites / pinned clans
- Rank movement indicators
- Member-capacity progress bars
- Clan reputation history stored locally in the browser
- Clan history export as **CSV** or **JSON**
- Reputation gain and reputation-per-minute calculations
- Reputation history chart

### Live Members

Click any clan in the ranking to open its live member panel.

The member panel displays:

- Member name
- Level
- Individual reputation
- Reputation change between live refreshes
- Live status and last update time
- Automatic refresh while the clan is open
- Sortable member columns

Member sorting is available directly from the table headers:

- `#`
- `MEMBER`
- `LEVEL`
- `REPUTATION`
- `Δ REP`

Click a header again to reverse the sort direction.

### Member Reputation History

Member reputation snapshots are collected in the background while the live member panel is open.

History is stored locally in the browser and can be downloaded without a database connection.

Exports include:

- **CSV** — for Excel, Google Sheets, and data analysis
- **JSON** — for complete snapshot data

The download controls are available directly at the top of the live member panel.

## Ninja Zenshin Member API

The tracker uses the same member endpoint used by the Ninja Zenshin Clan Ranking page:

```text
https://ninjazenshin.online/clan-ranking/members/{clanId}
```

The API returns member information including:

- `name`
- `level`
- `rep`

The tracker fetches this server-side through its own Next.js API route.

## Architecture

```text
Ninja Zenshin
     │
     ├── Clan Ranking
     │       └── /api/clan-ranking
     │
     └── Clan Members
             └── /api/clan-members
                     │
                     ▼
              Next.js Tracker
                     │
                     ├── Live ranking
                     ├── Live members
                     ├── Local history
                     └── CSV / JSON export
```

## Local History

History is stored using browser `localStorage`.

This means:

- No account is required
- No external database is required
- History stays on the device/browser where the tracker is being used
- Clearing browser site data can remove stored history

## Tech Stack

- Next.js
- React
- JavaScript
- Vercel
- JetBrains Mono
- Browser `localStorage` for history

## Run Locally

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

## Build for Production

```bash
npm run build
npm start
```

## Deploy to Vercel

This project is configured for Vercel and can be deployed from the GitHub repository using the standard Next.js deployment settings.

## Notes

The tracker is designed specifically around the **Clan Ranking** section. It does not track the PvE Leaderboard or PvP Leaderboard.

Live data availability depends on the Ninja Zenshin website and its member-ranking endpoints being reachable from the deployment environment.

## Disclaimer

This project is an independent community tracker and is not affiliated with, endorsed by, or officially connected to Ninja Zenshin or its operators.
