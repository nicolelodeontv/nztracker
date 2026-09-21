import { liveData } from '../../lib/rep-tracker.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

export async function GET() {
  try {
    return Response.json({ ok: true, ...(await liveData()) }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'X-Accel-Buffering': 'no'
      }
    });
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    });
  }
}
