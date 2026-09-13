import { getClanHistory, multiDbStatus } from '../../../lib/multisource-db.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const url = new URL(request.url);
  const clanId = String(url.searchParams.get('clanId') || '').trim();
  const season = String(url.searchParams.get('season') || '').trim();
  const hours = Math.min(720, Math.max(1, Number(url.searchParams.get('hours')) || 168));
  if (!clanId) return Response.json({ ok: false, error: 'clanId is required' }, { status: 400 });
  try {
    const history = await getClanHistory({ clanId, season, hours });
    return Response.json({ ok: true, clanId, season, hours, history: history || [], db: multiDbStatus() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ ok: false, clanId, error: error instanceof Error ? error.message : String(error), db: multiDbStatus() }, { status: 503 });
  }
}
