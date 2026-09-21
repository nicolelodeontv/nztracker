import { scrapeClans } from '../../../lib/scraper.mjs';
import { upsertClans, recordSyncRun, dbStatus } from '../../../lib/supabase-db.mjs';
import { requireCronSecret } from '../../../lib/cron-auth.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function memberTotal(rows) {
  return rows.reduce((total, row) => total + Math.max(0, Number(row.memberCurrent) || 0), 0);
}

export async function GET(request) {
  const startedAt = new Date().toISOString();
  const denied = requireCronSecret(request, '/api/sync-clans');
  if (denied) return denied;

  try {
    const ranking = await scrapeClans();
    const stored = await upsertClans(ranking.rows, ranking.season, ranking.capturedAt);
    const finishedAt = new Date().toISOString();
    const membersCount = memberTotal(ranking.rows);

    await recordSyncRun({
      status: 'success',
      season: ranking.season,
      rows: ranking.rows.length,
      membersCount,
      startedAt,
      finishedAt
    });

    return Response.json({
      ok: true,
      season: ranking.season,
      clans: ranking.rows.length,
      members: membersCount,
      capturedAt: ranking.capturedAt,
      source: ranking.source,
      database: stored,
      db: dbStatus(),
      finishedAt
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const finishedAt = new Date().toISOString();
    try {
      await recordSyncRun({
        status: 'error',
        startedAt,
        finishedAt,
        error: error instanceof Error ? error.message : String(error)
      });
    } catch {}

    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      db: dbStatus(),
      finishedAt
    }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
