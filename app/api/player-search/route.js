import { searchPlayers, getLeaderboardHistory, multiDbStatus } from '../../../lib/multisource-db.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const url = new URL(request.url);
  const query = String(url.searchParams.get('q') || '').trim();
  if (query.length < 2) return Response.json({ ok: true, query, members: [], pve: [], pvp: [] }, { headers: { 'Cache-Control': 'no-store' } });
  try {
    const result = await searchPlayers(query, 50);
    const [pveHistory, pvpHistory] = await Promise.all([
      getLeaderboardHistory({ type: 'pve', playerName: query, limit: 100 }),
      getLeaderboardHistory({ type: 'pvp', playerName: query, limit: 100 })
    ]);
    return Response.json({ ok: true, query, ...result, history: { pve: pveHistory || [], pvp: pvpHistory || [] }, db: multiDbStatus() }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    return Response.json({ ok: false, query, error: error instanceof Error ? error.message : String(error), db: multiDbStatus() }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
