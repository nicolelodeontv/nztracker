import { dashboardData, recentActivity, getConfig, freshness, syncTracker } from '../../lib/rep-tracker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  let syncError = null;
  try { await syncTracker({ force: false, admin: 'public-refresh' }); }
  catch (error) { syncError = error instanceof Error ? error.message : String(error); }
  try {
    const data = await dashboardData();
    const activity = await recentActivity(10);
    const config = data.config || await getConfig();
    return Response.json({ ok: true, ...data, activity, config, syncError, serverTime: new Date().toISOString(), freshness: data.freshness || freshness(null) }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    return Response.json({ ok: false, error: syncError || (error instanceof Error ? error.message : String(error)) }, { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } });
  }
}
