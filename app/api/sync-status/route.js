import { storageHealth, verifyStorageConnection } from '../../lib/member-history';
import { dbStatus, getLatestSync } from '../../../lib/supabase-db.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const INTERVAL_MS = 5 * 60 * 1000;
const ACTIVE_MAX_AGE_MS = 12 * 60 * 1000;
const DELAYED_MAX_AGE_MS = 20 * 60 * 1000;

export async function GET() {
  const [syncResult, storageResult] = await Promise.all([
    getLatestSync().catch((error) => ({ __error: error instanceof Error ? error.message : String(error) })),
    verifyStorageConnection().catch((error) => ({
      ...storageHealth(),
      durable: false,
      error: error instanceof Error ? error.message : String(error),
    })),
  ]);

  const sync = syncResult && !syncResult.__error ? syncResult : null;
  const storage = storageResult || storageHealth();
  const now = Date.now();
  const lastRunAt = sync?.completed_at || sync?.finished_at || null;
  const lastRunAtMs = lastRunAt ? new Date(lastRunAt).getTime() : NaN;
  const ageMs = Number.isFinite(lastRunAtMs) ? Math.max(0, now - lastRunAtMs) : null;

  let status = 'offline';
  if (ageMs !== null && ageMs <= ACTIVE_MAX_AGE_MS) status = 'active';
  else if (ageMs !== null && ageMs <= DELAYED_MAX_AGE_MS) status = 'delayed';

  const errors = [
    syncResult?.__error ? `Database: ${syncResult.__error}` : null,
    sync?.error_message || null,
    storage?.error ? `Blob storage: ${storage.error}` : null,
  ].filter(Boolean);

  return Response.json({
    ok: true,
    status,
    lastRunAt,
    nextExpectedAt: lastRunAt ? new Date(new Date(lastRunAt).getTime() + INTERVAL_MS).toISOString() : null,
    ageMs,
    ageSeconds: ageMs === null ? null : Math.floor(ageMs / 1000),
    intervalMs: INTERVAL_MS,
    season: sync?.season || null,
    clansSeen: Number(sync?.clans_count || sync?.clans_seen || 0),
    clansWithMemberData: Number(sync?.clans_with_member_data || 0),
    membersSeen: Number(sync?.members_count || sync?.members_seen || 0),
    memberErrors: 0,
    historyClansStored: 0,
    historyClansChanged: 0,
    rankingCacheStored: false,
    rankingRows: Number(sync?.clans_count || sync?.clans_seen || 0),
    memberSources: {},
    source: 'https://ninjazenshin.online/?panel=clan-ranking',
    error: errors.length ? errors.join(' | ') : null,
    durable: storage.durable,
    storageProvider: storage.provider,
    storage
  }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
