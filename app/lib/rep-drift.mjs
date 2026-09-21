export const REP_DRIFT_FLAG_AFTER_CYCLES = 2;
const DRIFT_KEY_PREFIX = 'rep-drift:';

export function compareRepTotals(sourceRep, memberRep) {
  const source = Number(sourceRep);
  const members = Number(memberRep);
  if (!Number.isFinite(source) || !Number.isFinite(members)) {
    return { valid: false, sourceRep: null, memberRep: null, drift: null, mismatched: false };
  }
  const drift = source - members;
  return {
    valid: true,
    sourceRep: source,
    memberRep: members,
    drift,
    mismatched: drift !== 0
  };
}

export function nextRepDriftState(previous, comparison, season, checkedAt) {
  if (!comparison.valid) {
    return {
      season,
      checkedAt,
      valid: false,
      sourceRep: null,
      memberRep: null,
      drift: null,
      consecutiveMismatches: 0,
      flagged: false
    };
  }

  if (!comparison.mismatched) {
    return {
      season,
      checkedAt,
      valid: true,
      sourceRep: comparison.sourceRep,
      memberRep: comparison.memberRep,
      drift: 0,
      consecutiveMismatches: 0,
      flagged: false
    };
  }

  const previousCount = previous?.season === season && previous?.mismatched
    ? Number(previous.consecutiveMismatches || 0)
    : 0;
  const consecutiveMismatches = previousCount + 1;

  return {
    season,
    checkedAt,
    valid: true,
    sourceRep: comparison.sourceRep,
    memberRep: comparison.memberRep,
    drift: comparison.drift,
    mismatched: true,
    consecutiveMismatches,
    flagged: consecutiveMismatches >= REP_DRIFT_FLAG_AFTER_CYCLES
  };
}

export const repDriftKey = (clanId) => `${DRIFT_KEY_PREFIX}${String(clanId)}`;
