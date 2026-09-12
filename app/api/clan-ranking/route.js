import { readRankingSnapshot, rankingStorageHealth, recordRankingSnapshot } from '../../lib/ranking-cache';
import { parseRankingHtml } from '../../lib/source-parser.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 15;
const SOURCE = 'https://ninjazenshin.online/?panel=clan-ranking';
const FALLBACK_SEASON_END = '2026-09-14T00:00:00+08:00';

function seasonEndsAt(countdown, capturedAt) {
  const remaining = Number(countdown?.remainingSeconds);
  if (!Number.isFinite(remaining) || remaining < 0) return FALLBACK_SEASON_END;
  const base = new Date(capturedAt || Date.now()).getTime();
  return new Date(base + remaining * 1000).toISOString();
}

async function fetchLiveRanking() {
  const response = await fetch(`${SOURCE}&_nz=${Date.now()}`, {
    cache: 'no-store',
    headers: {
      'User-Agent': 'Mozilla/5.0 NinjaZenshinLiveTracker/5.0',
      Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  });
  if (!response.ok) throw new Error(`Game ranking source returned HTTP ${response.status}`);
  const fetchedAt = new Date().toISOString();
  const parsed = parseRankingHtml(await response.text());
  if (!parsed.rows?.length) throw new Error('Game ranking source returned no usable clan rows');
  return { ...parsed, fetchedAt, source: SOURCE, seasonEndsAt: seasonEndsAt(parsed.countdown, fetchedAt) };
}

function responseFor(snapshot, sourceStatus, extra = {}) {
  const fetchedAt = snapshot?.fetchedAt || snapshot?.updatedAt || null;
  return {
    ok: true,
    season: snapshot?.season || 'Season 2',
    seasonEndsAt: snapshot?.seasonEndsAt || seasonEndsAt(snapshot?.countdown, fetchedAt) || FALLBACK_SEASON_END,
    countdown: snapshot?.countdown || null,
    rows: snapshot?.rows || [],
    fetchedAt,
    updatedAt: snapshot?.updatedAt || fetchedAt,
    source: snapshot?.source || SOURCE,
    sourceStatus,
    ...extra,
  };
}

export async function GET(request) {
  const forceRefresh = new URL(request.url).searchParams.has('refresh');
  try {
    if (forceRefresh) {
      try {
        const live = await fetchLiveRanking();
        const stored = await recordRankingSnapshot(live);
        return Response.json(responseFor(live, 'live', {
          updatedAt: live.fetchedAt,
          rankingCacheStored: Boolean(stored?.stored),
          storage: rankingStorageHealth(),
        }), { headers: { 'Cache-Control': 'no-store, max-age=0' } });
      } catch (liveError) {
        const cached = await readRankingSnapshot();
        if (!cached?.rows?.length) throw liveError;
        return Response.json(responseFor(cached, 'stale-live-fallback', {
          liveError: liveError instanceof Error ? liveError.message : String(liveError),
          storage: rankingStorageHealth(),
        }), { headers: { 'Cache-Control': 'no-store, max-age=0' } });
      }
    }

    const cached = await readRankingSnapshot();
    if (!cached?.rows?.length) {
      return Response.json({ ok: false, error: 'Ranking dataset is not ready yet.', sourceStatus: 'waiting-for-live-source', storage: rankingStorageHealth() }, { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } });
    }
    return Response.json(responseFor(cached, 'cached', { storage: rankingStorageHealth() }), { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    return Response.json({
      ok: false,
      error: 'Unable to read the game ranking dataset',
      details: error instanceof Error ? error.message : String(error),
      sourceStatus: 'source-error',
      storage: rankingStorageHealth(),
    }, { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } });
  }
}
