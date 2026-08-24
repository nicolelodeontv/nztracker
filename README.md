# 🥷 Ninja Zenshin Live Clan Tracker

A community-built live tracker for monitoring **Ninja Zenshin Clan Ranking** data in a compact dark interface focused on fast clan-war monitoring.

**Live site:** https://nztracker.vercel.app/

**Source:** https://ninjazenshin.online/?panel=clan-ranking

## ✨ Features

### 🏆 Live Clan Ranking

The main ranking table keeps the core layout simple:

**# · Clan · Master · Members · Reputation · Gain · Total Gain**

Includes:

- Live clan ranking data
- Clan master and member counts
- Reputation and gain tracking
- Search by clan or master
- Member-capacity indicators
- Top-clan podium cards
- Automatic background refresh
- Live sync status and latest update time
- Responsive desktop and mobile layout

### 👥 Live Clan Members

Click a clan to open its live member panel.

The member table can show:

- Member name
- Level
- Reputation
- Gain
- Total Gain
- Live member count
- Last synchronization time

Member data refreshes while the clan panel is open.

### ↕️ Member Sorting

Sort the Live Members table by:

- Member name
- Level
- Reputation
- Gain
- Total Gain

### ⇩ CSV Export

Live Members can be exported as CSV for spreadsheet use.

The export contains:

- MEMBER
- LEVEL
- REPUTATION
- GAIN
- TOTAL GAIN

There is no member import feature in the current version.

### ⭐ Watchlist

Star clans directly from the ranking table to create a personal browser-based watchlist.

Watchlist state is stored locally on the current device and does not require an account.

### ⚔️ Clan War Monitor

The Clan War view highlights clans with the highest recent pressure based on the live ranking feed.

The monitor can show:

- Clan reputation
- Recent gain
- Member count
- Current bleeding-state availability

The tracker intentionally shows the bleeding state as **UNKNOWN** when the source does not expose the underlying stamina data instead of guessing.

### 🩸 Discord Bleeding Reminders

Optional Discord notifications can use the configured webhook to send staged bleeding reminders such as:

```text
⚠️ BLEED! Shad0w Ninja Clan — ~12 min
Approximately 12 minutes left in the attack. Shad0w Ninja Clan is still bleeding!

🔴 BLEED! Shad0w Ninja Clan — ~6 min
~6 mins left! Shad0w Ninja Clan is still bleeding!
```

Discord alerts use the bot identity:

**CHAOS Tracker - Bot**

Because the current ranking source does not expose authoritative member stamina/bleeding state, the tracker uses available live reputation changes and countdown information for these reminders. It does not claim to directly verify stamina-based bleeding when that data is unavailable.

### 🔔 Browser & Rank Alerts

Optional browser notifications can alert you when:

- A member reaches the configured gain threshold
- A clan changes rank

### ⏱️ Season Countdown

The tracker includes a live season countdown showing:

- Days
- Hours
- Minutes
- Seconds

### ⚙️ Settings

Settings currently include controls for:

- Automatic live refresh
- Compact rows
- Browser alerts
- Rank alerts
- Reputation gain threshold
- Discord bleeding reminders

Settings are stored locally in the browser.

## 🎨 Design & Typography

The current UI uses a dark, compact command-center style designed for quick scanning during clan wars.

### Font pairing

**Space Mono + Plus Jakarta Sans**

- **Plus Jakarta Sans** — titles, clan names, headings, controls, and general UI text
- **Space Mono** — ranks, table headers, reputation, gains, countdowns, timestamps, and technical labels

The UI uses restrained cyan/green accents, compact spacing, strong table alignment, subtle hover states, and gain animations without excessive visual clutter.

### Gain feedback

When a tracked reputation value increases, the interface provides a small visual gain-pop effect to make live changes noticeable without interrupting the table.

## 🔄 Live Synchronization

The tracker retrieves live data through Next.js API routes and refreshes in the background.

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
                    ├── Watchlist
                    ├── Clan War monitor
                    ├── Discord reminders
                    └── Season countdown
```

Live availability depends on the Ninja Zenshin source and its endpoints being reachable from the deployed environment.

## 💾 Local Data

Some preferences and watchlist/history state are stored in browser `localStorage`.

This means:

- No account is required
- No database is required for local preferences
- Watchlist/settings are tied to the current browser/device
- Clearing browser site data can remove locally stored state

## 🛠️ Tech Stack

- Next.js
- React
- JavaScript
- CSS
- Vercel
- Plus Jakarta Sans
- Space Mono
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

For Discord bleeding reminders, configure the server environment variable:

```text
DISCORD_WEBHOOK_URL
```

## 👤 Credit

Created by **Michol**

Discord: https://discordapp.com/users/396080330702061588

## ⚠️ Disclaimer

This is an independent community tracker and is not affiliated with, endorsed by, or officially connected to Ninja Zenshin or its operators.
