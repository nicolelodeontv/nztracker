import { scrapeClans } from '../../../lib/scraper.mjs';
import { upsertClans, recordSyncRun, dbStatus } from '../../../lib/supabase-db.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = request.headers.get('authorization');
  return auth === `Bearer ${secret}`;
}

export async function GET(request) {
  const startedAt = new Date().toISOString();
  if (!authorized(request)) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const ranking = await scrapeClans();
    const stored = await upsertClans(ranking.rows, ranking.season, ranking.capturedAt);
    const finishedAt = new Date().toISOString();
    await recordSyncRun({ status: 'success', season: ranking.season, rows: ranking.rows.length, startedAt, finishedAt });
    return Response.json({
      ok: true, season: ranking.season, clans: ranking.rows.length,
      capturedAt: ranking.capturedAt, source: ranking.source, database: stored, db: dbStatus(),
      finishedAt
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const finishedAt = new Date().toISOString();
    try { await recordSyncRun({ status: 'error', startedAt, finishedAt, error: error instanceof Error ? error.message : String(error) }); } catch {}
    return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error), db: dbStatus(), finishedAt }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
