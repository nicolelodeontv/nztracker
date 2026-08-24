import { AMFClient, ENCODING } from '@jadbalout/nodeamf';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

const AMF_ORIGIN = 'https://amf.ninjazenshin.online/';

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

function normalizeMembers(rawMembers) {
  return (Array.isArray(rawMembers) ? rawMembers : []).map((member) => {
    const source = member && typeof member === 'object' ? member : {};
    const nested = source?.stats || source?.attributes || source?.status || {};
    const name = clean(source.name ?? source.username ?? source.player ?? source.character);
    const reputation = toNumber(source.reputation ?? source.rep ?? source.reputation_gain ?? source.points) ?? 0;
    const stamina = pick(source, ['stamina', 'currentStamina', 'staminaCurrent', 'sta', 'current_sta'])
      ?? pick(nested, ['stamina', 'currentStamina', 'staminaCurrent', 'sta', 'current_sta']);
    const maxStamina = pick(source, ['maxStamina', 'staminaMax', 'max_stamina', 'staminaLimit', 'maxSta'])
      ?? pick(nested, ['maxStamina', 'staminaMax', 'max_stamina', 'staminaLimit', 'maxSta']);

    return {
      id: clean(source.id),
      name,
      level: toNumber(source.level) ?? 0,
      reputation,
      reputationGain: toNumber(source.reputation_gain) ?? null,
      gain: 0,
      totalGain: 0,
      stamina,
      maxStamina,
      staminaKnown: stamina !== null,
      maxStaminaKnown: maxStamina !== null,
      bleedingThreshold: maxStamina === null ? null : maxStamina * 0.70,
      drainFloor: maxStamina === null ? null : maxStamina * 0.50,
      bleeding: stamina !== null && maxStamina !== null ? stamina <= maxStamina * 0.70 : null
    };
  }).filter((member) => member.name);
}

async function fromAmf(clanId) {
  const client = new AMFClient(AMF_ORIGIN, ENCODING.AMF0);
  const packet = await client.sendRequest('ClanService.getMemberList', [clanId]);
  const body = packet?.bodies?.[0]?.data;

  if (!body) throw new Error('Ninja Zenshin AMF response was empty.');
  if (body.status && String(body.status) !== '1') {
    throw new Error(`Ninja Zenshin member service returned status ${body.status}.`);
  }

  const rawMembers = Array.isArray(body.result)
    ? body.result
    : Array.isArray(body.members)
      ? body.members
      : [];

  const members = normalizeMembers(rawMembers);
  if (!members.length) throw new Error('Ninja Zenshin AMF member list contained no members.');

  return {
    clanId,
    members,
    count: members.length,
    fetchedAt: new Date().toISOString(),
    source: AMF_ORIGIN,
    service: 'ClanService.getMemberList',
    stored: false,
    staminaSource: members.some((member) => member.staminaKnown) ? 'game-amf' : 'unavailable'
  };
}

export async function GET(request) {
  const url = new URL(request.url);
  const clanId = clean(url.searchParams.get('clanId'));

  if (!clanId || !/^[a-zA-Z0-9_-]+$/.test(clanId)) {
    return Response.json({ error: 'A valid Ninja Zenshin clanId is required.' }, { status: 400 });
  }

  try {
    return Response.json(await fromAmf(clanId), {
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    });
  } catch (error) {
    return Response.json({
      error: 'Unable to fetch Ninja Zenshin clan members from the game service',
      details: error instanceof Error ? error.message : String(error),
      clanId,
      source: AMF_ORIGIN,
      service: 'ClanService.getMemberList'
    }, { status: 502 });
  }
}
