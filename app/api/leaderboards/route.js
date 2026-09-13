import { getLeaderboards, multiDbStatus } from '../../../lib/multisource-db.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const url = new URL(request.url);
  const season = url.searchParams.get('season') || undefined;
  const round = url.searchParams.get('round');
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 100));
  const result = {};
  const errors = {};
  for (const type of ['pve', 'pvp']) {
    try {
      result[type] = await getLeaderboards({ type, season, round, limit });
    } catch (error) {
      result[type] = [];
      errors[type] = error instanceof Error ? error.message : String(error);
    }
  }
  return Response.json({ ok: Object.keys(errors).length === 0, ...result, errors, db: multiDbStatus() }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
