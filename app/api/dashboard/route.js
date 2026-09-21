import { dashboardData, recentActivity, freshness } from '../../lib/rep-tracker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET() {
  try {
    const data = await dashboardData();
    const activity = data.configured ? await recentActivity(10, data) : [];
    return Response.json(
      {
        ok: true,
        ...data,
        activity,
        syncError: null,
        serverTime: new Date().toISOString(),
        freshness: data.freshness || freshness(null),
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
}
