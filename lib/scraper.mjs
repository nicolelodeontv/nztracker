import { fetchGamePage } from './game-source.mjs';

export const GAME_SOURCE = 'https://ninjazenshin.online/';

export async function scrapeGame() {
  return fetchGamePage();
}

export async function scrapeClans() {
  const page = await scrapeGame();
  if (!page.clanRanking?.length) throw new Error('Game source returned no clan ranking rows.');
  return {
    rows: page.clanRanking,
    season: page.season,
    countdown: null,
    capturedAt: page.capturedAt,
    source: GAME_SOURCE
  };
}
