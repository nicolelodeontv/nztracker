import { CLAN_WAR_RULES, getBleedingThreshold, getDrainFloor, getRewardForDifference, getVictoryResult, getAffectedTargets, getRecoveryAmount } from '../../clan-war-rules';

export const revalidate = 0;

export async function GET() {
  return Response.json({
    mode: CLAN_WAR_RULES.mode,
    bleeding: {
      memberRatio: CLAN_WAR_RULES.bleedingMemberRatio,
      thresholdRatio: CLAN_WAR_RULES.staminaThresholdRatio,
      drainFloorRatio: CLAN_WAR_RULES.staminaDrainFloorRatio
    },
    stamina: {
      drainPerAffectedMember: CLAN_WAR_RULES.staminaDrainPerAffectedMember,
      attackerLeaderCost: CLAN_WAR_RULES.attackerLeaderCost,
      recoveryIntervalMinutes: CLAN_WAR_RULES.recoveryIntervalMinutes,
      baseRecovery: CLAN_WAR_RULES.baseRecovery,
      ramenRecoveryPerLevel: CLAN_WAR_RULES.ramenRecoveryPerLevel
    },
    partyDrainTargets: {
      solo: getAffectedTargets(0),
      onePartyMember: getAffectedTargets(1),
      twoPartyMembers: getAffectedTargets(2)
    },
    examples: [
      { maxStamina: 100, drainFloor: getDrainFloor(100), bleedingThreshold: getBleedingThreshold(100) },
      { maxStamina: 150, drainFloor: getDrainFloor(150), bleedingThreshold: getBleedingThreshold(150) },
      { maxStamina: 200, drainFloor: getDrainFloor(200), bleedingThreshold: getBleedingThreshold(200) }
    ],
    recoveryExamples: [
      { ramenLevel: 0, staminaPerRecovery: getRecoveryAmount(0) },
      { ramenLevel: 1, staminaPerRecovery: getRecoveryAmount(1) },
      { ramenLevel: 5, staminaPerRecovery: getRecoveryAmount(5) }
    ],
    rewards: CLAN_WAR_RULES.rewards,
    calculator: {
      rewardForDifference: getRewardForDifference,
      victoryResult: getVictoryResult
    }
  });
}
