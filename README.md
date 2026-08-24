# 🥷 Ninja Zenshin Live Clan Tracker

A community-built live tracker for monitoring **Ninja Zenshin Clan Ranking** data in a compact dark interface focused on fast clan-war monitoring.

**Live site:** https://nztracker-eight.vercel.app/

**Clan Intelligence:** https://nztracker-eight.vercel.app/

**Clan War / Battle Monitor:** https://nztracker-eight.vercel.app/war

**Clan War Rules:** https://nztracker-eight.vercel.app/rules

**Source:** https://ninjazenshin.online/?panel=clan-ranking

## ✨ Features

### 🏆 Clan Intelligence

The main ranking workspace focuses on fast live monitoring:

**# · Clan · Master · Members · Reputation · Gain · Total Gain**

Includes live ranking data, member counts, reputation/gain tracking, search, watchlist, background refresh, sync status, gain-pop feedback, and responsive desktop/mobile layouts.

### 👥 Live Clan Members

Click a clan to open its live member panel. The member table can show member name, level, reputation, Stamina when exposed by the source, Maximum Stamina, Bleeding threshold, drain floor, Gain, Total Gain, and synchronization time.

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

| Maximum Stamina | Drain Floor | Bleeding Threshold |
|---:|---:|---:|
| 100 | 50 | 70 |
| 150 | 75 | 105 |
| 200 | 100 | 140 |

Partial Stamina coverage is shown as **Potential Bleed** rather than confirmed Bleeding.

### ⚔️ Reputation Rewards

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

A non-Bleeding Quick Battle target produces **0 Reputation**.

### 🩸 CHAOS Tracker - Bot

Discord notifications use **CHAOS Tracker - Bot** and can send staged Clan War alerts such as Bleed Detected, ~12-minute reminder, ~6-minute reminder, and Bleed Cleared. The Battle Monitor also provides webhook health status, Test Alert, and duplicate-protection logic.

Configure the server environment variable:

```text
DISCORD_WEBHOOK_URL
```

### 📜 Clan War Rules

**https://nztracker-eight.vercel.app/rules**

The rules page covers Quick Battle rules, Bleeding, Stamina drain, attacker Stamina, recovery, and reputation rewards.

## 🎨 Design & Typography

The UI uses a dark command-center style with the **Space Mono + Plus Jakarta Sans** pairing. Clan Intelligence and Clan War share the same wide layout system, spacing, dark panels, responsive behavior, and typography.

## 🔄 Live Synchronization

Live data is retrieved through Next.js API routes and refreshed in the background.

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

## 💾 Local Data

Preferences, watchlist state, event history, and monitoring snapshots use browser `localStorage`. No account is required for these local features.

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

Discord environment variable:

```text
DISCORD_WEBHOOK_URL
```

A GitHub Actions build check runs `npm ci` and `npm run build` on pushes and pull requests.

## 👤 Credit

Created by **Michol**

Discord: https://discordapp.com/users/396080330702061588

## ⚠️ Disclaimer

This is an independent community tracker and is not affiliated with, endorsed by, or officially connected to Ninja Zenshin or its operators.
