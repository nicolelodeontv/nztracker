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

### 💾 Server-Side Monitoring — v1.2

The tracker now has a **Neon Postgres persistence layer** and a server-side monitoring endpoint. Scheduled collection stores clan rankings, member snapshots, and monitor-run status so gain history no longer depends only on a browser tab remaining open.

```text
Ninja Zenshin
     │
     ├── Clan Ranking ─────────┐
     └── Clan Members ────────┤
                              ▼
                     /api/monitor
                              │
                              ▼
                       Neon Postgres
                    ┌─────────┼─────────┐
                    │         │         │
              clan snapshots  │  monitor runs
                    │         │
                    └── member snapshots
                              │
                              ▼
                     Next.js API routes
                              │
                              ▼
                       Tracker UI
```

The ranking and member APIs prefer the latest stored snapshot and automatically fall back to the live Ninja Zenshin source when the database has no data or is unavailable.

### ⏱️ Scheduled Collection

Vercel production Cron invokes `/api/monitor` automatically. The current repository is configured for a **daily schedule** because the connected Vercel account is on the Hobby plan; Vercel currently limits Hobby cron jobs to once per day, while higher plans support more frequent schedules. citeturn2search0turn2search4

For the intended near-real-time monitoring cadence, move the project to a Vercel plan that supports more frequent Cron Jobs or use an external scheduler to invoke `/api/monitor`.

### 🔐 Environment Variables

```text
DATABASE_URL
CRON_SECRET
DISCORD_WEBHOOK_URL
```

`DATABASE_URL` points to the Neon Postgres database. `CRON_SECRET` protects the scheduled monitoring endpoint using the Authorization header pattern recommended by Vercel. citeturn1search0turn2search0

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

Live data is retrieved through Next.js API routes. Server-side monitoring now persists snapshots in Neon, while the UI continues to receive a live-compatible API response.

## 💾 Local Data

Preferences, watchlist state, and UI settings continue to use browser `localStorage`. Historical clan/member monitoring is now persisted server-side when Neon is configured.

## 🛠️ Tech Stack

- Next.js
- React
- JavaScript
- CSS
- Vercel
- Neon Postgres
- `@neondatabase/serverless`
- Plus Jakarta Sans
- Space Mono
- Browser `localStorage`

## 🚀 Run Locally

```bash
npm install
npm run dev
```

Set `DATABASE_URL` and `CRON_SECRET` in `.env.local` when testing server-side monitoring.

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

Required environment variables for server-side monitoring:

```text
DATABASE_URL
CRON_SECRET
```

Discord:

```text
DISCORD_WEBHOOK_URL
```

## 👤 Credit

Created by **Michol**

Discord: https://discordapp.com/users/396080330702061588

## ⚠️ Disclaimer

This is an independent community tracker and is not affiliated with, endorsed by, or officially connected to Ninja Zenshin or its operators.
