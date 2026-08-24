# 🥷 Ninja Zenshin Live Clan Tracker

A community-built live tracker for monitoring **Ninja Zenshin Clan Ranking** data in a compact dark interface focused on fast clan-war monitoring.

**Live site:** https://nztracker-eight.vercel.app/

**Clan Intelligence:** https://nztracker-eight.vercel.app/

**Clan War / Battle Monitor:** https://nztracker-eight.vercel.app/war

**Clan War Rules:** https://nztracker-eight.vercel.app/rules

**Source:** https://ninjazenshin.online/?panel=clan-ranking

## ✨ Features

### 🏆 Clan Intelligence

The main ranking workspace focuses on fast monitoring:

**# · Clan · Master · Members · Reputation · Gain · Total Gain**

Includes ranking data, member counts, reputation/gain tracking, search, watchlist, background refresh, sync status, gain-pop feedback, and responsive desktop/mobile layouts.

### 👥 Live Clan Members

Click a clan to open its member panel. The member table can show member name, level, reputation, Stamina when exposed by the source, Maximum Stamina, Bleeding threshold, drain floor, Gain, Total Gain, and synchronization time.

### ⚡ Live-Only Monitoring

The tracker now runs **without Neon, Postgres, or any other database**. Ranking and member information is requested directly from Ninja Zenshin through the Next.js API routes.

```text
Ninja Zenshin
     │
     ├── Clan Ranking ────────┐
     └── Clan Members ────────┤
                              ▼
                     Next.js API routes
                    ┌─────────┴─────────┐
                    │                   │
              /api/clan-ranking  /api/clan-members
                    │                   │
                    └─────────┬─────────┘
                              ▼
                         Tracker UI
```

Browser `localStorage` continues to handle watchlists, preferences, and local history used for gain calculations. Nothing is persisted to a server database.

### ⏱️ Scheduled Monitor

Vercel production Cron invokes `/api/monitor` automatically on its configured schedule. The monitor is now a **live-only health/data check**: it fetches the current clan ranking and attempts to count live clan members, then returns a JSON result. It does not require `CRON_SECRET` or a database.

### ⇩ CSV Export

Live Members can be exported as CSV containing **MEMBER, LEVEL, REPUTATION, GAIN, TOTAL GAIN**.

### ⚔️ Clan War / Battle Monitor

**https://nztracker-eight.vercel.app/war**

The dedicated Battle Monitor separates Clan War decision-making from the ranking workspace and includes confirmed Bleeding, Potential Bleed, Unknown Stamina state, Best Targets, Attack Ready / Do Not Attack decisions, party-size drain calculation, reputation reward calculation, live event feed, watchlist monitoring, recovery countdown, data health, and Discord Test Alert/configuration status.

The tracker does **not** invent a Bleeding state when authoritative Stamina data is unavailable.

### 🩸 Stamina-Based Bleeding

- **Bleeding threshold:** 70% of Maximum Stamina
- **Drain floor:** 50% of Maximum Stamina
- **Clan Bleeding:** at least 50% of members are at or below their individual threshold

### ⚔️ Reputation Rewards

The Battle Monitor calculates victory rewards from the configured reputation-difference rules.

### 🩸 CHAOS Tracker - Bot

Discord notifications use **CHAOS Tracker - Bot** and can send staged Clan War alerts. The Battle Monitor also provides webhook health status, Test Alert, and duplicate-protection logic.

## 🎨 Design & Typography

The UI uses a dark command-center style with the **Space Mono + Plus Jakarta Sans** pairing. Clan Intelligence and Clan War share the same wide layout system, spacing, dark panels, responsive behavior, and typography.

## 🔄 Live Synchronization

Live data is retrieved directly through the Next.js API routes. The ranking and member endpoints use `cache: 'no-store'` so the tracker can request fresh source data during refreshes.

## 💾 Local Data

Preferences, watchlist state, and UI settings continue to use browser `localStorage`. Local browser history is used for reputation gain calculations.

## 🛠️ Tech Stack

- Next.js
- React
- JavaScript
- CSS
- Vercel
- Cheerio
- Plus Jakarta Sans
- Space Mono
- Browser `localStorage`

## 🚀 Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Battle Monitor: `http://localhost:3000/war`

Rules: `http://localhost:3000/rules`

## 📦 Production Build

```bash
npm run build
npm start
```

## ☁️ Deploy to Vercel

Repository:

```text
nicolelodeontv/nztracker
```

Production branch: `main`

Discord:

```text
DISCORD_WEBHOOK_URL
```

## 👤 Credit

Created by **Michol**

Discord: https://discordapp.com/users/396080330702061588

## ⚠️ Disclaimer

This is an independent community tracker and is not affiliated with, endorsed by, or officially connected to Ninja Zenshin or its operators.
