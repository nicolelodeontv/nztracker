export const SEASON_DEFAULT_BASELINE_REP = 0;

export function calculateSeasonGain(currentRep, baselineRep = SEASON_DEFAULT_BASELINE_REP) {
  const current = Number(currentRep);
  const baseline = Number(baselineRep);
  if (!Number.isFinite(current)) return 0;
  if (!Number.isFinite(baseline)) return current;
  return current - baseline;
}

export function calculateTodayGain(currentRep, resetBaselineRep = 0) {
  const current = Number(currentRep);
  const baseline = Number(resetBaselineRep);
  if (!Number.isFinite(current) || !Number.isFinite(baseline)) return 0;
  return Math.max(0, current - baseline);
}
