import { readRankingSnapshot, rankingStorageHealth, recordRankingSnapshot } from '../../lib/ranking-cache';
import { parseRankingHtml } from '../../lib/source-parser.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 15;
const SOURCE = 'https://ninjazenshin.online/?panel=clan-ranking';

async function fetchLiveRanking() {
  const response = await fetch(`${SOURCE}&_nz=${Date.now()}`, { cache: 'no-store', headers: { 'User-Agent': 'Mozilla/5.0 NinjaZenshinLiveTracker/4.0', Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8', 'Cache-Control': 'no-cache', Pragma: 'no-cache' } });
  if (!response.ok) throw new Error(`Game ranking source returned HTTP ${response.status}`);
  const parsed = parseRankingHtml(await response.text());
  if (!parsed.rows?.length) throw new Error('Game ranking source returned no usable clan rows');
  return { ...parsed, fetchedAt: new Date().toISOString(), source: SOURCE };
}

export async function GET(request) {
  const forceRefresh = new URL(request.url).searchParams.has('refresh');
  try {
    if (forceRefresh) {
      try {
        const live = await fetchLiveRanking();
        const stored = await recordRankingSnapshot(live);
        return Response.json({ ok: true, season: live.season || 'Season 2', seasonEndsAt: '2026-09-14T00:00:00+08:00', countdown: live.countdown || null, rows: live.rows, fetchedAt: live.fetchedAt, updatedAt: live.fetchedAt, source: SOURCE, sourceStatus: 'live', rankingCacheStored: Boolean(stored?.stored), storage: rankingStorageHealth() }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
      } catch (liveError) {
        const cached = await readRankingSnapshot();
        if (!cached?.rows?.length) throw liveError;
        return Response.json({ ok: true, season: cached.season || 'Season 2', seasonEndsAt: '2026-09-14T00:00:00+08:00', countdown: cached.countdown || null, rows: cached.rows, fetchedAt: cached.fetchedAt || null, updatedAt: cached.updatedAt || cached.fetchedAt || null, source: cached.source || SOURCE, sourceStatus: 'stale-live-fallback', liveError: liveError instanceof Error ? liveError.message : String(liveError), storage: rankingStorageHealth() }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
      }
    }
    const cached = await readRankingSnapshot();
    if (!cached?.rows?.length) return Response.json({ ok: false, error: 'Ranking dataset is not ready yet.', sourceStatus: 'waiting-for-live-source', storage: rankingStorageHealth() }, { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } });
    return Response.json({ ok: true, season: cached.season || 'Season 2', seasonEndsAt: '2026-09-14T00:00:00+08:00', countdown: cached.countdown || null, rows: cached.rows, fetchedAt: cached.fetchedAt || null, updatedAt: cached.updatedAt || cached.fetchedAt || null, source: cached.source || SOURCE, sourceStatus: 'cached', storage: rankingStorageHealth() }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    return Response.json({ ok: false, error: 'Unable to read the game ranking dataset', details: error instanceof Error ? error.message : String(error), sourceStatus: 'source-error', storage: rankingStorageHealth() }, { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } });
  }
}
