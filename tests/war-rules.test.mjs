import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLAN_WAR_RULES,
  getAffectedTargets,
  getRewardForDifference,
  getVictoryResult
} from '../app/lib/game-rules.mjs';

test('party targeting follows the clan war rules', () => {
  assert.equal(getAffectedTargets(0), 1);
  assert.equal(getAffectedTargets(1), 2);
  assert.equal(getAffectedTargets(2), 3);
});

test('reward tiers remain stable', () => {
  assert.equal(getRewardForDifference(20000), 30);
  assert.equal(getRewardForDifference(10000), 25);
  assert.equal(getRewardForDifference(2000), 20);
  assert.equal(getRewardForDifference(0), 15);
  assert.equal(getRewardForDifference(-50000), 2);
  assert.equal(getRewardForDifference(-50001), 1);
});

test('non-bleeding target cannot produce a victory reward', () => {
  const result = getVictoryResult(267419, 253552, false);
  assert.equal(result.won, false);
  assert.equal(result.reputation, 0);
  assert.equal(result.difference, 13867);
});

test('bleeding target uses reputation difference reward', () => {
  const result = getVictoryResult(267419, 253552, true);
  assert.equal(result.won, true);
  assert.equal(result.reputation, 25);
  assert.equal(result.difference, 13867);
});

test('shared rules expose one source of truth', () => {
  assert.equal(CLAN_WAR_RULES.maxStamina, 200);
  assert.equal(CLAN_WAR_RULES.attackerLeaderCost, 10);
  assert.equal(CLAN_WAR_RULES.recoveryIntervalMinutes, 30);
});
