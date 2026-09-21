import { supabaseAdmin } from '../../../lib/supabase.mjs';
import { buildCarryForwardSnapshots } from '../../lib/history-sparsity.mjs';

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
      .limit(5000);
    if (error) throw error;

    const snapshotState = buildCarryForwardSnapshots(data || [], (row) => String(row.clan_id));
    if (!snapshotState.currentAt || !snapshotState.previousAt) {
      return Response.json({ ok: true, season, changes: {} }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const changes = {};
    for (const [clanId, row] of snapshotState.current) {
      const old = snapshotState.previous.get(clanId);
      if (!old) continue;
      changes[clanId] = {
        rankDelta: Number(old.rank) - Number(row.rank),
        reputationDelta: Number(row.reputation || 0) - Number(old.reputation || 0),
        fromRank: Number(old.rank),
        toRank: Number(row.rank),
        fromReputation: Number(old.reputation || 0),
        toReputation: Number(row.reputation || 0),
        previousAt: old.snapshot_at,
        currentAt: row.snapshot_at
      };
    }
    return Response.json({ ok: true, season, snapshots, changes }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 503 });
  }
}
