import { readRankingSnapshot, rankingStorageHealth } from '../../lib/ranking-cache';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const cached = await readRankingSnapshot();
    if (!cached?.rows?.length) {
      return Response.json({
        ok: false,
        error: 'Ranking dataset is not ready yet. The shared monitor has not published a snapshot.',
        sourceStatus: 'waiting-for-monitor',
        storage: rankingStorageHealth(),
      }, {
        status: 503,
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      });
    }

    return Response.json({
      ok: true,
      season: cached.season || 'Season 2',
      seasonEndsAt: '2026-09-14T00:00:00+08:00',
      countdown: cached.countdown || null,
      rows: cached.rows,
      fetchedAt: cached.fetchedAt || null,
      updatedAt: cached.updatedAt || cached.fetchedAt || null,
      source: cached.source,
      sourceStatus: 'cached',
      storage: rankingStorageHealth(),
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=60',
      },
    });
  } catch (error) {
    return Response.json({
      ok: false,
      error: 'Unable to read the shared ranking dataset',
      details: error instanceof Error ? error.message : String(error),
      sourceStatus: 'cache-error',
      storage: rankingStorageHealth(),
    }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  }
}
