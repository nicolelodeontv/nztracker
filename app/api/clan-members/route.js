export const revalidate = 0;

const SITE_ORIGIN = 'https://ninjazenshin.online';
const MEMBER_API = `${SITE_ORIGIN}/clan-ranking/members`;

// Server-instance history. This gives the live members endpoint a real
// previous-value comparison instead of expecting the upstream API to return gain.
const memberHistory = new Map();

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

function extractStamina(member) {
  const nested = member?.stats || member?.attributes || member?.status || {};
  const current = pick(member, ['stamina', 'currentStamina', 'staminaCurrent', 'sta', 'current_sta'])
    ?? pick(nested, ['stamina', 'currentStamina', 'staminaCurrent', 'sta', 'current_sta']);
  const max = pick(member, ['maxStamina', 'staminaMax', 'max_stamina', 'staminaLimit', 'maxSta'])
    ?? pick(nested, ['maxStamina', 'staminaMax', 'max_stamina', 'staminaLimit', 'maxSta']);
  return { current, max };
}

export async function GET(request) {
  const url = new URL(request.url);
  const clanId = clean(url.searchParams.get('clanId'));

  if (!/^\d+$/.test(clanId)) {
    return Response.json({ error: 'A valid Ninja Zenshin clanId is required.' }, { status: 400 });
  }

  const target = `${MEMBER_API}/${encodeURIComponent(clanId)}`;

  try {
    const response = await fetch(target, {
      cache: 'no-store',
      headers: {
        'User-Agent': 'Mozilla/5.0 NinjaZenshinLiveTracker/1.0',
        Accept: 'application/json,text/plain,*/*'
      }
    });

    const text = await response.text();
    if (!response.ok) return Response.json({ error: `Member API returned ${response.status}`, source: target }, { status: 502 });

    let payload;
    try { payload = JSON.parse(text); } catch { return Response.json({ error: 'Member API did not return JSON.', source: target }, { status: 502 }); }

    const now = Date.now();
    const clanKey = `clan:${clanId}`;
    const previous = memberHistory.get(clanKey) || { baseline: {}, current: {} };

    const members = Array.isArray(payload?.members)
      ? payload.members.map((member) => {
          const name = clean(member?.name);
          const reputation = toNumber(member?.rep ?? member?.reputation) ?? 0;
          const stamina = extractStamina(member);
          const threshold = stamina.max === null ? null : stamina.max * 0.70;
          const floor = stamina.max === null ? null : stamina.max * 0.50;
          const oldRep = previous.current[name];
          const baselineRep = previous.baseline[name] ?? reputation;
          const gain = Number.isFinite(oldRep) ? Math.max(0, reputation - oldRep) : 0;
          const totalGain = Math.max(0, reputation - baselineRep);

          return {
            name,
            level: toNumber(member?.level) ?? 0,
            reputation,
            gain,
            totalGain,
            stamina: stamina.current,
            maxStamina: stamina.max,
            bleedingThreshold: threshold,
            drainFloor: floor,
            bleeding: stamina.current !== null && threshold !== null ? stamina.current <= threshold : null
          };
        }).filter((member) => member.name)
      : [];

    const nextCurrent = {};
    const nextBaseline = { ...previous.baseline };
    members.forEach((member) => {
      nextCurrent[member.name] = member.reputation;
      if (nextBaseline[member.name] == null) nextBaseline[member.name] = member.reputation;
    });
    memberHistory.set(clanKey, { baseline: nextBaseline, current: nextCurrent, at: now });

    return Response.json({ clanId, members, count: members.length, fetchedAt: new Date(now).toISOString(), source: target });
  } catch (error) {
    return Response.json({ error: 'Unable to fetch Ninja Zenshin clan members', details: error instanceof Error ? error.message : String(error), source: target }, { status: 502 });
  }
}
