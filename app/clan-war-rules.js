export const CLAN_WAR_RULES = Object.freeze({
  mode: 'Quick Battle',
  bleedingMemberRatio: 0.5,
  staminaThresholdRatio: 0.7,
  staminaDrainFloorRatio: 0.5,
  staminaDrainPerAffectedMember: 10,
  attackerLeaderCost: 10,
  recoveryIntervalMinutes: 30,
  baseRecovery: 30,
  ramenRecoveryPerLevel: 10,
  partyDrainTargets: { solo: 1, onePartyMember: 2, twoPartyMembers: 3 },
  rewards: [
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
  ]
});

export function getBleedingThreshold(maxStamina) {
  return Number(maxStamina) * CLAN_WAR_RULES.staminaThresholdRatio;
}

export function getDrainFloor(maxStamina) {
  return Number(maxStamina) * CLAN_WAR_RULES.staminaDrainFloorRatio;
}

export function isMemberBleeding(currentStamina, maxStamina) {
  return Number(currentStamina) <= getBleedingThreshold(maxStamina);
}

export function getRewardForDifference(difference) {
  const value = Number(difference);
  if (!Number.isFinite(value)) return 0;
  const tier = CLAN_WAR_RULES.rewards.find((item) => value >= item.minDifference);
  return tier?.rep ?? 1;
}

export function getVictoryResult(attackerRep, defenderRep, defenderBleeding) {
  const difference = Number(attackerRep) - Number(defenderRep);
  if (!defenderBleeding) return { won: false, reputation: 0, difference };
  return { won: true, reputation: getRewardForDifference(difference), difference };
}

export function getAffectedTargets(partyMemberCount) {
  if (Number(partyMemberCount) <= 0) return CLAN_WAR_RULES.partyDrainTargets.solo;
  if (Number(partyMemberCount) === 1) return CLAN_WAR_RULES.partyDrainTargets.onePartyMember;
  return CLAN_WAR_RULES.partyDrainTargets.twoPartyMembers;
}

export function getRecoveryAmount(ramenLevel = 0) {
  return CLAN_WAR_RULES.baseRecovery + Math.max(0, Number(ramenLevel) || 0) * CLAN_WAR_RULES.ramenRecoveryPerLevel;
}
