import { scrapeClans, scrapeGame } from '../../../lib/scraper.mjs';
import { recordMemberSnapshot, recordSyncStatus, storageHealth } from '../../../app/lib/member-history';
import { upsertClans, recordSyncRun, dbStatus } from '../../../lib/supabase-db.mjs';
import { getCurrentMembers, getClanComparison, recordClanHistory, upsertLeaderboardRows, upsertMemberRoster } from '../../../lib/multisource-db.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SYNC_INTERVAL_MS = 5 * 60 * 1000;

function authorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

function memberTotal(results) {
  return results.reduce((sum, result) => sum + (result.status === 'fulfilled' ? Number(result.value?.count || 0) : 0), 0);
}

async function fetchMembers(clan, requestUrl) {
  const target = new URL('/api/clan-members', requestUrl);
  target.searchParams.set('clanId', clan.clanId);
  target.searchParams.set('monitor', '1');
  target.searchParams.set('sync', String(Date.now()));
  const response = await fetch(target, { cache: 'no-store', headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || payload?.details || `Member source HTTP ${response.status}`);
  return {
    ...payload,
    clanId: String(clan.clanId),
    clan: clan.clan,
    members: Array.isArray(payload?.members) ? payload.members : [],
    count: Number(payload?.count || payload?.members?.length || 0),
    stale: Boolean(payload?.stale),
    source: payload?.service || payload?.source || 'live'
  };
}

export async function GET(request) {
  const startedAt = new Date();
  if (!authorized(request)) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const sourceStatus = {
    clanRanking: { status: 'failed', rows: 0, error: null },
    pve: { status: 'failed', rows: 0, error: null },
    pvp: { status: 'failed', rows: 0, error: null },
    clanMembers: { status: 'failed', clans: 0, members: 0, errors: 0 }
  };

  let page = null;
  let ranking = null;
  const sourceErrors = [];

  try {
    try {
      page = await scrapeGame();
      if (page?.clanRanking?.length) {
        ranking = { rows: page.clanRanking, season: page.season, capturedAt: page.capturedAt, source: page.source };
        sourceStatus.clanRanking = { status: 'success', rows: page.clanRanking.length, error: null };
      } else throw new Error('Unified source returned no clan rows.');
    } catch (unifiedError) {
      try {
        ranking = await scrapeClans();
        sourceStatus.clanRanking = { status: 'success', rows: ranking.rows.length, error: null, fallback: true };
      } catch (fallbackError) {
        sourceStatus.clanRanking.error = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        sourceErrors.push(`Clan ranking: ${sourceStatus.clanRanking.error}`);
      }
      if (!page) sourceErrors.push(`Unified leaderboard source: ${unifiedError instanceof Error ? unifiedError.message : String(unifiedError)}`);
    }

    if (page?.pve?.rows?.length) sourceStatus.pve = { status: 'success', rows: page.pve.rows.length, error: null };
    else sourceStatus.pve.error = 'PvE leaderboard was not parsed from the game source.';

    if (page?.pvp?.rows?.length) sourceStatus.pvp = { status: 'success', rows: page.pvp.rows.length, error: null };
    else sourceStatus.pvp.error = 'PvP leaderboard was not parsed from the game source.';

    let stored = null;
    if (ranking?.rows?.length) {
      stored = await upsertClans(ranking.rows, ranking.season, ranking.capturedAt);
      await recordClanHistory({ rows: ranking.rows, season: ranking.season, capturedAt: ranking.capturedAt });
    }

    const pveStore = page?.pve?.rows?.length
      ? await upsertLeaderboardRows({ type: 'pve', season: page.pve.season || ranking?.season || 'Unknown', round: page.pve.round, rows: page.pve.rows, capturedAt: page.capturedAt })
      : { stored: false, count: 0 };
    const pvpStore = page?.pvp?.rows?.length
      ? await upsertLeaderboardRows({ type: 'pvp', season: page.pvp.season || ranking?.season || 'Unknown', round: page.pvp.round, rows: page.pvp.rows, capturedAt: page.capturedAt })
      : { stored: false, count: 0 };

    const clans = ranking?.rows?.filter((clan) => clan.clanId) || [];
    const memberResults = await Promise.allSettled(clans.map((clan) => fetchMembers(clan, request.url)));
    const memberData = memberResults.map((result, index) => {
      if (result.status === 'fulfilled') return result.value;
      return { clanId: String(clans[index].clanId), clan: clans[index].clan, members: [], count: 0, stale: true, source: 'error', error: result.reason instanceof Error ? result.reason.message : String(result.reason) };
    });
    const freshMemberData = memberData.filter((data) => data.members.length && !data.stale);
    const staleMemberData = memberData.filter((data) => data.members.length && data.stale);
    const memberErrors = memberData.filter((data) => !data.members.length).length;
    const roster = await upsertMemberRoster({ season: ranking?.season || 'Unknown', snapshotAt: ranking?.capturedAt || startedAt.toISOString(), clanResults: memberData });
    sourceStatus.clanMembers = {
      status: memberErrors === 0 ? 'success' : freshMemberData.length ? 'partial' : 'failed',
      clans: freshMemberData.length,
      members: memberTotal(memberResults),
      errors: memberErrors,
      stale: staleMemberData.length,
      error: memberErrors ? memberData.filter((d) => d.error).slice(0, 5).map((d) => d.error).join(' | ') : null
    };

    const historyResults = await Promise.allSettled(freshMemberData.map((data) => recordMemberSnapshot({
      clanId: data.clanId,
      season: ranking?.season || 'Unknown',
      members: data.members,
      capturedAt: new Date(data.fetchedAt || ranking?.capturedAt || Date.now()).getTime()
    })));
    const historyStored = historyResults.filter((result) => result.status === 'fulfilled' && result.value?.stored).length;

    const finishedAt = new Date();
    const status = sourceErrors.length || memberErrors ? 'partial' : 'success';
    await recordSyncRun({
      status,
      season: ranking?.season || page?.pve?.season || null,
      rows: ranking?.rows?.length || 0,
      membersCount: sourceStatus.clanMembers.members,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      error: sourceErrors.concat(sourceStatus.clanMembers.error ? [`Members: ${sourceStatus.clanMembers.error}`] : []).join(' | ') || null
    });

    await recordSyncStatus({
      version: 3,
      status: 'active',
      lastRunAt: finishedAt.toISOString(),
      nextExpectedAt: new Date(finishedAt.getTime() + SYNC_INTERVAL_MS).toISOString(),
      intervalMs: SYNC_INTERVAL_MS,
      overall: status,
      season: ranking?.season || null,
      clansSeen: ranking?.rows?.length || 0,
      membersSeen: sourceStatus.clanMembers.members,
      memberErrors,
      sources: sourceStatus,
      leaderboards: {
        pve: { season: page?.pve?.season || null, round: page?.pve?.round || '', rows: page?.pve?.rows?.length || 0, stored: Boolean(pveStore?.stored) },
        pvp: { season: page?.pvp?.season || null, round: page?.pvp?.round || '', rows: page?.pvp?.rows?.length || 0, stored: Boolean(pvpStore?.stored) }
      },
      rankingStored: Boolean(stored?.stored),
      rosterStored: Boolean(roster?.stored),
      historyClansStored: historyStored,
      error: sourceErrors.concat(sourceStatus.clanMembers.error ? [`Members: ${sourceStatus.clanMembers.error}`] : []).join(' | ') || null,
      source: ranking?.source || 'https://ninjazenshin.online/'
    });

    return Response.json({
      ok: true,
      status,
      season: ranking?.season || null,
      sourceStatus,
      pve: { season: page?.pve?.season || null, round: page?.pve?.round || '', rows: page?.pve?.rows?.length || 0, stored: Boolean(pveStore?.stored) },
      pvp: { season: page?.pvp?.season || null, round: page?.pvp?.round || '', rows: page?.pvp?.rows?.length || 0, stored: Boolean(pvpStore?.stored) },
      clans: ranking?.rows?.length || 0,
      members: sourceStatus.clanMembers.members,
      rankingStored: Boolean(stored?.stored),
      rosterStored: Boolean(roster?.stored),
      historyClansStored: historyStored,
      database: dbStatus(),
      storage: storageHealth(),
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString()
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    const finishedAt = new Date();
    const message = error instanceof Error ? error.message : String(error);
    try {
      await recordSyncRun({ status: 'error', season: ranking?.season || null, rows: ranking?.rows?.length || 0, startedAt: startedAt.toISOString(), finishedAt: finishedAt.toISOString(), error: message });
      await recordSyncStatus({ version: 3, status: 'error', lastRunAt: finishedAt.toISOString(), nextExpectedAt: new Date(finishedAt.getTime() + SYNC_INTERVAL_MS).toISOString(), intervalMs: SYNC_INTERVAL_MS, overall: 'error', sources: sourceStatus, error: message, source: 'https://ninjazenshin.online/' });
    } catch {}
    return Response.json({ ok: false, status: 'error', sourceStatus, error: message, storage: storageHealth(), database: dbStatus(), finishedAt: finishedAt.toISOString() }, { status: 502, headers: { 'Cache-Control': 'no-store, max-age=0' } });
  }
}
