import assert from 'node:assert/strict';
import test from 'node:test';
import { startOfTodaySingapore } from '../app/lib/dashboard-time.mjs';
import { calculateSeasonGain, calculateTodayGain } from '../app/lib/dashboard-baselines.mjs';

test('Singapore day boundary is 16:00 UTC', () => {
  const before = startOfTodaySingapore(new Date('2026-09-21T15:59:59.999Z'));
  const atReset = startOfTodaySingapore(new Date('2026-09-21T16:00:00.000Z'));
  assert.equal(before.toISOString(), '2026-09-20T16:00:00.000Z');
  assert.equal(atReset.toISOString(), '2026-09-21T16:00:00.000Z');
});

test('season gain uses the explicit season baseline', () => {
  assert.equal(calculateSeasonGain(1200, 0), 1200);
  assert.equal(calculateSeasonGain(1200, 350), 850);
});

test('today gain uses the REP at the last known point before reset', () => {
  assert.equal(calculateTodayGain(1450, 1200), 250);
  assert.equal(calculateTodayGain(1000, 1200), 0);
});
