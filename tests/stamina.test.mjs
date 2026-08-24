import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_STAMINA,
  ATTACK_STAMINA_COST,
  applyAttackCost,
  getBleedingThreshold,
  getDrainFloor,
  getStaminaPercent,
  getStaminaState,
  normalizeMemberStamina
} from '../app/lib/stamina.mjs';

test('shared stamina constants stay consistent', () => {
  assert.equal(MAX_STAMINA, 200);
  assert.equal(ATTACK_STAMINA_COST, 10);
});

test('missing stamina defaults to 200/200 without losing source metadata', () => {
  const member = normalizeMemberStamina({ name: 'Test' });
  assert.equal(member.stamina, 200);
  assert.equal(member.maxStamina, 200);
  assert.equal(member.staminaPercent, 100);
  assert.equal(member.staminaKnown, false);
  assert.equal(member.maxStaminaKnown, false);
  assert.equal(member.staminaState, 'full');
});

test('live stamina overrides the fallback cap', () => {
  const member = normalizeMemberStamina({ stamina: 190, maxStamina: 200 });
  assert.equal(member.stamina, 190);
  assert.equal(member.maxStamina, 200);
  assert.equal(Math.round(getStaminaPercent(member)), 95);
  assert.equal(member.staminaState, 'safe');
});

test('attack cost is exactly 10 and clamps at zero', () => {
  assert.equal(applyAttackCost(200), 190);
  assert.equal(applyAttackCost(190), 180);
  assert.equal(applyAttackCost(5), 0);
  assert.equal(applyAttackCost(0), 0);
});

test('bleeding and drain-floor thresholds are based on max stamina', () => {
  assert.equal(getBleedingThreshold(200), 140);
  assert.equal(getDrainFloor(200), 100);
  assert.equal(getStaminaState({ stamina: 140, maxStamina: 200 }), 'bleeding');
  assert.equal(getStaminaState({ stamina: 100, maxStamina: 200 }), 'drain-floor');
});
