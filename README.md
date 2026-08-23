# 🥷 Ninja Zenshin Live Clan Tracker

A live community-built dashboard for monitoring **Ninja Zenshin Clan Ranking** data in a clean, dark gaming interface.

**Live site:** https://nztracker.vercel.app/

**Source:** https://ninjazenshin.online/?panel=clan-ranking

## ✨ Features

### 🏆 Live Clan Ranking

- Live clan rank, clan name, master, members, reputation, gain, and total gain
- Automatic background synchronization
- Search by clan name or master
- Member-capacity progress bars
- Top-clan podium view
- Live/updated/server-time indicators
- Responsive desktop, tablet, and mobile layout
- Dark Ninja Command Center visual design

### 👥 Live Clan Members

Click a clan to open its live member panel.

The member view can display:

- Member name
- Level
- Individual reputation
- Reputation gain
- Total reputation gain
- Live member count
- Last synchronization time

Member data is refreshed while the clan panel is open.

### ↕️ Member Sorting

The live member table supports sorting by:

- Member name
- Level
- Reputation
- Gain
- Total Gain

Click a column header to sort. Click it again to reverse the order.

### ⏱️ Season Countdown

The dashboard includes a live season countdown showing:

- Days
- Hours
- Minutes
- Seconds

The countdown remains visible as part of the season overview.

### ⚙️ Settings

The Settings panel provides controls for:

- Automatic live refresh
- Compact table rows

Settings are kept locally in the browser.

### 📊 Local Tracking & Exports

The tracker can maintain local reputation/history information in the browser and supports data export where available.

Exports use:

- **CSV** for spreadsheets and analysis
- **JSON** for structured data

## 🎨 Design

The current interface uses a **dark Ninja Command Center** style designed around readability and fast data scanning.

- Dark near-black background
- Cyan and violet accents
- Space Grotesk for major headings
- Manrope for UI text
- JetBrains Mono for data, timestamps, and statistics
- Responsive spacing and overflow handling for long clan/member names
- Subtle hover states and restrained glow effects

The layout intentionally avoids excessive neon effects so large ranking tables remain easy to read.

## 🔄 Live Synchronization

The dashboard retrieves live data through Next.js API routes and refreshes in the background.

```text
Ninja Zenshin
     │
     ├── Clan Ranking
     │      └── /api/clan-ranking
     │
     └── Clan Members
            └── /api/clan-members
                    │
                    ▼
             Next.js Tracker
                    │
                    ├── Live ranking
                    ├── Live members
                    ├── Season countdown
                    ├── Reputation tracking
                    └── Responsive UI
```

Live availability depends on the Ninja Zenshin source and its endpoints being reachable from the deployed environment.

## 💾 Local Data

Some tracker state is stored in browser `localStorage`.

This means:

- No account is required
- No external database is required for local state
- Data is tied to the browser/device being used
- Clearing browser site data can remove locally stored information

## 🛠️ Tech Stack

- Next.js
- React
- JavaScript
- CSS
- Vercel
- JetBrains Mono
- Space Grotesk
- Manrope
- Browser `localStorage`

## 🚀 Run Locally

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

## 📦 Production Build

```bash
npm run build
npm start
```

## ☁️ Deploy to Vercel

The project is designed to deploy through Vercel using the GitHub repository:

```text
nicolelodeontv/nztracker
```

The production branch is `main`.

## 👤 Credit

Created by **Michol**

Discord: https://discordapp.com/users/396080330702061588

## ⚠️ Disclaimer

This is an independent community tracker and is not affiliated with, endorsed by, or officially connected to Ninja Zenshin or its operators.