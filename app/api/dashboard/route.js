import { dashboardData, recentActivity, freshness } from '../../lib/rep-tracker.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET() {
  try {
    const data = await dashboardData();
    let activity = [];
    let activityError = null;

    if (data.configured) {
      try {
        activity = await recentActivity(10, data);
      } catch (error) {
        activityError = error instanceof Error ? error.message : String(error);
      }
    }

    return Response.json(
      {
        ok: true,
        ...data,
        activity,
        activityError,
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
