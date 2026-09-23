export const STAMINA_MAX = 200;
export const STAMINA_MIN = 0;
export const BLEEDING_STAMINA_THRESHOLD = 70;
export const BLEEDING_MIN_MEMBER_RATIO = 0.5;

const finite = (value, fallback = null) => {
  if (value == null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export function serverReportedStamina({
  stamina = null,
  maxStamina = null,
  staminaKnown = false,
  maxStaminaKnown = false
} = {}) {
  const current = finite(stamina);
  const maximum = finite(maxStamina);

  if (!staminaKnown || !maxStaminaKnown || current === null || maximum === null || maximum <= 0) {
    return null;
  }

  const boundedCurrent = Math.max(STAMINA_MIN, Math.min(maximum, Math.trunc(current)));
  const boundedMaximum = Math.max(1, Math.trunc(maximum));

  return {
    stamina: boundedCurrent,
    maxStamina: boundedMaximum,
    mode: 'SERVER_REPORTED'
  };
}

export function isBleedingMember(stamina, threshold = BLEEDING_STAMINA_THRESHOLD) {
  const value = finite(stamina);
  return value !== null && value <= Number(threshold);
}

export function calculateBleedingState(rows = []) {
  const members = Array.isArray(rows) ? rows.filter((row) => row && row.memberId) : [];
  const verified = members.filter((row) => row.serverReported === true && row.stamina != null);

  if (!members.length || verified.length !== members.length) {
    return {
      bleeding: null,
      lowStaminaCount: 0,
      memberCount: members.length,
      ratio: 0,
      threshold: BLEEDING_STAMINA_THRESHOLD,
      minimumRatio: BLEEDING_MIN_MEMBER_RATIO,
      mode: 'SERVER_REPORTED_UNAVAILABLE',
      trackingReady: false,
      trackedMemberCount: verified.length
    };
  }

  const lowStaminaCount = verified.filter((row) => isBleedingMember(row.stamina)).length;
  const ratio = lowStaminaCount / members.length;

  return {
    bleeding: ratio >= BLEEDING_MIN_MEMBER_RATIO,
    lowStaminaCount,
    memberCount: members.length,
    ratio,
    threshold: BLEEDING_STAMINA_THRESHOLD,
    minimumRatio: BLEEDING_MIN_MEMBER_RATIO,
    mode: 'SERVER_REPORTED',
    trackingReady: true,
    trackedMemberCount: verified.length
  };
}
