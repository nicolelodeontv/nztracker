# Ninja Zenshin Live Clan Tracker

A live Clan Ranking dashboard for **Ninja Zenshin**, built to make clan rankings, reputation, member activity, and season changes easier to monitor in one place.

## About

**Ninja Zenshin Live Clan Tracker** is an independent community-built tracker that reads the live Ninja Zenshin Clan Ranking data and presents it in a dedicated dark, gaming-style dashboard. It provides live clan rankings, member details, reputation tracking, rank movement, local history, exports, automatic season detection, and a responsive mobile layout.

The tracker is designed for quick monitoring without requiring an account or external database. Local history is stored in the browser, while live ranking and member information is fetched from the Ninja Zenshin source through the deployed application.

**Live Website:** https://nztracker.vercel.app/

**Data Source:** https://ninjazenshin.online/?panel=clan-ranking

## Features

### Live Clan Ranking

- Live clan rank, clan name, master, member count, and reputation
- Automatic updates every **10 seconds**
- No manual refresh button or refresh toggle required
- Search by clan name or master
- Favorites / pinned clans
- Rank movement indicators
- Member-capacity progress bars
- Local clan reputation history
- History export as **CSV** or **JSON**
- Reputation gain and reputation-per-minute calculations
- Reputation history chart
- Season label detected from the live Ninja Zenshin Clan Ranking page
- Responsive layout for desktop, tablet, and mobile screens

The ranking is kept in live rank order from the source. There is no longer a clan sorting dropdown beside Favorites.

### Live Members

Click any clan in the ranking table to open its live member panel.

The member panel can display:

- Member name
- Level
- Individual reputation
- Reputation change between live updates
- Live status and last update time
- Automatic updates while the clan is open

### Member Reputation History

Member reputation snapshots can be collected while a live clan panel is open.

History is stored locally in the browser and can be exported without a database connection.

Exports include:

- **CSV** — for Excel, Google Sheets, and data analysis
- **JSON** — for complete snapshot data

## Season Updates

The tracker is built to detect the current season from the live Ninja Zenshin Clan Ranking page instead of permanently displaying a fixed season number.

When Ninja Zenshin moves to a new season and the source page exposes the new season information in the expected format, the tracker can update the displayed season automatically along with the new ranking data.

## Ninja Zenshin Member API

The tracker uses the Ninja Zenshin clan-member endpoint through its own Next.js API route:

```text
https://ninjazenshin.online/clan-ranking/members/{clanId}
```

Member data can include:

- `name`
- `level`
- `rep`

The tracker fetches member data server-side through `/api/clan-members`.

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
                     ├── Season detection
                     ├── Local history
                     └── CSV / JSON export
```

## Refresh Behavior

- The browser dashboard automatically polls the tracker every **10 seconds**.
- Clan ranking API responses use `no-store` so the tracker can receive current reputation changes on each poll.
- Clan member API responses also use `no-store` for live member reputation updates.
- Live member information continues updating automatically while a clan's member panel is open.

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
- Barlow Condensed
- Rajdhani
- JetBrains Mono
- Browser `localStorage` for history
- Responsive CSS media queries

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

This project is configured for Vercel and can be deployed from the GitHub repository using standard Next.js deployment settings.

## Footer Credit

The live tracker footer credits the project creator as **Created by Michol** and includes a Discord profile link.

Discord: https://discordapp.com/users/396080330702061588

## Notes

The tracker is designed specifically around the **Clan Ranking** section. It does not track the PvE Leaderboard or PvP Leaderboard.

Live data availability depends on the Ninja Zenshin website and its clan-member endpoints being reachable from the deployment environment.

## Disclaimer

This project is an independent community tracker and is not affiliated with, endorsed by, or officially connected to Ninja Zenshin or its operators.
