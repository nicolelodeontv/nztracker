import { syncClans } from '../../lib/clan-source.mjs';
import { requireRequiredCronSecret } from '../../lib/cron-auth.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Dedicated finished-season war-results sync. The ten-second monitor continues
 * to run separately through /api/monitor and owns canonical ranking history.
 */
export async function GET(request) {
  const denied = requireRequiredCronSecret(request, '/api/sync-clans');
  if (denied) return denied;

  try {
    return Response.json(
      { ok: true, ...(await syncClans()) },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    return Response.json(
      { ok: false, error: String(error?.message ?? error) },
      {
        status: 502,
        headers: { 'Cache-Control': 'no-store, max-age=0' }
      }
    );
  }
}
