import { readMemberHistory, recordMemberSnapshot, storageHealth } from '../../lib/member-history';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

function clean(value) {
  return String(value ?? '').trim();
}

function validClanId(value) {
  return /^[a-zA-Z0-9_-]+$/.test(value);
}

export async function GET(request) {
  const url = new URL(request.url);
  const clanId = clean(url.searchParams.get('clanId'));
  const season = clean(url.searchParams.get('season')) || 'Season 2';
  const hours = Math.min(168, Math.max(1, Number(url.searchParams.get('hours')) || 168));

  if (!clanId || !validClanId(clanId)) {
    return Response.json({ error: 'A valid clanId is required.' }, { status: 400 });
  }

  try {
    const history = await readMemberHistory({ clanId, season, hours });
    return Response.json({ ok: true, ...history }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (error) {
    return Response.json({
      ok: false,
      error: 'Unable to read member history',
      details: error instanceof Error ? error.message : String(error),
      storage: storageHealth(),
    }, { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const clanId = clean(body?.clanId);
    const season = clean(body?.season) || 'Season 2';
    const members = Array.isArray(body?.members) ? body.members : [];
    const capturedAt = Number(body?.capturedAt) || Date.now();

    if (!clanId || !validClanId(clanId)) {
      return Response.json({ error: 'A valid clanId is required.' }, { status: 400 });
    }
    if (!members.length) {
      return Response.json({ error: 'At least one member is required.' }, { status: 400 });
    }
    if (members.length > 500) {
      return Response.json({ error: 'Snapshot contains too many members.' }, { status: 413 });
    }

    const result = await recordMemberSnapshot({ clanId, season, members, capturedAt });
    return Response.json({ ok: true, ...result }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (error) {
    return Response.json({
      ok: false,
      error: 'Unable to persist member history',
      details: error instanceof Error ? error.message : String(error),
      storage: storageHealth(),
    }, { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } });
  }
}
