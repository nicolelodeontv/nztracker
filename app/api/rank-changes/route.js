import { supabaseAdmin } from '../../../lib/supabase.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const db = supabaseAdmin();
  if (!db) return Response.json({ ok: false, error: 'Supabase is not configured' }, { status: 503 });
  const url = new URL(request.url);
  const season = url.searchParams.get('season') || 'Season 3';
  try {
    const { data, error } = await db.from('clan_ranking_history')
      .select('clan_id,season,rank,clan_name,reputation,snapshot_at')
      .eq('season', season)
      .order('snapshot_at', { ascending: false })
      .limit(1000);
    if (error) throw error;
    const snapshots = [...new Set((data || []).map((row) => row.snapshot_at))].slice(0, 2);
    if (snapshots.length < 2) return Response.json({ ok: true, season, changes: {} }, { headers: { 'Cache-Control': 'no-store' } });
    const current = new Map();
    const previous = new Map();
    for (const row of data || []) {
      const bucket = row.snapshot_at === snapshots[0] ? current : row.snapshot_at === snapshots[1] ? previous : null;
      if (bucket) bucket.set(String(row.clan_id), row);
    }
    const changes = {};
    for (const [clanId, row] of current) {
      const old = previous.get(clanId);
      if (!old) continue;
      changes[clanId] = {
        rankDelta: Number(old.rank) - Number(row.rank),
        reputationDelta: Number(row.reputation || 0) - Number(old.reputation || 0),
        fromRank: Number(old.rank),
        toRank: Number(row.rank),
        fromReputation: Number(old.reputation || 0),
        toReputation: Number(row.reputation || 0),
        previousAt: snapshots[1],
        currentAt: snapshots[0]
      };
    }
    return Response.json({ ok: true, season, snapshots, changes }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 503 });
  }
}
