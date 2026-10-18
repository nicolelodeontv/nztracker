import { GET as monitorGET } from '../monitor/route.js';
import { syncClans } from '../../lib/clan-source.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Keep the legacy monitor behavior, then append the public clan ranking / war
 * sync. The canonical ten-second production scheduler continues to call
 * /api/monitor directly, so it does not run this additional sync by default.
 */
export async function GET(request) {
  const monitorResponse = await monitorGET(request);
  if (!monitorResponse.ok) return monitorResponse;

  const monitorData = await monitorResponse.json();
  try {
    const clanWarSync = await syncClans();
    return Response.json(
      { ...monitorData, clanWarSync: { ok: true, ...clanWarSync } },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    return Response.json(
      {
        ...monitorData,
        ok: false,
        clanWarSync: { ok: false, error: String(error?.message ?? error) }
      },
      {
        status: 502,
        headers: { 'Cache-Control': 'no-store, max-age=0' }
      }
    );
  }
}
