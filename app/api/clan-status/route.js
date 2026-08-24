import * as cheerio from 'cheerio';
import { getBleedingThreshold, getDrainFloor, isMemberBleeding, CLAN_WAR_RULES } from '../../clan-war-rules';

export const revalidate = 0;

const SITE_ORIGIN = 'https://ninjazenshin.online';
const RANKING_URL = `${SITE_ORIGIN}/clan-ranking`;
const MEMBER_URL = `${SITE_ORIGIN}/clan-ranking/members`;
const CACHE_TTL = 20_000;

const cache = new Map();

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function pickNumber(object, keys) {
  for (const key of keys) {
    const value = toNumber(object?.[key]);
    if (value !== null) return value;
  }
  return null;
}

function extractStamina(member) {
  const nested = member?.stats || member?.attributes || member?.status || {};
  const current = pickNumber(member, ['stamina', 'currentStamina', 'staminaCurrent', 'sta', 'current_sta'])
    ?? pickNumber(nested, ['stamina', 'currentStamina', 'staminaCurrent', 'sta', 'current_sta']);
  const max = pickNumber(member, ['maxStamina', 'staminaMax', 'max_stamina', 'staminaLimit', 'maxSta'])
    ?? pickNumber(nested, ['maxStamina', 'staminaMax', 'max_stamina', 'staminaLimit', 'maxSta']);
  return { current, max };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      'User-Agent': 'Mozilla/5.0 NinjaZenshinLiveTracker/1.0',
      Accept: 'application/json,text/plain,*/*'
    }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Source returned ${response.status}`);
  try { return JSON.parse(text); } catch { throw new Error('Source did not return JSON'); }
}

async function loadSourceRows() {
  const response = await fetch(RANKING_URL, {
    cache: 'no-store',
    headers: { 'User-Agent': 'Mozilla/5.0 NinjaZenshinLiveTracker/1.0', Accept: 'text/html,application/xhtml+xml' }
  });
  if (!response.ok) throw new Error(`Ranking source returned ${response.status}`);
  const html = await response.text();
  const $ = cheerio.load(html);
  const map = new Map();
  $('table').each((_, table) => {
    const headers = $(table).find('thead th').map((__, el) => clean($(el).text()).toLowerCase()).get();
    if (!headers.includes('clan') || !headers.includes('members') || !headers.includes('reputation')) return;
    $(table).find('tbody tr').each((__, tr) => {
      const clanCell = $(tr).find('td').eq(1);
      const clan = clean(clanCell.text());
      const clanId = clean(clanCell.find('[data-clan]').attr('data-clan') || '');
      if (clan && clanId) map.set(clan, clanId);
    });
  });
  return map;
}

export async function GET(request) {
  const url = new URL(request.url);
  const clans = [...new Set((url.searchParams.get('clans') || '').split(',').map(clean).filter(Boolean))].slice(0, 25);
  if (!clans.length) return Response.json({ error: 'Provide at least one clan name.' }, { status: 400 });

  const key = clans.join('|');
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL) return Response.json(cached.data);

  try {
    const ids = await loadSourceRows();
    const results = await Promise.all(clans.map(async (clan) => {
      const clanId = ids.get(clan);
      if (!clanId) return [clan, { clan, state: 'unknown', reason: 'Clan ID unavailable' }];

      try {
        const payload = await fetchJson(`${MEMBER_URL}/${encodeURIComponent(clanId)}`);
        const members = Array.isArray(payload?.members) ? payload.members : [];
        const stamina = members.map((member) => ({ name: clean(member?.name), ...extractStamina(member) }));
        const known = stamina.filter((member) => member.current !== null && member.max !== null).length;
        if (!members.length || known !== members.length) {
          return [clan, { clan, clanId, state: 'unknown', reason: 'Stamina not exposed by source', memberCount: members.length }];
        }

        const evaluated = stamina.map((member) => {
          const drainFloor = getDrainFloor(member.max);
          const bleedingThreshold = getBleedingThreshold(member.max);
          return {
            ...member,
            drainFloor,
            bleedingThreshold,
            bleeding: isMemberBleeding(member.current, member.max)
          };
        });

        const bleedingMembers = evaluated.filter((member) => member.bleeding).length;
        const memberThreshold = Math.ceil(evaluated.length * CLAN_WAR_RULES.bleedingMemberRatio);
        const bleeding = bleedingMembers >= memberThreshold;
        const fullyRecovered = evaluated.every((member) => member.current >= member.max);

        return [clan, {
          clan,
          clanId,
          state: bleeding ? 'bleeding' : 'healthy',
          memberCount: evaluated.length,
          bleedingMembers,
          memberThreshold,
          fullyRecovered,
          staminaAvailable: true,
          rules: {
            bleedingMemberRatio: CLAN_WAR_RULES.bleedingMemberRatio,
            thresholdRatio: CLAN_WAR_RULES.staminaThresholdRatio,
            drainFloorRatio: CLAN_WAR_RULES.staminaDrainFloorRatio,
            drainPerAffectedMember: CLAN_WAR_RULES.staminaDrainPerAffectedMember
          },
          members: evaluated
        }];
      } catch (error) {
        return [clan, { clan, clanId, state: 'unknown', reason: error instanceof Error ? error.message : 'Member status unavailable' }];
      }
    }));

    const data = { fetchedAt: new Date().toISOString(), source: RANKING_URL, statuses: Object.fromEntries(results) };
    cache.set(key, { at: Date.now(), data });
    return Response.json(data);
  } catch (error) {
    return Response.json({ error: 'Unable to determine clan stamina status.', details: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
