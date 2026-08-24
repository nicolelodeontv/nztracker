export const MAX_STAMINA = 200;
export const ATTACK_STAMINA_COST = 10;
export const BLEEDING_RATIO = 0.7;
export const DRAIN_FLOOR_RATIO = 0.5;

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function getMaxStamina(member) {
  const value = finiteNumber(member?.maxStamina ?? member?.staminaMax ?? member?.max_stamina);
  return value !== null && value > 0 ? value : MAX_STAMINA;
}

export function getCurrentStamina(member) {
  const value = finiteNumber(member?.stamina ?? member?.currentStamina ?? member?.staminaCurrent ?? member?.sta);
  if (value === null) return getMaxStamina(member);
  return Math.max(0, Math.min(value, getMaxStamina(member)));
}

export function getStaminaPercent(member) {
  const max = getMaxStamina(member);
  const current = getCurrentStamina(member);
  return Math.max(0, Math.min(100, current / max * 100));
}

export function getBleedingThreshold(maxStamina = MAX_STAMINA) {
  return Number(maxStamina) * BLEEDING_RATIO;
}

export function getDrainFloor(maxStamina = MAX_STAMINA) {
  return Number(maxStamina) * DRAIN_FLOOR_RATIO;
}

export function isBleeding(member) {
  return getCurrentStamina(member) <= getBleedingThreshold(getMaxStamina(member));
}

export function getStaminaState(member) {
  const percent = getStaminaPercent(member);
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
  const stamina = getCurrentStamina({ ...member, maxStamina });
  return {
    ...member,
    stamina,
    maxStamina,
    staminaKnown: rawCurrent !== null,
    maxStaminaKnown: finiteNumber(member?.maxStamina ?? member?.staminaMax ?? member?.max_stamina) !== null,
    staminaPercent: stamina / maxStamina * 100,
    bleeding: stamina <= getBleedingThreshold(maxStamina),
    drainFloor: stamina <= getDrainFloor(maxStamina),
    staminaState: getStaminaState({ ...member, stamina, maxStamina })
  };
}
