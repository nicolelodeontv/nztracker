import {
  ATTACK_STAMINA_COST,
  BLEEDING_RATIO,
  DRAIN_FLOOR_RATIO,
  getBleedingThreshold,
  getDrainFloor,
  getRecoveryAmount,
  isBleeding
} from './stamina.mjs';

export const CLAN_WAR_RULES = Object.freeze({
  mode: 'Quick Battle',
  maxStamina: 200,
  bleedingMemberRatio: 0.5,
  staminaThresholdRatio: BLEEDING_RATIO,
  staminaDrainFloorRatio: DRAIN_FLOOR_RATIO,
  staminaDrainPerAffectedMember: 10,
  attackerLeaderCost: ATTACK_STAMINA_COST,
  recoveryIntervalMinutes: 30,
  baseRecovery: 30,
  ramenRecoveryPerLevel: 10,
  partyDrainTargets: Object.freeze({ solo: 1, onePartyMember: 2, twoPartyMembers: 3 }),
  rewards: Object.freeze([
    { minDifference: 20000, rep: 30 },
    { minDifference: 10000, rep: 25 },
    { minDifference: 2000, rep: 20 },
    { minDifference: -2000, rep: 15 },
    { minDifference: -10000, rep: 12 },
    { minDifference: -20000, rep: 9 },
    { minDifference: -30000, rep: 6 },
    { minDifference: -40000, rep: 4 },
    { minDifference: -50000, rep: 2 },
    { minDifference: Number.NEGATIVE_INFINITY, rep: 1 }
  ])
});

export { getBleedingThreshold, getDrainFloor, getRecoveryAmount, isBleeding };

export function getRewardForDifference(difference) {
  const value = Number(difference);
  if (!Number.isFinite(value)) return 0;
  return CLAN_WAR_RULES.rewards.find((tier) => value >= tier.minDifference)?.rep ?? 1;
}

export function getVictoryResult(attackerRep, defenderRep, defenderBleeding) {
  const difference = Number(attackerRep) - Number(defenderRep);
  if (!defenderBleeding) return { won: false, reputation: 0, difference };
  return { won: true, reputation: getRewardForDifference(difference), difference };
}

export function getAffectedTargets(partyMemberCount) {
  const count = Number(partyMemberCount);
  if (!Number.isFinite(count) || count <= 0) return CLAN_WAR_RULES.partyDrainTargets.solo;
  if (count === 1) return CLAN_WAR_RULES.partyDrainTargets.onePartyMember;
  return CLAN_WAR_RULES.partyDrainTargets.twoPartyMembers;
}
