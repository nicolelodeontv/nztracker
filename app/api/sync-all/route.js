import { scrapeClans, scrapeGame } from '../../../lib/scraper.mjs';
import { recordSyncStatus, storageHealth } from '../../../app/lib/member-history';
import { fetchLiveMembers } from '../../../app/lib/ninja-source.mjs';
import { buildTrackedClanTargets, parseTrackedClanIds } from '../../../app/lib/member-snapshot.mjs';
import { summarizeMemberRecording } from '../../../app/lib/member-recording.mjs';
import { upsertClans, recordSyncRun, dbStatus } from '../../../lib/supabase-db.mjs';
import { recordClanHistory, upsertLeaderboardRows, upsertMemberRoster, upsertRepTrackerSnapshots } from '../../../lib/multisource-db.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SYNC_INTERVAL_MS = 5 * 60 * 1000;

function authorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

function errorText(error) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try { return JSON.stringify(error); } catch { return String(error); }
}


async function fetchMembers(clan) {
  try {
    const payload = await fetchLiveMembers(String(clan.clanId));
    const members = Array.isArray(payload?.members) ? payload.members : [];
    const recordableCount = members.filter((member) => member?.id && !member?.identityAmbiguous && member?.name).length;
    const ambiguousMembers = members.filter((member) => member?.identityAmbiguous).map((member) => String(member.name || '').trim()).filter(Boolean);
    return {
      ...payload,
      clanId: String(clan.clanId),
      clan: clan.clan,
      expectedMemberCount: Number(clan.memberCurrent || 0),
      members,
      count: members.length,
      recordableCount,
      ambiguousMembers,
      ambiguousCount: ambiguousMembers.length,
      error: null
    };
  } catch (error) {
    return {
      clanId: String(clan.clanId),
      clan: clan.clan,
      expectedMemberCount: Number(clan.memberCurrent || 0),
      members: [],
      count: 0,
      recordableCount: 0,
      ambiguousMembers: [],
      ambiguousCount: 0,
      stale: false,
      source: 'error',
      error: errorText(error)
    };
  }
}

export async function GET(request) {
  const startedAt = new Date();
  if (!authorized(request)) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const sourceStatus = {
    clanRanking: { status: 'waiting', rows: 0, error: null },
    pve: { status: 'waiting', rows: 0, error: null },
    pvp: { status: 'waiting', rows: 0, error: null },
    clanMembers: {
      status: 'waiting', clans: 0, members: 0, errors: 0, ambiguous: 0,
      trackedClanIds: parseTrackedClanIds(process.env.TRACKED_CLAN_IDS),
      note: 'Fetched live only for TRACKED_CLAN_IDS and recorded in Supabase; default is Chaos (3).'
    }
  };

  let page = null;
  let ranking = null;
  const errors = [];

  // Fetch the public game page once. Each board is persisted independently.
  try {
    page = await scrapeGame();
  } catch (error) {
    errors.push(`Game page: ${errorText(error)}`);
  }

  if (page?.clanRanking?.length) {
    ranking = { rows: page.clanRanking, season: page.season, capturedAt: page.capturedAt, source: page.source };
    sourceStatus.clanRanking = { status: 'success', rows: page.clanRanking.length, error: null };
  } else {
    try {
      ranking = await scrapeClans();
      sourceStatus.clanRanking = { status: 'success', rows: ranking.rows.length, error: null, fallback: true };
    } catch (error) {
      sourceStatus.clanRanking = { status: 'failed', rows: 0, error: errorText(error) };
      errors.push(`Clan ranking: ${sourceStatus.clanRanking.error}`);
    }
  }

  sourceStatus.pve = page?.pve?.rows?.length
    ? { status: 'success', rows: page.pve.rows.length, error: null }
    : { status: 'failed', rows: 0, error: 'PvE leaderboard was not parsed from the game source.' };

  sourceStatus.pvp = page?.pvp?.rows?.length
    ? { status: 'success', rows: page.pvp.rows.length, error: null }
    : { status: 'failed', rows: 0, error: 'PvP leaderboard was not parsed from the game source.' };

  if (ranking?.rows?.length) {
    try {
      sourceStatus.clanRanking.storage = await upsertClans(ranking.rows, ranking.season, ranking.capturedAt);
    } catch (error) {
      sourceStatus.clanRanking.storageError = errorText(error);
      errors.push(`Clan ranking storage: ${sourceStatus.clanRanking.storageError}`);
    }
    try {
      sourceStatus.clanRanking.history = await recordClanHistory({ rows: ranking.rows, season: ranking.season, capturedAt: ranking.capturedAt });
    } catch (error) {
      sourceStatus.clanRanking.historyError = errorText(error);
      errors.push(`Clan history storage: ${sourceStatus.clanRanking.historyError}`);
    }
  }

  const pveStore = { stored: false, count: 0 };
  if (page?.pve?.rows?.length) {
    try {
      Object.assign(pveStore, await upsertLeaderboardRows({
        type: 'pve',
        season: page.pve.season || ranking?.season || 'Unknown',
        round: page.pve.round,
        rows: page.pve.rows,
        capturedAt: page.capturedAt
      }));
    } catch (error) {
      pveStore.error = errorText(error);
      errors.push(`PvE storage: ${pveStore.error}`);
    }
  }

  const pvpStore = { stored: false, count: 0 };
  if (page?.pvp?.rows?.length) {
    try {
      Object.assign(pvpStore, await upsertLeaderboardRows({
        type: 'pvp',
        season: page.pvp.season || ranking?.season || 'Unknown',
        round: page.pvp.round,
        rows: page.pvp.rows,
        capturedAt: page.capturedAt
      }));
    } catch (error) {
      pvpStore.error = errorText(error);
      errors.push(`PvP storage: ${pvpStore.error}`);
    }
  }

  sourceStatus.pve.stored = Boolean(pveStore.stored);
  sourceStatus.pve.storageError = pveStore.error || null;
  sourceStatus.pvp.stored = Boolean(pvpStore.stored);
  sourceStatus.pvp.storageError = pvpStore.error || null;

  const trackedClanIds = parseTrackedClanIds(process.env.TRACKED_CLAN_IDS);
  const trackedClans = buildTrackedClanTargets(ranking?.rows, trackedClanIds);
  const memberResults = await Promise.all(trackedClans.map((clan) => fetchMembers(clan)));
  const memberSummary = summarizeMemberRecording(trackedClans, memberResults);
  const memberCount = memberResults.reduce((sum, result) => sum + Number(result.recordableCount || 0), 0);
  const memberErrors = memberSummary.issues.length;
  const ambiguousCount = memberResults.reduce((sum, result) => sum + Number(result.ambiguousCount || 0), 0);
  sourceStatus.clanMembers = {
    status: memberSummary.status,
    trackedClanIds,
    clans: memberResults.filter((result) => Number(result.recordableCount || 0) > 0).length,
    members: memberCount,
    errors: memberErrors,
    ambiguous: ambiguousCount,
    expectedMembers: trackedClans.reduce((sum, clan) => sum + Number(clan.memberCurrent || 0), 0),
    error: memberSummary.error
  };

  const roster = await upsertMemberRoster({
    season: ranking?.season || 'Unknown',
    snapshotAt: ranking?.capturedAt || startedAt.toISOString(),
    clanResults: memberResults
  });
  const snapshots = await upsertRepTrackerSnapshots({
    season: ranking?.season || 'Unknown',
    snapshotAt: ranking?.capturedAt || startedAt.toISOString(),
    clanResults: memberResults
  });
  sourceStatus.clanMembers.rosterStored = Boolean(roster?.stored);
  sourceStatus.clanMembers.snapshotsStored = Boolean(snapshots?.stored);
  sourceStatus.clanMembers.snapshotRows = Number(snapshots?.count || 0);
  sourceStatus.clanMembers.snapshotNew = Number(snapshots?.newCount || 0);
  sourceStatus.clanMembers.snapshotChanged = Number(snapshots?.changedCount || 0);
  sourceStatus.clanMembers.snapshotHeartbeats = Number(snapshots?.heartbeatCount || 0);
  sourceStatus.clanMembers.snapshotUnchanged = Number(snapshots?.unchangedCount || 0);
  sourceStatus.clanMembers.snapshotRetentionDeleted = Number(snapshots?.retention?.deleted || 0);
  sourceStatus.clanMembers.snapshotRetentionBatches = Number(snapshots?.retention?.batches || 0);
  sourceStatus.clanMembers.ambiguousNames = snapshots?.ambiguousNames || [];

  const finishedAt = new Date();
  const successfulSources = [sourceStatus.clanRanking, sourceStatus.pve, sourceStatus.pvp]
    .filter((source) => source.status === 'success').length;
  const status = errors.length || memberSummary.issues.length
    ? 'warning'
    : successfulSources === 3
      ? 'success'
      : successfulSources > 0
        ? 'warning'
        : 'error';
  const combinedError = errors.concat(memberSummary.error ? [`Members: ${memberSummary.error}`] : []).join(' | ') || null;

  try {
    await recordSyncRun({
      status,
      season: ranking?.season || page?.pve?.season || page?.pvp?.season || null,
      rows: ranking?.rows?.length || 0,
      membersCount: memberCount,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      error: combinedError
    });
  } catch (error) {
    errors.push(`Sync log: ${errorText(error)}`);
  }

  try {
    await recordSyncStatus({
      version: 4,
      status: 'active',
      overall: status,
      lastRunAt: finishedAt.toISOString(),
      nextExpectedAt: new Date(finishedAt.getTime() + SYNC_INTERVAL_MS).toISOString(),
      intervalMs: SYNC_INTERVAL_MS,
      season: ranking?.season || null,
      clansSeen: ranking?.rows?.length || 0,
      membersSeen: memberCount,
      trackedMemberClanIds: trackedClanIds,
      memberErrors,
      memberSources: Object.fromEntries(memberResults.map((result) => [result.clanId, result.source || 'unknown'])),
      sources: sourceStatus,
      leaderboards: {
        pve: { season: page?.pve?.season || null, round: page?.pve?.round || '', rows: page?.pve?.rows?.length || 0, stored: Boolean(pveStore.stored) },
        pvp: { season: page?.pvp?.season || null, round: page?.pvp?.round || '', rows: page?.pvp?.rows?.length || 0, stored: Boolean(pvpStore.stored) }
      },
      rankingStored: Boolean(sourceStatus.clanRanking.storage?.stored),
      roster: { ...sourceStatus.clanMembers, stored: Boolean(roster?.stored), snapshotsStored: Boolean(snapshots?.stored) },
      error: combinedError,
      source: ranking?.source || 'https://ninjazenshin.online/'
    });
  } catch (error) {
    errors.push(`Heartbeat: ${errorText(error)}`);
  }

  return Response.json({
    ok: status !== 'error',
    status,
    season: ranking?.season || null,
    sourceStatus,
    pve: { season: page?.pve?.season || null, round: page?.pve?.round || '', rows: page?.pve?.rows?.length || 0, stored: Boolean(pveStore.stored), error: pveStore.error || null },
    pvp: { season: page?.pvp?.season || null, round: page?.pvp?.round || '', rows: page?.pvp?.rows?.length || 0, stored: Boolean(pvpStore.stored), error: pvpStore.error || null },
    clans: ranking?.rows?.length || 0,
    members: memberCount,
    memberErrors,
    memberAmbiguous: ambiguousCount,
    rosterStored: Boolean(roster?.stored),
    snapshotsStored: Boolean(snapshots?.stored),
    trackedMemberClanIds: trackedClanIds,
    memberSnapshotRetentionDays: 30,
    note: 'Clan members are fetched live only for TRACKED_CLAN_IDS; default is Chaos (3). Ambiguous duplicate names are excluded from gain calculations.',
    database: dbStatus(),
    storage: storageHealth(),
    errors,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString()
  }, { status: status === 'error' ? 502 : 200, headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
