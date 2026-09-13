import { getClans, getLatestSync, dbStatus } from '../../../lib/supabase-db.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(Number(searchParams.get('limit') || 100), 1), 500);
    const requestedSeason = searchParams.get('season') || undefined;
    const latestSync = await getLatestSync();
    const season = requestedSeason || latestSync?.season || undefined;
    const clans = await getClans({ season, limit });
    if (!clans) return Response.json({ success: false, error: 'Supabase is not configured', db: dbStatus() }, { status: 503 });

    // Final API-level guard: never return the same clan twice, even if old
    // malformed rows exist in the database.
    const unique = new Map();
    for (const clan of clans) {
      const key = String(clan.clanId || clan.clan || '').trim().toLowerCase();
      if (!key) continue;
      const previous = unique.get(key);
      if (!previous || Number(clan.rank) < Number(previous.rank)) unique.set(key, clan);
    }
    const cleanClans = [...unique.values()].sort((a, b) => Number(a.rank) - Number(b.rank)).slice(0, limit);

    return Response.json({
      success: true,
      clans: cleanClans,
      count: cleanClans.length,
      season,
      lastUpdated: cleanClans[0]?.capturedAt || null,
      sync: latestSync,
      db: dbStatus()
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    return Response.json({ success: false, error: error instanceof Error ? error.message : String(error), db: dbStatus() }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
