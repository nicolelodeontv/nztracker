import { requireAdmin } from '../../lib/admin-auth';
import { createBaseline, getConfig, startNewSeason } from '../../lib/rep-tracker';

export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';

export async function GET() {
  try { return Response.json({ ok: true, config: await getConfig() }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return Response.json({ ok:false,error:error instanceof Error?error.message:String(error) }, { status:500 }); }
}

export async function POST(request) {
  const denied = requireAdmin(request); if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const admin = process.env.ADMIN_NAME || 'admin';
  try {
    if (body.action === 'baseline') return Response.json({ ok:true, baseline: await createBaseline(admin) });
    if (body.action === 'start') return Response.json({ ok:true, config: await startNewSeason(body.season, body.finalDayAt || null, admin) });
    return Response.json({ ok:false,error:'Unknown season action.' }, { status:400 });
  } catch (error) { return Response.json({ ok:false,error:error instanceof Error?error.message:String(error) }, { status:400 }); }
}
