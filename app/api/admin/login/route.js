import { adminCookieOptions, issueAdminCookie, isAdmin, ADMIN_COOKIE_NAME } from '../../../lib/admin-auth.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  return Response.json({ admin: isAdmin(request) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const password = String(body.password || '');
  const configured = process.env.ADMIN_PASSWORD;
  const sessionSecret = process.env.ADMIN_SESSION_SECRET || process.env.CR0N_SECRET || process.env.CRON_SECRET;
  if (!sessionSecret) {
    return Response.json({ error: 'Admin authentication is not configured. Set ADMIN_SESSION_SECRET in the production environment.' }, { status: 503 });
  }
  if (!configured || !password || password.length !== configured.length || password !== configured) {
    return Response.json({ error: 'Invalid admin password.' }, { status: 401 });
  }
  const response = Response.json({ ok: true, admin: process.env.ADMIN_NAME || 'admin' });
  response.headers.append('Set-Cookie', `${ADMIN_COOKIE_NAME}=${issueAdminCookie()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${adminCookieOptions().maxAge}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  return response;
}

export async function DELETE() {
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': `${ADMIN_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}` } });
}
