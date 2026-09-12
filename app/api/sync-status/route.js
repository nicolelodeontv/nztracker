import { readSyncStatus, storageHealth } from '../../lib/member-history';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const INTERVAL_MS = 5 * 60 * 1000;
const ACTIVE_MAX_AGE_MS = 12 * 60 * 1000;
const DELAYED_MAX_AGE_MS = 20 * 60 * 1000;

export async function GET() {
  try {
    const storage = storageHealth();
    const sync = await readSyncStatus();
    const now = Date.now();
    const lastRunAtMs = sync?.lastRunAt ? new Date(sync.lastRunAt).getTime() : NaN;
    const ageMs = Number.isFinite(lastRunAtMs) ? Math.max(0, now - lastRunAtMs) : null;
    let status = 'offline';
    if (ageMs !== null && ageMs <= ACTIVE_MAX_AGE_MS) status = 'active';
    else if (ageMs !== null && ageMs <= DELAYED_MAX_AGE_MS) status = 'delayed';

    return Response.json({
      ok: true,
      status,
      lastRunAt: sync?.lastRunAt || null,
      nextExpectedAt: sync?.nextExpectedAt || null,
      ageMs,
      ageSeconds: ageMs === null ? null : Math.floor(ageMs / 1000),
      intervalMs: INTERVAL_MS,
      season: sync?.season || null,
      clansSeen: Number(sync?.clansSeen || 0),
      clansWithMemberData: Number(sync?.clansWithMemberData || 0),
      membersSeen: Number(sync?.membersSeen || 0),
      memberErrors: Number(sync?.memberErrors || 0),
      historyClansStored: Number(sync?.historyClansStored || 0),
      historyClansChanged: Number(sync?.historyClansChanged || 0),
      memberSources: sync?.memberSources || {},
      source: sync?.source || 'https://ninjazenshin.online/?panel=clan-ranking',
      durable: storage.durable,
      storageProvider: storage.provider,
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    const storage = storageHealth();
    return Response.json({
      ok: false,
      status: 'error',
      durable: storage.durable,
      storageProvider: storage.provider,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } });
  }
}
