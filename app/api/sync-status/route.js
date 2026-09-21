import { readSyncStatus, storageHealth } from '../../lib/member-history.js';
import { getLatestSync, dbStatus } from '../../../lib/supabase-db.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const INTERVAL_MS = 5 * 60 * 1000;
const ACTIVE_MAX_AGE_MS = 15 * 60 * 1000;
const DELAYED_MAX_AGE_MS = 30 * 60 * 1000;

export async function GET() {
  const readErrors = {
    database: null,
    syncStatus: null,
    latestSync: null
  };

  let sync = null;
  let latestDb = null;

  try {
    sync = await readSyncStatus();
  } catch (error) {
    readErrors.syncStatus = error instanceof Error ? error.message : String(error);
    readErrors.database = readErrors.syncStatus;
  }

  try {
    latestDb = await getLatestSync();
  } catch (error) {
    readErrors.latestSync = error instanceof Error ? error.message : String(error);
    readErrors.database = readErrors.database || readErrors.latestSync;
  }

  const storage = storageHealth();
  // The monitor heartbeat is the primary scheduler signal. Keep legacy sync_runs
  // as a fallback so status remains readable during the scheduler migration.
  const lastRunAt = sync?.lastRunAt || latestDb?.completed_at || latestDb?.finished_at || null;
  const lastRunAtMs = lastRunAt ? new Date(lastRunAt).getTime() : NaN;
  const ageMs = Number.isFinite(lastRunAtMs) ? Math.max(0, Date.now() - lastRunAtMs) : null;

  let status = 'offline';
  if (ageMs !== null && ageMs <= ACTIVE_MAX_AGE_MS) status = 'active';
  else if (ageMs !== null && ageMs <= DELAYED_MAX_AGE_MS) status = 'delayed';

  const overall = sync?.overall ?? latestDb?.status ?? null;
  const syncError = sync?.error ?? latestDb?.error_message ?? null;
  const databaseError = readErrors.database;

  return Response.json({
    ok: !databaseError,
    status,
    overall,
    lastRunAt,
    nextExpectedAt: sync?.nextExpectedAt || (
      lastRunAt
        ? new Date(new Date(lastRunAt).getTime() + INTERVAL_MS).toISOString()
        : null
    ),
    ageMs,
    ageSeconds: ageMs === null ? null : Math.floor(ageMs / 1000),
    intervalMs: INTERVAL_MS,
    season: sync?.season ?? latestDb?.season ?? null,
    clansSeen: Number(sync?.clansSeen ?? latestDb?.clans_count ?? latestDb?.clans_seen ?? 0),
    clansWithMemberData: Number(sync?.clansWithMemberData ?? 0),
    membersSeen: Number(sync?.membersSeen ?? latestDb?.members_count ?? 0),
    memberErrors: Number(sync?.memberErrors ?? 0),
    historyClansStored: Number(sync?.historyClansStored ?? 0),
    historyClansChanged: Number(sync?.historyClansChanged ?? 0),
    rankingCacheStored: Boolean(sync?.rankingCacheStored),
    rankingRows: Number(sync?.rankingRows ?? latestDb?.clans_count ?? latestDb?.clans_seen ?? 0),
    memberSources: sync?.memberSources || {},
    source: sync?.source || 'https://ninjazenshin.online/?panel=clan-ranking',
    error: databaseError || syncError,
    warning: overall === 'warning' || Boolean(databaseError),
    readErrors,
    durable: storage.durable,
    storageProvider: storage.provider,
    storage,
    database: dbStatus()
  }, {
    status: databaseError ? 503 : 200,
    headers: { 'Cache-Control': 'no-store, max-age=0' }
  });
}
