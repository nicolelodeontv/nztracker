import { getClans, getLatestSync, dbStatus } from '../../../lib/supabase-db.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(Number(searchParams.get('limit') || 100), 1), 500);
    const season = searchParams.get('season') || undefined;
    const clans = await getClans({ season, limit });
    if (!clans) return Response.json({ success: false, error: 'Supabase is not configured', db: dbStatus() }, { status: 503 });
    const sync = await getLatestSync();
    return Response.json({ success: true, clans, count: clans.length, lastUpdated: clans[0]?.capturedAt || null, sync, db: dbStatus() }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    return Response.json({ success: false, error: error instanceof Error ? error.message : String(error), db: dbStatus() }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
