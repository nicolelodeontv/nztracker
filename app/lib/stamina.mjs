export const MAX_STAMINA = 200;
export const ATTACK_STAMINA_COST = 10;
export const BLEEDING_RATIO = 0.7;
export const DRAIN_FLOOR_RATIO = 0.5;

function finiteNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function getMaxStamina(member) {
  const value = finiteNumber(member?.maxStamina ?? member?.staminaMax ?? member?.max_stamina);
  return value !== null && value > 0 ? value : MAX_STAMINA;
}

export function getCurrentStamina(member) {
  const value = finiteNumber(member?.stamina ?? member?.currentStamina ?? member?.staminaCurrent ?? member?.sta);
  if (value === null) return null;
  return Math.max(0, Math.min(value, getMaxStamina(member)));
}

export function getStaminaPercent(member) {
  const max = getMaxStamina(member);
  const current = getCurrentStamina(member);
  if (current === null || !Number.isFinite(max) || max <= 0) return null;
  return Math.max(0, Math.min(100, current / max * 100));
}

export function getBleedingThreshold(maxStamina = MAX_STAMINA) {
  return Number(maxStamina) * BLEEDING_RATIO;
}

export function getDrainFloor(maxStamina = MAX_STAMINA) {
  return Number(maxStamina) * DRAIN_FLOOR_RATIO;
}

export function isBleeding(member) {
  const current = getCurrentStamina(member);
  if (current === null) return null;
  return current <= getBleedingThreshold(getMaxStamina(member));
}

export function getStaminaState(member) {
  const percent = getStaminaPercent(member);
  if (percent === null) return 'unknown';
  if (percent <= 50) return 'drain-floor';
  if (percent <= 70) return 'bleeding';
  if (percent >= 100) return 'full';
  return 'safe';
}

export function applyAttackCost(currentStamina, cost = ATTACK_STAMINA_COST) {
  const value = finiteNumber(currentStamina) ?? MAX_STAMINA;
  const staminaCost = Math.max(0, finiteNumber(cost) ?? ATTACK_STAMINA_COST);
  return Math.max(0, Math.min(MAX_STAMINA, value - staminaCost));
}

export function getRecoveryAmount(ramenLevel = 0, baseRecovery = 30, perRamenLevel = 10) {
  const level = Math.max(0, finiteNumber(ramenLevel) ?? 0);
  return baseRecovery + level * perRamenLevel;
}

export function normalizeMemberStamina(member) {
  const maxStamina = getMaxStamina(member);
  const rawCurrent = finiteNumber(member?.stamina ?? member?.currentStamina ?? member?.staminaCurrent ?? member?.sta);
  const stamina = rawCurrent === null ? null : Math.max(0, Math.min(rawCurrent, maxStamina));
  const percent = stamina === null ? null : stamina / maxStamina * 100;
  const bleeding = stamina === null ? null : stamina <= getBleedingThreshold(maxStamina);
  const drainFloor = stamina === null ? null : stamina <= getDrainFloor(maxStamina);
  return {
    ...member,
    stamina,
    maxStamina,
    staminaKnown: rawCurrent !== null,
    maxStaminaKnown: finiteNumber(member?.maxStamina ?? member?.staminaMax ?? member?.max_stamina) !== null,
    staminaPercent: percent,
    bleeding,
    drainFloor,
    staminaState: stamina === null ? 'unknown' : getStaminaState({ ...member, stamina, maxStamina })
  };
}
