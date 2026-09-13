import { readSyncStatus, storageHealth } from '../../lib/member-history';
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
    const [sync, latestDb] = await Promise.all([
      readSyncStatus().catch(() => null),
      getLatestSync().catch(() => null)
    ]);
    const lastRunAt = sync?.lastRunAt || latestDb?.completed_at || null;
    const ageMs = lastRunAt ? Math.max(0, Date.now() - new Date(lastRunAt).getTime()) : null;
    const sourceNames = ['clanRanking', 'pve', 'pvp', 'clanMembers'];
    const sources = Object.fromEntries(sourceNames.map((name) => [name, sync?.sources?.[name] || {
      status: 'unknown', rows: 0, clans: 0, members: 0, errors: 0, error: null
    }]));

    return Response.json({
      ok: true,
      overall: sync?.overall || latestDb?.status || 'offline',
      status: ageState(lastRunAt),
      lastRunAt,
      ageMs,
      ageSeconds: ageMs === null ? null : Math.floor(ageMs / 1000),
      nextExpectedAt: sync?.nextExpectedAt || null,
      season: sync?.season || latestDb?.season || null,
      clans: Number(sync?.clansSeen || latestDb?.clans_count || 0),
      members: Number(sync?.membersSeen || latestDb?.members_count || 0),
      memberErrors: Number(sync?.memberErrors || 0),
      rankingStored: Boolean(sync?.rankingStored),
      rosterStored: Boolean(sync?.rosterStored),
      historyClansStored: Number(sync?.historyClansStored || 0),
      leaderboards: sync?.leaderboards || {},
      sources,
      error: sync?.error || latestDb?.error_message || null,
      durable: storageHealth().durable && dbStatus().configured,
      storage: storageHealth(),
      database: dbStatus(),
      warning: ageMs !== null && ageMs > 60 * 60 * 1000 ? 'Game data may have changed since last sync.' : null
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    return Response.json({ ok: false, overall: 'error', error: error instanceof Error ? error.message : String(error) }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
