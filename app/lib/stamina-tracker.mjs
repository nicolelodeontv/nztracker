export const STAMINA_MAX = 200;
export const STAMINA_MIN = 0;
export const STAMINA_DRAIN_PER_REP_GAIN = 10;
export const STAMINA_RECOVERY_AMOUNT = 60;
export const STAMINA_RECOVERY_INTERVAL_MS = 30 * 60 * 1000;
export const BLEEDING_STAMINA_THRESHOLD = 70;
export const BLEEDING_MIN_MEMBER_RATIO = 0.5;

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function clampStamina(value) {
  return Math.max(STAMINA_MIN, Math.min(STAMINA_MAX, Math.trunc(finite(value))));
}

export function recoveryIntervalsElapsed(previousCalculatedAt, capturedAt) {
  const previousMs = Date.parse(previousCalculatedAt || '');
  const capturedMs = Date.parse(capturedAt || '');
  if (!Number.isFinite(previousMs) || !Number.isFinite(capturedMs) || capturedMs <= previousMs) return 0;
  return Math.floor((capturedMs - previousMs) / STAMINA_RECOVERY_INTERVAL_MS);
}

export function calculateStaminaStep({
  previousStamina = STAMINA_MAX,
  previousRep = null,
  currentRep = 0,
  previousCalculatedAt = null,
  capturedAt = null
} = {}) {
  const before = clampStamina(previousStamina);
  const previous = Number.isFinite(Number(previousRep)) ? Number(previousRep) : null;
  const current = finite(currentRep);
  const intervals = recoveryIntervalsElapsed(previousCalculatedAt, capturedAt);
  const recovered = Math.min(
    STAMINA_MAX - before,
    intervals * STAMINA_RECOVERY_AMOUNT
  );
  const afterRecovery = clampStamina(before + recovered);
  const repGain = previous === null ? 0 : Math.max(0, current - previous);
  const drainEvents = repGain > 0 ? 1 : 0;
  const drained = Math.min(afterRecovery, drainEvents * STAMINA_DRAIN_PER_REP_GAIN);
  const stamina = clampStamina(afterRecovery - drained);

  return {
    stamina,
    maxStamina: STAMINA_MAX,
    recovered,
    drained,
    repGain,
    drainEvents,
    recoveryIntervals: intervals,
    mode: 'CALCULATED'
  };
}

export function isBleedingMember(stamina) {
  return Number(stamina) <= BLEEDING_STAMINA_THRESHOLD;
}

export function calculateBleedingState(rows = []) {
  const members = Array.isArray(rows) ? rows.filter((row) => row && row.memberId) : [];
  if (!members.length) {
    return {
      bleeding: false,
      lowStaminaCount: 0,
      memberCount: 0,
      ratio: 0,
      threshold: BLEEDING_STAMINA_THRESHOLD,
      minimumRatio: BLEEDING_MIN_MEMBER_RATIO,
      mode: 'CALCULATED'
    };
  }

  const lowStaminaCount = members.filter((row) => isBleedingMember(row.stamina)).length;
  const ratio = lowStaminaCount / members.length;

  return {
    bleeding: ratio >= BLEEDING_MIN_MEMBER_RATIO,
    lowStaminaCount,
    memberCount: members.length,
    ratio,
    threshold: BLEEDING_STAMINA_THRESHOLD,
    minimumRatio: BLEEDING_MIN_MEMBER_RATIO,
    mode: 'CALCULATED'
  };
}
