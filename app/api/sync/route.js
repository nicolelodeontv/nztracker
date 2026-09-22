import { requireAdmin } from '../../lib/admin-auth';
import { syncTracker } from '../../lib/rep-tracker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const result = await syncTracker({ force: true, admin: process.env.ADMIN_NAME || 'admin' });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}

export async function GET() {
  try {
    const result = await syncTracker({ force: false });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 503 });
  }
}
