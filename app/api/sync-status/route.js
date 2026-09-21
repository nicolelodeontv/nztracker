import { readSyncStatus, storageHealth } from '../../lib/member-history.js';
import { getLatestSync, dbStatus } from '../../../lib/supabase-db.mjs';
import { supabaseAdmin } from '../../lib/supabase-admin.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const INTERVAL_MS = 5 * 60 * 1000;
const ACTIVE_MAX_AGE_MS = 7 * 60 * 1000;
const DELAYED_MAX_AGE_MS = 15 * 60 * 1000;

export async function GET() {
  const readErrors = {
    database: null,
    syncStatus: null,
    latestSync: null
  };

  let sync = null;
  let latestDb = null;
  let latestMonitorSync = null;

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

  try {
    const db = supabaseAdmin();
    const result = await db.from('rep_tracker_sync_runs')
      .select('completed_at,status,error_message,members_returned,members_expected,season')
      .eq('status', 'success')
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (result.error) throw result.error;
    latestMonitorSync = result.data || null;
  } catch (error) {
    readErrors.latestSync = readErrors.latestSync || (error instanceof Error ? error.message : String(error));
    readErrors.database = readErrors.database || readErrors.latestSync;
  }

  const storage = storageHealth();
  const lastRunAt = sync?.lastRunAt || latestMonitorSync?.completed_at || latestDb?.completed_at || latestDb?.finished_at || null;
  const lastRunAtMs = lastRunAt ? new Date(lastRunAt).getTime() : NaN;
  const ageMs = Number.isFinite(lastRunAtMs) ? Math.max(0, Date.now() - lastRunAtMs) : null;

  let status = 'offline';
  if (ageMs !== null && ageMs <= ACTIVE_MAX_AGE_MS) status = 'active';
  else if (ageMs !== null && ageMs <= DELAYED_MAX_AGE_MS) status = 'delayed';

  const overall = sync?.overall || latestMonitorSync?.status || latestDb?.status || null;
  const syncError = latestDb?.error_message || sync?.error || null;
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
    season: sync?.season || latestMonitorSync?.season || latestDb?.season || null,
    clansSeen: Number(latestDb?.clans_count || latestDb?.clans_seen || sync?.clansSeen || 0),
    clansWithMemberData: Number(sync?.clansWithMemberData || 0),
    membersSeen: Number(sync?.membersSeen || latestMonitorSync?.members_returned || latestDb?.members_count || 0),
    memberErrors: Number(sync?.memberErrors || 0),
    historyClansStored: Number(sync?.historyClansStored || 0),
    historyClansChanged: Number(sync?.historyClansChanged || 0),
    rankingCacheStored: Boolean(sync?.rankingCacheStored),
    rankingRows: Number(latestDb?.clans_count || latestDb?.clans_seen || sync?.rankingRows || 0),
    memberSources: sync?.memberSources || {},
    source: sync?.source || 'https://ninjazenshin.online/?panel=clan-ranking',
    error: databaseError || syncError || latestMonitorSync?.error_message || null,
    warning: status !== 'active' || overall === 'warning' || Boolean(databaseError),
    readErrors,
    monitorWarning: status === 'offline'
      ? 'Monitor has no successful sync within the last 15 minutes.'
      : status === 'delayed'
        ? 'Monitor is delayed; the last successful sync is older than 7 minutes.'
        : null,
    durable: storage.durable,
    storageProvider: storage.provider,
    storage,
    database: dbStatus()
  }, {
    status: databaseError ? 503 : 200,
    headers: { 'Cache-Control': 'no-store, max-age=0' }
  });
}
