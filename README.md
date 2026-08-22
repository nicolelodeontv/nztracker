# Ninja Zenshin Live Clan Tracker

A lightweight live dashboard for the Ninja Zenshin clan ranking page.

## Features

- Server-side fetch of `https://ninjazenshin.online/?panel=clan-ranking` to avoid browser CORS restrictions
- Auto refresh every 30 seconds
- Manual refresh and auto-refresh toggle
- Search by clan or master
- Sort by rank, reputation, or members
- Top-clan summary cards
- Member-capacity bars
- Rank movement based on the previous client snapshot
- Responsive dark UI using JetBrains Mono

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Deploy

This is ready for Vercel. Import the repository, use the default Next.js settings, and deploy.
