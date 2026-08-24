export const revalidate = 0;

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

    const members = Array.isArray(payload?.members)
      ? payload.members.map((member) => {
          const stamina = extractStamina(member);
          const threshold = stamina.max === null ? null : stamina.max * 0.70;
          const floor = stamina.max === null ? null : stamina.max * 0.50;
          return {
            name: clean(member?.name),
            level: toNumber(member?.level) ?? 0,
            reputation: toNumber(member?.rep ?? member?.reputation) ?? 0,
            stamina: stamina.current,
            maxStamina: stamina.max,
            bleedingThreshold: threshold,
            drainFloor: floor,
            bleeding: stamina.current !== null && threshold !== null ? stamina.current <= threshold : null
          };
        }).filter((member) => member.name)
      : [];

    return Response.json({ clanId, members, count: members.length, fetchedAt: new Date().toISOString(), source: target });
  } catch (error) {
    return Response.json({ error: 'Unable to fetch Ninja Zenshin clan members', details: error instanceof Error ? error.message : String(error), source: target }, { status: 502 });
  }
}
