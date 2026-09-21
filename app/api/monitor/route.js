import { recordMemberSnapshot, recordSyncStatus, storageHealth } from '../../lib/member-history.js';
import { recordRankingSnapshot } from '../../lib/ranking-cache.js';
import { parseRankingHtml } from '../../lib/source-parser.mjs';
import { getConfig } from '../../lib/rep-tracker.js';
import { buildTrackedClanTargets, parseTrackedClanIds } from '../../lib/member-snapshot.mjs';
import { getMonitorStatus } from '../../lib/monitor-status.mjs';
import { requireCronSecret } from '../../lib/cron-auth.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SOURCE = 'https://ninjazenshin.online/?panel=clan-ranking';
const SYNC_INTERVAL_MS = 5 * 60 * 1000;

async function collectRanking() {
  const response = await fetch(SOURCE, {
    cache: 'no-store',
    headers: {
      'User-Agent': 'Mozilla/5.0 NinjaZenshinLiveTracker/3.0',
      Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8'
    }
  });
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
  const html = await response.text();
  const parsed = parseRankingHtml(html);
  if (!parsed.rows?.length) throw new Error('Shared ranking parser returned no rows');
  return { ...parsed, fetchedAt: new Date().toISOString(), source: SOURCE };
}

async function fetchMembers(clanId, requestUrl) {
  if (!clanId) return { count: 0, source: 'none', members: [], stored: false };
  const target = new URL('/api/clan-members', requestUrl);
  target.searchParams.set('clanId', clanId);
  target.searchParams.set('monitor', '1');
  const response = await fetch(target, { cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Member route returned HTTP ${response.status} for ${clanId}`);
  const payload = await response.json();
  return {
    count: Number(payload?.count || 0),
    source: payload?.stale ? 'last-known' : payload?.staminaSource || payload?.service || 'live',
    members: Array.isArray(payload?.members) ? payload.members : [],
    stale: Boolean(payload?.stale)
  };
}

async function monitorClan(clan, season, requestUrl) {
  const data = await fetchMembers(clan.clanId, requestUrl);
  if (!clan.clanId || data.stale || !data.members.length) {
    return {
      ...data,
      clanId: clan.clanId,
      clan: clan.clan,
      history: {
        stored: false,
        reason: data.stale ? 'Last-known member data; snapshot not advanced.' : 'No live members returned.'
      },
      error: data.stale ? 'Live member sources failed; history was not advanced.' : 'No live members returned.'
    };
  }

  const history = await recordMemberSnapshot({
    clanId: clan.clanId,
    season,
    members: data.members,
    capturedAt: Date.now()
  });
  return { ...data, clanId: clan.clanId, clan: clan.clan, history, error: null };
}

async function persistHeartbeat(payload) {
  try {
    return await recordSyncStatus(payload);
  } catch (error) {
    console.error('Unable to persist sync heartbeat', error);
    return { stored: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function resolveTrackedClans(rankingRows) {
  const config = await getConfig();
  const fallbackIds = config?.clan_id ? [String(config.clan_id)] : [];
  const trackedClanIds = parseTrackedClanIds(process.env.TRACKED_CLAN_IDS, fallbackIds);
  return { trackedClanIds, trackedClans: buildTrackedClanTargets(rankingRows, trackedClanIds) };
}

export async function GET(request) {
  const denied = requireCronSecret(request, '/api/monitor');
  if (denied) return denied;
  const startedAt = new Date();
  try {
    const ranking = await collectRanking();
    let rankingCache = { stored: false };
    let rankingCacheError = null;

    try {
      rankingCache = await recordRankingSnapshot(ranking);
    } catch (error) {
      rankingCacheError = error instanceof Error ? error.message : String(error);
      rankingCache = { stored: false, error: rankingCacheError };
      console.error('Ranking cache write failed; continuing member monitoring', error);
    }

    const { trackedClanIds, trackedClans } = await resolveTrackedClans(ranking.rows);
    const results = await Promise.allSettled(
      trackedClans.map((clan) => monitorClan(clan, ranking.season, request.url))
    );
    const membersSeen = results.reduce((sum, result) => (
      sum + (result.status === 'fulfilled' ? Number(result.value.count || 0) : 0)
    ), 0);
    const memberErrors = results.filter((result) =>
      result.status === 'rejected' || Boolean(result.value?.error)
    ).length;
    const historyStored = results.filter((result) =>
      result.status === 'fulfilled' && result.value.history?.stored
    ).length;
    const historyChanged = results.filter((result) =>
      result.status === 'fulfilled' && result.value.history?.changed
    ).length;
    const sourceCounts = {};

    results.forEach((result) => {
      if (result.status !== 'fulfilled') return;
      const source = result.value.source || 'unknown';
      sourceCounts[source] = (sourceCounts[source] || 0) + 1;
    });

    const status = getMonitorStatus({ membersSeen, memberErrors, rankingCacheError });
    const finishedAt = new Date();
    const heartbeat = await persistHeartbeat({
      version: 5,
      status: 'active',
      overall: status,
      lastRunAt: finishedAt.toISOString(),
      nextExpectedAt: new Date(finishedAt.getTime() + SYNC_INTERVAL_MS).toISOString(),
      intervalMs: SYNC_INTERVAL_MS,
      season: ranking.season,
      clansSeen: ranking.rows.length,
      trackedMemberClanIds: trackedClanIds,
      clansWithMemberData: trackedClans.length - memberErrors,
      membersSeen,
      memberErrors,
      historyClansStored: historyStored,
      historyClansChanged: historyChanged,
      rankingCacheStored: Boolean(rankingCache?.stored),
      rankingCacheError,
      rankingRows: ranking.rows.length,
      memberSources: sourceCounts,
      source: ranking.source
    });

    return Response.json({
      ok: true,
      mode: 'shared-monitor',
      status,
      season: ranking.season,
      clansSeen: ranking.rows.length,
      trackedMemberClanIds: trackedClanIds,
      clansWithMemberData: trackedClans.length - memberErrors,
      membersSeen,
      memberErrors,
      memberSources: sourceCounts,
      rankingCache,
      history: { clansStored: historyStored, clansChanged: historyChanged, sampleIntervalMs: SYNC_INTERVAL_MS },
      historyStorage: storageHealth(),
      syncStatusStored: Boolean(heartbeat?.stored),
      fetchedAt: ranking.fetchedAt,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      source: ranking.source
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    const finishedAt = new Date();
    await persistHeartbeat({
      version: 5,
      status: 'error',
      overall: 'error',
      lastRunAt: finishedAt.toISOString(),
      nextExpectedAt: new Date(finishedAt.getTime() + SYNC_INTERVAL_MS).toISOString(),
      intervalMs: SYNC_INTERVAL_MS,
      source: SOURCE,
      error: error instanceof Error ? error.message : String(error)
    });
    return Response.json({
      ok: false,
      mode: 'shared-monitor',
      status: 'error',
      historyStorage: storageHealth(),
      error: error instanceof Error ? error.message : String(error),
      finishedAt: finishedAt.toISOString()
    }, { status: 502, headers: { 'Cache-Control': 'no-store, max-age=0' } });
  }
}
