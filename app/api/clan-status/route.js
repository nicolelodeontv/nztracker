import { getBleedingThreshold, getDrainFloor, getMaxStamina, getCurrentStamina, isBleeding } from '../../lib/stamina.mjs';
import { CLAN_WAR_RULES } from '../../lib/game-rules.mjs';
import { parseRankingHtml } from '../../lib/source-parser.mjs';

export const revalidate = 0;

const RANKING_URL = 'https://ninjazenshin.online/?panel=clan-ranking';
const MEMBER_API = 'https://ninjazenshin.online/clan-ranking/members';
const CACHE_TTL = 20_000;
const cache = new Map();

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

async function fetchJson(url) {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      'User-Agent': 'Mozilla/5.0 NinjaZenshinLiveTracker/2.3',
      Accept: 'application/json,text/plain,*/*'
    }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
  try { return JSON.parse(text); } catch { throw new Error('Source did not return JSON'); }
}

async function loadSourceRows() {
  const response = await fetch(RANKING_URL, {
    cache: 'no-store',
    headers: {
      'User-Agent': 'Mozilla/5.0 NinjaZenshinLiveTracker/2.3',
      Accept: 'text/html,application/xhtml+xml'
    }
  });
  if (!response.ok) throw new Error(`Ranking source returned HTTP ${response.status}`);
  return parseRankingHtml(await response.text());
}

export function evaluateClanStatus({ clan, clanId, members = [] }) {
  const evaluated = members.map((member) => {
    const max = getMaxStamina(member);
    const current = getCurrentStamina({ ...member, maxStamina: max });
    const rawStamina = member?.stamina ?? member?.currentStamina ?? member?.staminaCurrent ?? member?.sta;
    const serverReported = rawStamina !== null && rawStamina !== undefined && rawStamina !== '' && Number.isFinite(Number(rawStamina));

    return {
      name: clean(member?.name),
      current,
      max,
      drainFloor: getDrainFloor(max),
      bleedingThreshold: getBleedingThreshold(max),
      bleeding: isBleeding({ ...member, stamina: current, maxStamina: max }),
      serverReported
    };
  }).filter((member) => member.name);

  const knownStaminaMembers = evaluated.filter((member) => member.serverReported && member.current !== null).length;
  const fullyVerified = evaluated.length > 0 && knownStaminaMembers === evaluated.length;
  const bleedingMembers = fullyVerified ? evaluated.filter((member) => member.bleeding === true).length : 0;
  const memberThreshold = Math.ceil(evaluated.length * CLAN_WAR_RULES.bleedingMemberRatio);
  const bleeding = fullyVerified && bleedingMembers >= memberThreshold;
  const fullyRecovered = fullyVerified && evaluated.every((member) => member.current >= member.max);
  const staminaSource = fullyVerified
    ? 'server-reported'
    : knownStaminaMembers > 0
      ? 'partial-server-reported'
      : 'unavailable';

  return {
    clan,
    clanId,
    state: fullyVerified ? (bleeding ? 'bleeding' : 'healthy') : 'insufficient-data',
    memberCount: evaluated.length,
    bleedingMembers,
    memberThreshold,
    fullyRecovered,
    staminaAvailable: knownStaminaMembers > 0,
    knownStaminaMembers,
    knownStaminaRatio: evaluated.length ? knownStaminaMembers / evaluated.length : 0,
    maxStamina: CLAN_WAR_RULES.maxStamina,
    staminaSource,
    rules: {
      bleedingMemberRatio: CLAN_WAR_RULES.bleedingMemberRatio,
      thresholdRatio: CLAN_WAR_RULES.staminaThresholdRatio,
      drainFloorRatio: CLAN_WAR_RULES.staminaDrainFloorRatio,
      drainPerAffectedMember: CLAN_WAR_RULES.staminaDrainPerAffectedMember
    },
    members: evaluated
  };
}

export async function GET(request) {
  const url = new URL(request.url);
  const clans = [...new Set((url.searchParams.get('clans') || '').split(',').map(clean).filter(Boolean))].slice(0, 25);
  if (!clans.length) return Response.json({ error: 'Provide at least one clan name.' }, { status: 400 });

  const key = clans.join('|');
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL) return Response.json(cached.data);

  try {
    const source = await loadSourceRows();
    const results = await Promise.all(clans.map(async (clan) => {
      const sourceRow = source.rows.find((row) => row.clan === clan);
      const clanId = sourceRow?.clanId;
      if (!clanId) return [clan, { clan, state: 'unknown', reason: 'Clan ID unavailable' }];

      try {
        const payload = await fetchJson(`${MEMBER_API}/${encodeURIComponent(clanId)}`);
        const members = Array.isArray(payload?.members) ? payload.members : [];
        if (!members.length) return [clan, { clan, state: 'unknown', reason: 'No member data returned by source', memberCount: 0, staminaAvailable: false }];

        return [clan, evaluateClanStatus({ clan, clanId, members })];
      } catch (error) {
        return [clan, { clan, clanId, state: 'unknown', reason: error instanceof Error ? error.message : 'Member status unavailable' }];
      }
    }));

    const data = {
      fetchedAt: new Date().toISOString(),
      source: RANKING_URL,
      countdown: source.countdown,
      remainingSeconds: source.countdown?.remainingSeconds ?? null,
      statuses: Object.fromEntries(results)
    };
    cache.set(key, { at: Date.now(), data });
    return Response.json(data, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    return Response.json({
      error: 'Unable to determine clan stamina status.',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 502 });
  }
}
