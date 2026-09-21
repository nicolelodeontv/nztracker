import { dashboardData, recentActivity, getConfig, freshness, syncTracker } from '../../lib/rep-tracker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  let syncError = null;
  const routeStartedAt = Date.now();
  const syncStartedAt = Date.now();
  console.info('[dashboard] syncTracker:start', {
    sequentialSupabaseQueries: '40 on successful 30-member sync; 4 on reuse path',
  });
  try { await syncTracker({ force: false, admin: 'public-refresh' }); }
  catch (error) { syncError = error instanceof Error ? error.message : String(error); }
  console.info('[dashboard] syncTracker:end', {
    elapsedMs: Date.now() - syncStartedAt,
    error: syncError,
  });
  try {
    const dashboardStartedAt = Date.now();
    console.info('[dashboard] dashboardData:start', {
      sequentialSupabaseQueries: 6,
    });
    const data = await dashboardData();
    console.info('[dashboard] dashboardData:end', {
      elapsedMs: Date.now() - dashboardStartedAt,
    });
    const activityStartedAt = Date.now();
    console.info('[dashboard] recentActivity:start', {
      sequentialSupabaseQueries: 7,
      note: 'recentActivity currently calls dashboardData() again, then performs one additional query',
    });
    const activity = await recentActivity(10);
    const config = data.config || await getConfig();
    console.info('[dashboard] recentActivity:end', {
      elapsedMs: Date.now() - activityStartedAt,
      routeElapsedMs: Date.now() - routeStartedAt,
      totalSequentialSupabaseQueries: '53 on successful 30-member sync path; 11 after a reused sync',
    });
    return Response.json({ ok: true, ...data, activity, config, syncError, serverTime: new Date().toISOString(), freshness: data.freshness || freshness(null) }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    return Response.json({ ok: false, error: syncError || (error instanceof Error ? error.message : String(error)) }, { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } });
  }
}
