# 🥷 Ninja Zenshin Live Clan Tracker

A community-built live tracker for monitoring **Ninja Zenshin Clan Ranking** data in a compact dark interface focused on fast clan-war monitoring.

**Live site:** https://nztracker.vercel.app/

**Clan Intelligence:** https://nztracker.vercel.app/

**Clan War / Battle Monitor:** https://nztracker.vercel.app/war

**Clan War Rules:** https://nztracker.vercel.app/rules

**Source:** https://ninjazenshin.online/?panel=clan-ranking

## ✨ Features

### 🏆 Clan Intelligence

The main ranking workspace focuses on fast live monitoring:

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
- Gain-pop feedback when reputation changes

### 👥 Live Clan Members

Click a clan to open its live member panel.

The member table can show:

- Member name
- Level
- Reputation
- Stamina when exposed by the source
- Maximum Stamina when exposed by the source
- Bleeding threshold
- Drain floor
- Gain
- Total Gain
- Live synchronization time

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

The export includes:

- MEMBER
- LEVEL
- REPUTATION
- GAIN
- TOTAL GAIN

### ⭐ Watchlist

Star clans directly from the ranking table to create a personal browser-based watchlist.

Watchlist state is stored locally on the current device and does not require an account.

### ⚔️ Clan War / Battle Monitor

The dedicated Battle Monitor is available at:

**https://nztracker.vercel.app/war**

It separates Clan War decision-making from the main ranking workspace and includes:

- Confirmed Bleeding clans
- Potential Bleed signals from partial Stamina data
- Unknown Stamina state when the source cannot verify it
- Best Targets ranked by expected victory reward
- Attack Ready / Do Not Attack decisions
- Party-size defender drain calculation
- Reputation-difference reward calculation
- Live rank-change and Clan War event feed
- Watchlist monitoring
- Recovery countdown for the next `:00 / :30` recovery
- Data-health indicators
- Discord Test Alert and Discord configuration status
- Quick Battle rules

The tracker does **not** invent a Bleeding state when authoritative Stamina data is unavailable.

### 🩸 Stamina-Based Bleeding

The current Clan War rules use the member's own Maximum Stamina:

- **Bleeding threshold:** 70% of Maximum Stamina
- **Drain floor:** 50% of Maximum Stamina
- **Clan Bleeding:** at least 50% of members are at or below their individual threshold

Examples:

| Maximum Stamina | Drain Floor | Bleeding Threshold |
|---:|---:|---:|
| 100 | 50 | 70 |
| 150 | 75 | 105 |
| 200 | 100 | 140 |

When only partial member Stamina data is available, the monitor shows **Potential Bleed** rather than claiming confirmed Bleeding.

### ⚔️ Reputation Rewards

Victory rewards use the current Quick Battle reputation-difference table:

| Reputation Difference | Victory Reward |
|---:|---:|
| ≥ +20,000 | 30 Rep |
| ≥ +10,000 | 25 Rep |
| ≥ +2,000 | 20 Rep |
| ±2,000 | 15 Rep |
| ≥ -10,000 | 12 Rep |
| ≥ -20,000 | 9 Rep |
| ≥ -30,000 | 6 Rep |
| ≥ -40,000 | 4 Rep |
| ≥ -50,000 | 2 Rep |
| < -50,000 | 1 Rep |

A non-Bleeding target produces **0 Reputation** in Quick Battle.

### 🩸 CHAOS Tracker - Bot

Discord notifications use the bot identity:

**CHAOS Tracker - Bot**

The Battle Monitor can send staged Clan War alerts such as:

```text
⚠️ BLEED! Shad0w Ninja Clan — ~12 min
Approximately 12 minutes left in the attack. Shad0w Ninja Clan is still bleeding!

🔴 BLEED! Shad0w Ninja Clan — ~6 min
~6 mins left! Shad0w Ninja Clan is still bleeding!

🟢 BLEED CLEARED — Shad0w Ninja Clan
```

The dashboard also provides:

- Discord webhook health status
- Test Alert
- State-based reminder protection to reduce duplicates

For the server-side integration, configure:

```text
DISCORD_WEBHOOK_URL
```

### 📜 Clan War Rules

The complete current rules are available at:

**https://nztracker.vercel.app/rules**

The rules page covers:

- Basic Quick Battle rules
- Bleeding detection
- Stamina drain
- Attacker Stamina
- Stamina recovery
- Reputation rewards

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
- Discord alert settings

Settings are stored locally in the browser.

## 🎨 Design & Typography

The UI uses a dark command-center style designed for quick scanning during clan wars.

### Font pairing

**Space Mono + Plus Jakarta Sans**

- **Plus Jakarta Sans** — titles, clan names, headings, controls, and general UI text
- **Space Mono** — ranks, table headers, reputation, gains, countdowns, timestamps, and technical labels

Clan Intelligence and Clan War share the same wide layout system, spacing, dark panels, responsive behavior, and typography.

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
                    ├── Clan Intelligence
                    ├── Live Members
                    ├── Watchlist
                    ├── Clan War / Battle Monitor
                    ├── Discord alerts
                    └── Season countdown
```

Live availability depends on the Ninja Zenshin source and its endpoints being reachable from the deployed environment.

## 💾 Local Data

Some preferences, watchlist state, event history, and local snapshots are stored in browser `localStorage`.

This means:

- No account is required
- No database is required for local browser preferences and monitoring state
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

Battle Monitor:

```text
http://localhost:3000/war
```

Rules:

```text
http://localhost:3000/rules
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

For Discord alerts, configure the server environment variable:

```text
DISCORD_WEBHOOK_URL
```

A GitHub Actions build check is also configured to run `npm ci` and `npm run build` on pushes and pull requests.

## 👤 Credit

Created by **Michol**

Discord: https://discordapp.com/users/396080330702061588

## ⚠️ Disclaimer

This is an independent community tracker and is not affiliated with, endorsed by, or officially connected to Ninja Zenshin or its operators.
