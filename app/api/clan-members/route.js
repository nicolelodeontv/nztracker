import { ensureSchema } from '../../../lib/db.js';

export const dynamic = 'force-dynamic';

const SITE_ORIGIN = 'https://ninjazenshin.online';
const MEMBER_API = `${SITE_ORIGIN}/clan-ranking/members`;

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function pick(object, keys) {
  for (const key of keys) {
    const value = toNumber(object?.[key]);
    if (value !== null) return value;
  }
  return null;
}

function normalizeMembers(rawMembers, previousMembers = []) {
  const previous = new Map(previousMembers.map((member) => [clean(member?.name), toNumber(member?.rep ?? member?.reputation) ?? 0]));

  return rawMembers.map((member) => {
    const name = clean(member?.name);
    const reputation = toNumber(member?.rep ?? member?.reputation) ?? 0;
    const nested = member?.stats || member?.attributes || member?.status || {};
    const stamina = pick(member, ['stamina', 'currentStamina', 'staminaCurrent', 'sta', 'current_sta'])
      ?? pick(nested, ['stamina', 'currentStamina', 'staminaCurrent', 'sta', 'current_sta']);
    const maxStamina = pick(member, ['maxStamina', 'staminaMax', 'max_stamina', 'staminaLimit', 'maxSta'])
      ?? pick(nested, ['maxStamina', 'staminaMax', 'max_stamina', 'staminaLimit', 'maxSta']);
    const oldRep = previous.get(name);
    const gain = oldRep == null ? 0 : Math.max(0, reputation - oldRep);
    const bleedingThreshold = maxStamina === null ? null : maxStamina * 0.70;

    return {
      name,
      level: toNumber(member?.level) ?? 0,
      reputation,
      gain,
      totalGain: gain,
      stamina,
      maxStamina,
      bleedingThreshold,
      drainFloor: maxStamina === null ? null : maxStamina * 0.50,
      bleeding: stamina !== null && bleedingThreshold !== null ? stamina <= bleedingThreshold : null
    };
  }).filter((member) => member.name);
}

async function fromDatabase(clanId) {
  const db = await ensureSchema();
  const result = await db`
    SELECT fetched_at, members
    FROM member_snapshots
    WHERE clan_id = ${clanId}
    ORDER BY fetched_at DESC
    LIMIT 2
  `;
  if (!result.length) return null;

  const latest = result[0];
  const previous = result[1]?.members || [];
  const members = normalizeMembers(latest.members || [], previous);

  return {
    clanId,
    members,
    count: members.length,
    fetchedAt: new Date(latest.fetched_at).toISOString(),
    source: `${MEMBER_API}/${encodeURIComponent(clanId)}`,
    stored: true
  };
}

async function fromSource(clanId) {
  const target = `${MEMBER_API}/${encodeURIComponent(clanId)}`;
  const response = await fetch(target, {
    cache: 'no-store',
    headers: {
      'User-Agent': 'Mozilla/5.0 NinjaZenshinLiveTracker/2.0',
      Accept: 'application/json,text/plain,*/*'
    }
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`Member API returned ${response.status}`);

  let payload;
  try { payload = JSON.parse(text); } catch { throw new Error('Member API did not return JSON.'); }
  const members = normalizeMembers(Array.isArray(payload?.members) ? payload.members : []);

  return {
    clanId,
    members,
    count: members.length,
    fetchedAt: new Date().toISOString(),
    source: target,
    stored: false
  };
}

export async function GET(request) {
  const url = new URL(request.url);
  const clanId = clean(url.searchParams.get('clanId'));

  if (!/^\d+$/.test(clanId)) {
    return Response.json({ error: 'A valid Ninja Zenshin clanId is required.' }, { status: 400 });
  }

  try {
    try {
      const stored = await fromDatabase(clanId);
      if (stored) return Response.json(stored);
    } catch (databaseError) {
      console.warn('Member database unavailable; falling back to live source:', databaseError);
    }

    return Response.json(await fromSource(clanId));
  } catch (error) {
    return Response.json({
      error: 'Unable to fetch Ninja Zenshin clan members',
      details: error instanceof Error ? error.message : String(error),
      source: `${MEMBER_API}/${encodeURIComponent(clanId)}`
    }, { status: 502 });
  }
}
