import * as cheerio from 'cheerio';

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

function normalizeMembers(rawMembers) {
  return rawMembers.map((member) => {
    const name = clean(member?.name ?? member?.username ?? member?.player ?? member?.character);
    const reputation = toNumber(member?.rep ?? member?.reputation ?? member?.points) ?? 0;
    const nested = member?.stats || member?.attributes || member?.status || {};
    const stamina = pick(member, ['stamina', 'currentStamina', 'staminaCurrent', 'sta', 'current_sta'])
      ?? pick(nested, ['stamina', 'currentStamina', 'staminaCurrent', 'sta', 'current_sta']);
    const maxStamina = pick(member, ['maxStamina', 'staminaMax', 'max_stamina', 'staminaLimit', 'maxSta'])
      ?? pick(nested, ['maxStamina', 'staminaMax', 'max_stamina', 'staminaLimit', 'maxSta']);
    const bleedingThreshold = maxStamina === null ? null : maxStamina * 0.70;

    return {
      name,
      level: toNumber(member?.level) ?? 0,
      reputation,
      gain: 0,
      totalGain: 0,
      stamina,
      maxStamina,
      bleedingThreshold,
      drainFloor: maxStamina === null ? null : maxStamina * 0.50,
      bleeding: stamina !== null && bleedingThreshold !== null ? stamina <= bleedingThreshold : null
    };
  }).filter((member) => member.name);
}

function parseMemberHtml(text, clanId) {
  const $ = cheerio.load(text);
  const candidates = [];

  $('table').each((_, table) => {
    const headers = $(table).find('thead th').map((__, el) => clean($(el).text()).toLowerCase()).get();
    if (!headers.some((h) => /member|name|player/.test(h))) return;

    $(table).find('tbody tr').each((__, tr) => {
      const cells = $(tr).find('td').map((___, td) => clean($(td).text())).get();
      if (cells.length) candidates.push({ name: cells[0], level: cells[1], reputation: cells[2] });
    });
  });

  return {
    clanId,
    members: normalizeMembers(candidates),
    count: candidates.length,
    fetchedAt: new Date().toISOString(),
    source: `${MEMBER_API}/${encodeURIComponent(clanId)}`,
    stored: false
  };
}

async function fromSource(clanId) {
  const target = `${MEMBER_API}/${encodeURIComponent(clanId)}`;
  const response = await fetch(target, {
    cache: 'no-store',
    headers: {
      'User-Agent': 'Mozilla/5.0 NinjaZenshinLiveTracker/2.1',
      Accept: 'application/json,text/plain,text/html,*/*'
    }
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`Member source returned ${response.status}`);

  try {
    const payload = JSON.parse(text);
    const raw = Array.isArray(payload?.members) ? payload.members : Array.isArray(payload) ? payload : [];
    const members = normalizeMembers(raw);
    return {
      clanId,
      members,
      count: members.length,
      fetchedAt: new Date().toISOString(),
      source: target,
      stored: false
    };
  } catch {
    const parsed = parseMemberHtml(text, clanId);
    if (!parsed.count) throw new Error('Member source did not return a supported JSON or table response.');
    return parsed;
  }
}

export async function GET(request) {
  const url = new URL(request.url);
  const clanId = clean(url.searchParams.get('clanId'));

  if (!/^\d+$/.test(clanId)) {
    return Response.json({ error: 'A valid Ninja Zenshin clanId is required.' }, { status: 400 });
  }

  try {
    return Response.json(await fromSource(clanId), {
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    });
  } catch (error) {
    return Response.json({
      error: 'Unable to fetch Ninja Zenshin clan members',
      details: error instanceof Error ? error.message : String(error),
      source: `${MEMBER_API}/${encodeURIComponent(clanId)}`
    }, { status: 502 });
  }
}
