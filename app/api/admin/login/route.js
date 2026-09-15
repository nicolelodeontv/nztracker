import { adminCookieOptions, issueAdminCookie, ADMIN_COOKIE_NAME } from '../../../lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const password = String(body.password || '');
  const configured = process.env.ADMIN_PASSWORD;
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
