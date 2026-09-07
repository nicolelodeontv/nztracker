# 🥷 Ninja Zenshin Clan Tracker

A community-built live tracker for monitoring **Ninja Zenshin Clan Ranking** data in a compact dark interface focused on fast, reliable clan monitoring.

**Live site:** https://nztracker.vercel.app/

**Source:** https://ninjazenshin.online/?panel=clan-ranking

## ✨ Features

### 🏆 Live Clan Ranking

The main workspace displays the current clan ranking in a compact table:

**# · Clan · Master · Members · Reputation · Gain · Total Gain**

The tracker refreshes ranking data automatically and keeps the interface focused on the information needed for quick clan monitoring.

### 👥 Live Clan Members

Click a clan name to open its live member panel.

Member data includes:

**# · Member · Lv · Rep · Gain · Total Gain**

Member information is refreshed while the member panel is open. The tracker uses the live Ninja Zenshin source first and falls back to the AMF member service when necessary.

### 📈 Gain & Total Gain Tracking

The browser keeps local reputation history so the tracker can calculate:

- Reputation gain between refreshes
- Total accumulated gain during the current browser session/history window
- Per-member gain and total gain when member history is available locally

No server database is required for these calculations.

### 🔄 Automatic Live Refresh

- Clan ranking refresh: every 3 seconds
- Selected clan members refresh: every 3 seconds while the member panel is open
- Live source requests use fresh, uncached data
- Server time and season countdown are displayed in the tracker

### ⇩ CSV Export

The Live Members panel includes an **Export** action for the currently displayed member list.

Export columns:

**# · Member · Lv · Rep · Gain · Total Gain**

The CSV is generated directly in the browser and includes a UTF-8 BOM for spreadsheet compatibility.

### 🌓 Compact Dark UI

The interface is designed as a compact monitoring tool rather than a large dashboard, with responsive behavior for desktop and mobile screens.

Current visual system includes:

- Dark command-center styling
- Compact ranking and member tables
- Responsive mobile layout
- Lightweight UI with minimal navigation
- Custom Ninja Zenshin favicon
- Geist / Geist Mono typography

### 💾 Browser-Only Local State

The tracker does **not** use Neon, Postgres, or another application database.

Browser `localStorage` is used for local preferences and reputation history used by gain calculations. Live clan and member data is requested from the source through the Next.js API routes.

## 🧩 Data Flow

```text
Ninja Zenshin
     │
     ├── Clan Ranking ───────────────┐
     │                              │
     └── Clan Members ──────────────┤
                                    ▼
                           Next.js API routes
                          ┌─────────┴─────────┐
                          │                   │
                   /api/clan-ranking   /api/clan-members
                          │                   │
                          └─────────┬─────────┘
                                    ▼
                                Tracker UI
                                    │
                                    ▼
                              Browser storage
```

### Clan Ranking API

`/api/clan-ranking` retrieves and parses the live Ninja Zenshin clan ranking source.

### Clan Members API

`/api/clan-members` retrieves live clan member data, using the live ranking/member source as the primary path and the AMF service as a fallback.

### Monitor API

`/api/monitor` performs a scheduled live health/data check in Vercel production.

Vercel Cron is configured to invoke it daily.

## 🛠️ Tech Stack

- Next.js 16
- React 19
- JavaScript
- CSS
- Cheerio
- Vercel
- Node.js 24.x
- Browser `localStorage`
- Geist / Geist Mono

## 📁 Project Structure

```text
app/
├── api/
│   ├── clan-members/
│   ├── clan-ranking/
│   └── monitor/
├── lib/
│   ├── game-rules.mjs
│   ├── source-parser.mjs
│   └── stamina.mjs
├── globals.css
├── layout.js
├── page.js
├── tracker.css
└── ui-fixes.css

.github/
└── workflows/
    └── build.yml

vercel.json
package.json
README.md
```

## 🚀 Run Locally

Requirements:

- Node.js 24.x
- npm

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

## ✅ Tests

Run the Node test suite:

```bash
npm test
```

## 📦 Production Build

Create a production build:

```bash
npm run build
```

Start the production server:

```bash
npm start
```

## ☁️ Vercel Deployment

Repository:

```text
nicolelodeontv/nztracker
```

Production branch:

```text
main
```

The project is configured for Next.js deployment on Vercel.

### Scheduled Cron

`vercel.json` configures:

```text
/api/monitor
0 0 * * *
```

## 🔐 Environment Variables

The main live tracker does not require a database connection or database environment variables.

Discord-related functionality, when enabled by the deployment, can use:

```text
DISCORD_WEBHOOK_URL
```

## ⚠️ Live Data Notes

Ninja Zenshin source availability can change independently of this tracker. The application includes fallback handling for member data and avoids treating unavailable authoritative stamina information as confirmed live stamina.

The tracker should therefore be treated as a monitoring aid rather than an official game data service.

## 👤 Credit

Created by **Michol**

Discord: https://discordapp.com/users/396080330702061588

## ⚠️ Disclaimer

This is an independent community tracker and is not affiliated with, endorsed by, or officially connected to Ninja Zenshin or its operators.
