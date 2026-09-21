import { GET as monitorGET } from '../monitor/route.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;

/**
 * Compatibility endpoint.
 * The canonical production scheduler is /api/monitor.
 * Keeping this route as a protected alias avoids breaking old diagnostics.
 */
export async function GET(request){
  return monitorGET(request);
}
