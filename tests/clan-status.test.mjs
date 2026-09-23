import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateClanStatus } from '../app/api/clan-status/route.js';

test('clan status is insufficient-data when no member stamina is verified', () => {
  const state = evaluateClanStatus({
    clan: 'Knock You Up',
    clanId: '36',
    members: [
      { name: 'Taokoz', level: 85, reputation: 14350, stamina: null },
      { name: 'Helel', level: 82, reputation: 10000, stamina: null },
      { name: 'Seirin', level: 94, reputation: 6605, stamina: null }
    ]
  });

  assert.equal(state.state, 'insufficient-data');
  assert.equal(state.bleedingMembers, 0);
  assert.equal(state.staminaAvailable, false);
  assert.equal(state.knownStaminaMembers, 0);
  assert.equal(state.knownStaminaRatio, 0);
  assert.equal(state.staminaSource, 'unavailable');
  assert.equal(state.fullyRecovered, false);
  assert.ok(state.members.every((member) => member.current === null && member.bleeding === null));
});

test('clan status reports healthy only when the full roster has server-reported stamina', () => {
  const state = evaluateClanStatus({
    clan: 'Verified Clan',
    clanId: '99',
    members: [
      { name: 'Alice', level: 90, reputation: 1000, stamina: 150 },
      { name: 'Bob', level: 90, reputation: 900, stamina: 180 },
      { name: 'Cara', level: 90, reputation: 800, stamina: 200 }
    ]
  });

  assert.equal(state.state, 'healthy');
  assert.equal(state.staminaAvailable, true);
  assert.equal(state.knownStaminaMembers, 3);
  assert.equal(state.knownStaminaRatio, 1);
  assert.equal(state.staminaSource, 'server-reported');
});

test('partial server-reported stamina remains insufficient-data', () => {
  const state = evaluateClanStatus({
    clan: 'Partial Clan',
    clanId: '100',
    members: [
      { name: 'Alice', level: 90, reputation: 1000, stamina: 150 },
      { name: 'Bob', level: 90, reputation: 900, stamina: null },
      { name: 'Cara', level: 90, reputation: 800, stamina: null }
    ]
  });

  assert.equal(state.state, 'insufficient-data');
  assert.equal(state.knownStaminaMembers, 1);
  assert.equal(state.knownStaminaRatio, 1 / 3);
  assert.equal(state.staminaSource, 'partial-server-reported');
});
