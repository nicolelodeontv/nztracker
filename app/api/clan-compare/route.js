import { getClanComparison, multiDbStatus } from '../../../lib/multisource-db.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const url = new URL(request.url);
  const first = String(url.searchParams.get('a') || '').trim();
  const second = String(url.searchParams.get('b') || '').trim();
  const season = String(url.searchParams.get('season') || 'Season 3').trim();
  if (!first || !second) return Response.json({ ok: false, error: 'Both clan IDs are required.' }, { status: 400 });
  try {
    const clans = await getClanComparison({ first, second, season });
    return Response.json({ ok: true, season, clans: clans || [], db: multiDbStatus() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error), db: multiDbStatus() }, { status: 503 });
  }
}
