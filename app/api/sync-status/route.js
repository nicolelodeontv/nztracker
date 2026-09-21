import { readSyncStatus, storageHealth } from '../../lib/member-history';
import { getLatestSync, dbStatus } from '../../../lib/supabase-db.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const INTERVAL_MS = 5 * 60 * 1000;
const ACTIVE_MAX_AGE_MS = 12 * 60 * 1000;
const DELAYED_MAX_AGE_MS = 20 * 60 * 1000;

export async function GET() {
  try {
    const [sync, latestDb] = await Promise.all([
      readSyncStatus().catch(() => null),
      getLatestSync().catch(() => null)
    ]);
    const storage = storageHealth();
    const lastRunAt = latestDb?.completed_at || latestDb?.finished_at || sync?.lastRunAt || null;
    const lastRunAtMs = lastRunAt ? new Date(lastRunAt).getTime() : NaN;
    const ageMs = Number.isFinite(lastRunAtMs) ? Math.max(0, Date.now() - lastRunAtMs) : null;
    let status = 'offline';
    if (ageMs !== null && ageMs <= ACTIVE_MAX_AGE_MS) status = 'active';
    else if (ageMs !== null && ageMs <= DELAYED_MAX_AGE_MS) status = 'delayed';

    const overall = latestDb?.status || sync?.overall || null;
    const syncError = latestDb?.error_message || sync?.error || null;

    return Response.json({
      ok: true,
      status,
      overall,
      lastRunAt,
      nextExpectedAt: sync?.nextExpectedAt || (lastRunAt ? new Date(new Date(lastRunAt).getTime() + INTERVAL_MS).toISOString() : null),
      ageMs,
      ageSeconds: ageMs === null ? null : Math.floor(ageMs / 1000),
      intervalMs: INTERVAL_MS,
      season: sync?.season || latestDb?.season || null,
      clansSeen: Number(latestDb?.clans_count || latestDb?.clans_seen || sync?.clansSeen || 0),
      clansWithMemberData: Number(sync?.clansWithMemberData || 0),
      membersSeen: Number(latestDb?.members_count || sync?.membersSeen || 0),
      memberErrors: Number(sync?.memberErrors || 0),
      historyClansStored: Number(sync?.historyClansStored || 0),
      historyClansChanged: Number(sync?.historyClansChanged || 0),
      rankingCacheStored: Boolean(sync?.rankingCacheStored),
      rankingRows: Number(latestDb?.clans_count || latestDb?.clans_seen || sync?.rankingRows || 0),
      memberSources: sync?.memberSources || {},
      source: sync?.source || 'https://ninjazenshin.online/?panel=clan-ranking',
      error: syncError,
      warning: overall === 'warning',
      durable: storage.durable,
      storageProvider: storage.provider,
      storage,
      database: dbStatus()
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    const storage = storageHealth();
    return Response.json({
      ok: true,
      status: 'offline',
      overall: 'error',
      durable: storage.durable,
      storageProvider: storage.provider,
      storage,
      error: error instanceof Error ? error.message : String(error)
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  }
}
