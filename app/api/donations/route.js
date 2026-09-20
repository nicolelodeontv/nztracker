import {
  readDonationHistory,
  recordDonationSnapshot,
  readLatestDonationStatus,
  validateDonationPayload,
} from '../../lib/donation-history.js';
import { storageHealth } from '../../lib/member-history.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const ALLOWED_ORIGIN = 'https://ninjazenshin.online';
const INGEST_HEADER = 'x-ingest-key';

function corsHeaders(request, extra = {}) {
  const headers = { ...extra, Vary: 'Origin' };
  if (request.headers.get('origin') === ALLOWED_ORIGIN) {
    headers['Access-Control-Allow-Origin'] = ALLOWED_ORIGIN;
  }
  return headers;
}

function json(request, payload, init = {}) {
  return Response.json(payload, { ...init, headers: corsHeaders(request, init.headers) });
}

export async function OPTIONS(request) {
  if (request.headers.get('origin') !== ALLOWED_ORIGIN) {
    return new Response(null, { status: 204, headers: { Vary: 'Origin' } });
  }
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, {
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Ingest-Key',
      'Access-Control-Max-Age': '600',
    }),
  });
}

export async function GET(request) {
  const url = new URL(request.url);
  const clanId = String(url.searchParams.get('clanId') || '').trim();
  const season = String(url.searchParams.get('season') || '').trim();

  if (!/^[a-zA-Z0-9_-]+$/.test(clanId)) {
    return json(request, { ok: false, error: 'A valid clanId is required.' }, { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } });
  }

  try {
    const history = await readDonationHistory({ clanId, season: season || undefined });
    return json(request, { ok: true, ...history }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch {
    return json(request, { ok: false, error: 'Unable to read donation history', storage: storageHealth() }, { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } });
  }
}

export async function POST(request) {
  const expectedKey = process.env.INGEST_KEY;
  const suppliedKey = request.headers.get(INGEST_HEADER);

  if (!expectedKey) {
    return json(request, { ok: false, error: 'Donation ingest is not configured.' }, { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } });
  }
  if (!suppliedKey || suppliedKey !== expectedKey) {
    return json(request, { ok: false, error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store, max-age=0' } });
  }

  let body;
  try {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
      return json(request, { ok: false, error: 'Content-Type must be application/json.' }, { status: 422, headers: { 'Cache-Control': 'no-store, max-age=0' } });
    }
    body = await request.json();
  } catch {
    return json(request, { ok: false, error: 'Malformed JSON payload.' }, { status: 422, headers: { 'Cache-Control': 'no-store, max-age=0' } });
  }

  const validated = validateDonationPayload(body);
  if (!validated.ok) {
    return json(request, { ok: false, error: validated.error }, { status: 422, headers: { 'Cache-Control': 'no-store, max-age=0' } });
  }

  try {
    const result = await recordDonationSnapshot({
      clanId: validated.clanId,
      season: validated.season,
      members: validated.members,
    });
    return json(request, { ok: true, ...result }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch {
    return json(request, { ok: false, error: 'Unable to persist donation snapshot', storage: storageHealth() }, { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } });
  }
}
