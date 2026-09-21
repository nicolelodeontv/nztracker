import { storageHealth, verifyStorageConnection } from '../../lib/member-history';
import { dbStatus, getLatestSync } from '../../../lib/supabase-db.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function ageState(lastRunAt) {
  if (!lastRunAt) return 'never';
  const age = Math.max(0, Date.now() - new Date(lastRunAt).getTime());
  if (!Number.isFinite(age)) return 'unknown';
  if (age <= 12 * 60 * 1000) return 'fresh';
  if (age <= 60 * 60 * 1000) return 'delayed';
  return 'stale';
}

export async function GET() {
  try {
    const [latestDb, storage] = await Promise.all([
      getLatestSync().catch(() => null),
      verifyStorageConnection().catch((error) => ({
        ...storageHealth(),
        durable: false,
        error: error instanceof Error ? error.message : String(error)
      }))
    ]);

    const lastRunAt = latestDb?.completed_at || latestDb?.finished_at || null;
    const ageMs = lastRunAt ? Math.max(0, Date.now() - new Date(lastRunAt).getTime()) : null;
    const sourceNames = ['clanRanking', 'pve', 'pvp', 'clanMembers'];
    const sourceRows = Number(latestDb?.clans_count || latestDb?.clans_seen || 0);
    const sourceMembers = Number(latestDb?.members_count || latestDb?.members_seen || 0);
    const sources = Object.fromEntries(sourceNames.map((name) => [name, {
      status: name === 'clanRanking' ? 'database' : 'unknown',
      rows: name === 'clanRanking' ? sourceRows : 0,
      clans: name === 'clanMembers' ? 0 : 0,
      members: name === 'clanMembers' ? sourceMembers : 0,
      errors: 0,
      error: null
    }]));

    return Response.json({
      ok: true,
      overall: latestDb?.status || 'offline',
      status: ageState(lastRunAt),
      lastRunAt,
      ageMs,
      ageSeconds: ageMs === null ? null : Math.floor(ageMs / 1000),
      nextExpectedAt: lastRunAt ? new Date(new Date(lastRunAt).getTime() + 5 * 60 * 1000).toISOString() : null,
      season: latestDb?.season || null,
      clans: sourceRows,
      members: sourceMembers,
      memberErrors: 0,
      rankingStored: true,
      rosterStored: false,
      historyClansStored: 0,
      leaderboards: {},
      sources,
      error: [latestDb?.error_message, storage?.error ? `Blob storage: ${storage.error}` : null].filter(Boolean).join(' | ') || null,
      durable: Boolean(storage?.durable) && dbStatus().configured,
      storage: storage || storageHealth(),
      database: dbStatus(),
      warning: ageMs !== null && ageMs > 60 * 60 * 1000 ? 'Game data may have changed since last sync.' : null
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    return Response.json({
      ok: true,
      overall: 'offline',
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      storage: storageHealth(),
      database: dbStatus()
    }, { headers: { 'Cache-Control': 'no-store' } });
  }
}
