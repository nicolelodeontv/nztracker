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

        const evaluated = members.map((member) => {
          const max = getMaxStamina(member);
          const current = getCurrentStamina({ ...member, maxStamina: max });
          return {
            name: clean(member?.name),
            current,
            max,
            drainFloor: getDrainFloor(max),
            bleedingThreshold: getBleedingThreshold(max),
            bleeding: isBleeding({ ...member, stamina: current, maxStamina: max })
          };
        }).filter((member) => member.name);

        const bleedingMembers = evaluated.filter((member) => member.bleeding).length;
        const memberThreshold = Math.ceil(evaluated.length * CLAN_WAR_RULES.bleedingMemberRatio);
        const bleeding = evaluated.length > 0 && bleedingMembers >= memberThreshold;
        const fullyRecovered = evaluated.length > 0 && evaluated.every((member) => member.current >= member.max);
        const knownStaminaMembers = evaluated.filter((member) => Number.isFinite(Number(members.find((sourceMember) => clean(sourceMember?.name) === member.name)?.stamina))).length;

        return [clan, {
          clan,
          clanId,
          state: bleeding ? 'bleeding' : 'healthy',
          memberCount: evaluated.length,
          bleedingMembers,
          memberThreshold,
          fullyRecovered,
          staminaAvailable: evaluated.length > 0,
          knownStaminaMembers,
          knownStaminaRatio: evaluated.length ? knownStaminaMembers / evaluated.length : 0,
          maxStamina: CLAN_WAR_RULES.maxStamina,
          staminaSource: knownStaminaMembers > 0 ? 'live-or-default-200' : 'default-200',
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
