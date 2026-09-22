import { recordSyncStatus } from '../../lib/member-history.js';
import { readRankingSnapshot, recordRankingSnapshot, rankingSnapshotNeedsRefresh, RANKING_REFRESH_MAX_AGE_MS } from '../../lib/ranking-cache.js';
import { getMonitorStatus } from '../../lib/monitor-status.mjs';
import { requireRequiredCronSecret } from '../../lib/cron-auth.mjs';
import { MONITOR_WINDOW_MS, claimMonitorWindow, completeMonitorWindow, pruneMonitorWindows, releaseMonitorWindow } from '../../lib/monitor-idempotency.mjs';
import { syncTracker } from '../../lib/rep-tracker.js';
import { fetchRankingSnapshot } from '../../lib/ninja-source.mjs';
import { recordSyncHealth } from '../../lib/sync-health.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SOURCE = 'https://ninjazenshin.online/?panel=clan-ranking';
// The Supabase scheduler runs this monitor once per minute.
const SYNC_INTERVAL_MS = MONITOR_WINDOW_MS;

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

    let rankingCache = { stored: false, refreshed: false };
    let rankingCacheError = null;
    let ranking = result.discovery?.ranking;
    try {
      const cachedRanking = await readRankingSnapshot();
      const cachedAt = Date.parse(cachedRanking?.fetchedAt || '');
      const rankingDue = rankingSnapshotNeedsRefresh(cachedRanking, Date.now(), RANKING_REFRESH_MAX_AGE_MS);
      if (rankingDue) {
        const freshRanking = await fetchRankingSnapshot();
        if (Array.isArray(freshRanking?.rows) && freshRanking.rows.length) {
          rankingCache = await recordRankingSnapshot(freshRanking);
          rankingCache.refreshed = true;
          ranking = freshRanking;
        }
      } else {
        ranking = cachedRanking;
        rankingCache = { stored: false, refreshed: false, cached: true, ageMs: Math.max(0, Date.now() - cachedAt) };
      }
    } catch (error) {
      rankingCacheError = error instanceof Error ? error.message : String(error);
      rankingCache = { stored: false, refreshed: false, error: rankingCacheError };
      ranking = ranking || null;
      console.error('Ranking refresh failed; continuing tracker sync', error);
    }

    const rankingRows = Array.isArray(ranking?.rows) ? ranking.rows.length : undefined;
    const rankingAgeMs = Number.isFinite(Date.parse(ranking?.fetchedAt || ''))
      ? Math.max(0, Date.now() - Date.parse(ranking.fetchedAt))
      : null;
    const rankingStatus = rankingRows
      ? (rankingSnapshotNeedsRefresh(ranking, Date.now(), RANKING_REFRESH_MAX_AGE_MS) ? 'cached-stale' : 'fresh')
      : 'unavailable';
    const memberSource = result.live?.service === 'legacy-live' ? 'legacy' : result.live?.service ? 'amf' : null;
    const discoveryStatus = result.discoveryStatus || (result.discoveryError ? 'stale' : 'fresh');
    const memberStatus = result.memberStatus || (result.reused ? 'success' : 'unknown');
    const trackedMemberClanIds = result.config?.clan_id ? [String(result.config.clan_id)] : [];
    const clansWithMemberData = trackedMemberClanIds.length && membersSeen > 0 ? trackedMemberClanIds.length : 0;
    const memberSources = memberSource
      ? { [memberSource]: 1 }
      : (result.lastDetails?.memberSource ? { [result.lastDetails.memberSource]: 1 } : {});

    const overallOutcome =
      status==='error'
        ? 'error'
        : (rankingCacheError || rankingStatus==='unavailable' ? 'warning' : 'success');
    await recordSyncHealth({
      outcome:overallOutcome,
      at:finishedAt.toISOString(),
      error:rankingCacheError||result.discoveryError||null,
      memberStatus,
      memberSource,
      sourceHealth:result.live?.sourceHealth||'healthy',
      sourceWarning:result.live?.fallbackReason||null,
      sourceDiagnostics:result.live?.sourceDiagnostics||null,
      discoveryStatus,
      rankingStatus,
      durationMs:result.durationMs||null
    }).catch((error)=>console.warn('Unable to record sync health',error));

    await recordSyncStatus({
      version: 6,
      status: 'active',
      overall: overallOutcome,
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
      rankingCacheAgeMs: rankingAgeMs,
      rankingRows,
      memberSources,
      memberStatus,
      sourceHealth:result.live?.sourceHealth||'healthy',
      sourceWarning:result.live?.fallbackReason||null,
      memberSource,
      discoveryStatus,
      rankingStatus,
      rankingAgeMs,
      syncDurationMs: result.durationMs || null,
      source: result.live?.source || ranking?.source || SOURCE
    });

    await completeMonitorWindow(windowKey, finishedAt.getTime());
    await pruneMonitorWindows();

    return Response.json({
      ok: true,
      mode: 'monitor',
      status: overallOutcome,
      reused: Boolean(result.reused),
      season: result.season || result.config?.current_season || null,
      clanId: result.config?.clan_id || null,
      clansSeen: rankingRows,
      trackedMemberClanIds,
      clansWithMemberData,
      membersSeen,
      memberErrors: 0,
      memberSources,
      memberStatus,
      memberSource,
      sourceHealth:result.live?.sourceHealth||result.sourceHealth||'healthy',
      sourceWarning:result.live?.fallbackReason||result.fallbackReason||null,
      rankingCache,
      rankingCacheError,
      rankingCacheAgeMs: rankingAgeMs,
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
        sourceHealth:'down',
        sourceWarning:null,
        source: SOURCE,
        error: error instanceof Error ? error.message : String(error)
      });
    } catch (heartbeatError) {
      console.error('Unable to persist monitor error heartbeat', heartbeatError);
    }

    await recordSyncHealth({
      outcome:'error',
      at:finishedAt.toISOString(),
      error:error instanceof Error ? error.message : String(error),
      memberStatus:'error',
      memberSource:null,
      discoveryStatus:'error',
      rankingStatus:'unavailable',
      durationMs:finishedAt.getTime()-startedAt.getTime()
    }).catch((healthError)=>console.warn('Unable to persist monitor failure health',healthError));

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
