import { scrapeClans, scrapeGame } from '../../../lib/scraper.mjs';
import { storageHealth } from '../../../app/lib/member-history';
import { upsertClans, recordSyncRun, dbStatus } from '../../../lib/supabase-db.mjs';
import { recordClanHistory, upsertLeaderboardRows } from '../../../lib/multisource-db.mjs';

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

export async function GET(request) {
  const startedAt = new Date();
  if (!authorized(request)) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const sourceStatus = {
    clanRanking: { status: 'waiting', rows: 0, error: null },
    pve: { status: 'waiting', rows: 0, error: null },
    pvp: { status: 'waiting', rows: 0, error: null },
    clanMembers: {
      status: 'on-demand', clans: 0, members: 0, errors: 0,
      note: 'Fetched live when a clan is opened; not bulk-scraped.'
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

  const finishedAt = new Date();
  const successfulSources = [sourceStatus.clanRanking, sourceStatus.pve, sourceStatus.pvp]
    .filter((source) => source.status === 'success').length;
  const status = successfulSources === 3 && !errors.length
    ? 'success'
    : successfulSources > 0
      ? 'partial'
      : 'error';
  const combinedError = errors.length ? errors.join(' | ') : null;

  try {
    await recordSyncRun({
      status,
      season: ranking?.season || page?.pve?.season || page?.pvp?.season || null,
      rows: ranking?.rows?.length || 0,
      membersCount: 0,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      error: combinedError
    });
  } catch (error) {
    errors.push(`Sync log: ${errorText(error)}`);
  }

  return Response.json({
    ok: status !== 'error',
    status,
    season: ranking?.season || null,
    sourceStatus,
    pve: { season: page?.pve?.season || null, round: page?.pve?.round || '', rows: page?.pve?.rows?.length || 0, stored: Boolean(pveStore.stored), error: pveStore.error || null },
    pvp: { season: page?.pvp?.season || null, round: page?.pvp?.round || '', rows: page?.pvp?.rows?.length || 0, stored: Boolean(pvpStore.stored), error: pvpStore.error || null },
    clans: ranking?.rows?.length || 0,
    members: 0,
    note: 'Clan rosters are live/on-demand to avoid bulk upstream load.',
    database: dbStatus(),
    storage: storageHealth(),
    errors,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString()
  }, { status: status === 'error' ? 502 : 200, headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
