import { recordSyncStatus } from '../../lib/member-history.js';
import { recordRankingSnapshot } from '../../lib/ranking-cache.js';
import { getMonitorStatus } from '../../lib/monitor-status.mjs';
import { requireRequiredCronSecret } from '../../lib/cron-auth.mjs';
import { claimMonitorWindow, completeMonitorWindow, pruneMonitorWindows, releaseMonitorWindow } from '../../lib/monitor-idempotency.mjs';
import { syncTracker } from '../../lib/rep-tracker.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SOURCE = 'https://ninjazenshin.online/?panel=clan-ranking';
const SYNC_INTERVAL_MS = 5 * 60 * 1000;

export async function GET(request) {
  const denied = requireRequiredCronSecret(request, '/api/monitor');
  if (denied) return denied;

  const startedAt = new Date();
  const nowMs = startedAt.getTime();
  let windowKey = null;
  let claimed = false;

  try {
    const claim = await claimMonitorWindow(nowMs);
    windowKey = claim.key;

    if (!claim.claimed) {
      return Response.json({
        ok: true,
        status: 'skipped',
        reason: 'monitor-window-already-claimed',
        windowKey
      }, {
        headers: { 'Cache-Control': 'no-store, max-age=0' }
      });
    }

    claimed = true;
    const result = await syncTracker({ force: false, admin: 'monitor' });
    const finishedAt = new Date();
    const membersSeen = Number(result.membersSeen ?? result.live?.members?.length ?? 0);
    const status = result.reused ? 'success' : getMonitorStatus({
      membersSeen,
      memberErrors: 0,
      rankingCacheError: null
    });

    let rankingCache = { stored: false };
    let rankingCacheError = null;
    const ranking = result.discovery?.ranking;
    if (!result.reused && Array.isArray(ranking?.rows) && ranking.rows.length) {
      try {
        rankingCache = await recordRankingSnapshot(ranking);
      } catch (error) {
        rankingCacheError = error instanceof Error ? error.message : String(error);
        rankingCache = { stored: false, error: rankingCacheError };
        console.error('Ranking cache write failed; continuing tracker sync', error);
      }
    }

    const rankingRows = Array.isArray(ranking?.rows) ? ranking.rows.length : undefined;
    const trackedMemberClanIds = result.config?.clan_id ? [String(result.config.clan_id)] : [];
    const clansWithMemberData = trackedMemberClanIds.length && membersSeen > 0 ? trackedMemberClanIds.length : 0;
    const memberSources = result.live?.source
      ? { [result.live.source]: 1 }
      : {};

    await recordSyncStatus({
      version: 6,
      status: 'active',
      overall: status,
      lastRunAt: finishedAt.toISOString(),
      nextExpectedAt: new Date(finishedAt.getTime() + SYNC_INTERVAL_MS).toISOString(),
      intervalMs: SYNC_INTERVAL_MS,
      season: result.season || result.config?.current_season || null,
      clansSeen: rankingRows,
      trackedMemberClanIds,
      clansWithMemberData,
      membersSeen,
      memberErrors: 0,
      historyClansStored: result.reused ? undefined : 1,
      historyClansChanged: result.reused ? undefined : 1,
      rankingCacheStored: rankingRows === undefined ? undefined : Boolean(rankingCache?.stored),
      rankingCacheError,
      rankingRows,
      memberSources,
      source: result.live?.source || ranking?.source || SOURCE
    });

    await completeMonitorWindow(windowKey, finishedAt.getTime());
    await pruneMonitorWindows();

    return Response.json({
      ok: true,
      mode: 'monitor',
      status,
      reused: Boolean(result.reused),
      season: result.season || result.config?.current_season || null,
      clanId: result.config?.clan_id || null,
      clansSeen: rankingRows,
      trackedMemberClanIds,
      clansWithMemberData,
      membersSeen,
      memberErrors: 0,
      memberSources,
      rankingCache,
      rankingCacheError,
      rankingRows,
      suspiciousCount: Number(result.suspiciousCount || 0),
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      windowKey
    }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    });
  } catch (error) {
    const finishedAt = new Date();

    if (claimed && windowKey) {
      try {
        await releaseMonitorWindow(windowKey);
      } catch (releaseError) {
        console.error('Unable to release failed monitor window', releaseError);
      }
    }

    try {
      await recordSyncStatus({
        version: 6,
        status: 'error',
        overall: 'error',
        lastRunAt: finishedAt.toISOString(),
        nextExpectedAt: new Date(finishedAt.getTime() + SYNC_INTERVAL_MS).toISOString(),
        intervalMs: SYNC_INTERVAL_MS,
        source: SOURCE,
        error: error instanceof Error ? error.message : String(error)
      });
    } catch (heartbeatError) {
      console.error('Unable to persist monitor error heartbeat', heartbeatError);
    }

    console.error('monitor failed', error);
    return Response.json({
      ok: false,
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      windowKey
    }, {
      status: 502,
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    });
  }
}
