import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE = 'nz_admin';
const TTL_MS = 12 * 60 * 60 * 1000;

function secret() {
  return process.env.ADMIN_SESSION_SECRET || process.env.CR0N_SECRET || process.env.CRON_SECRET || '';
}

function sign(value) {
  return createHmac('sha256', secret()).update(value).digest('hex');
}

export function isAdmin(request) {
  const key = secret();
  if (!key) return false;
  const raw = request.cookies.get(COOKIE)?.value || '';
  const [ts, sig] = raw.split('.');
  const timestamp = Number(ts);
  if (!sig || !Number.isFinite(timestamp) || Date.now() - timestamp > TTL_MS || timestamp > Date.now() + 60_000) return false;
  const expected = sign(ts);
  try { return timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex')); } catch { return false; }
}

export function requireAdmin(request) {
  if (!isAdmin(request)) return Response.json({ error: 'Admin authentication required.' }, { status: 401 });
  return null;
}

export function adminCookieOptions(maxAge = Math.floor(TTL_MS / 1000)) {
  return { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge };
}

export function issueAdminCookie() {
  const ts = String(Date.now());
  return `${ts}.${sign(ts)}`;
}

export const ADMIN_COOKIE_NAME = COOKIE;
