import { parseRankingHtml } from './source-parser.mjs';

export const GAME_SOURCE = 'https://ninjazenshin.online/?panel=clan-ranking';

export async function scrapeClans() {
  const capturedAt = new Date().toISOString();
  const url = `${GAME_SOURCE}&_sync=${Date.now()}`;
  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      'User-Agent': 'Mozilla/5.0 NinjaZenshinTracker/4.0',
      Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
      'Cache-Control': 'no-cache'
    }
  });
  if (!response.ok) throw new Error(`Game source returned HTTP ${response.status}`);
  const html = await response.text();
  const parsed = parseRankingHtml(html);
  if (!parsed.rows?.length) throw new Error('Game source returned no clan rows');
  return { ...parsed, capturedAt, source: GAME_SOURCE };
}
