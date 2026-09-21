import assert from 'node:assert/strict';
import test from 'node:test';
import { compareRepTotals, nextRepDriftState, REP_DRIFT_FLAG_AFTER_CYCLES } from '../app/lib/rep-drift.mjs';

test('matching clan and member REP clears drift', () => {
  const result = compareRepTotals(30107, 30107);
  assert.equal(result.mismatched, false);
  assert.equal(nextRepDriftState(null, result, 'Season 3', '2026-09-21T12:50:00.000Z').flagged, false);
});

test('the first mismatched sync is observed but not flagged', () => {
  const result = nextRepDriftState(
    null,
    compareRepTotals(30107, 30000),
    'Season 3',
    '2026-09-21T12:50:00.000Z'
  );
  assert.equal(result.drift, 107);
  assert.equal(result.consecutiveMismatches, 1);
  assert.equal(result.flagged, false);
});

test('the second consecutive mismatched sync is flagged', () => {
  const first = nextRepDriftState(
    null,
    compareRepTotals(30107, 30000),
    'Season 3',
    '2026-09-21T12:50:00.000Z'
  );
  const second = nextRepDriftState(
    first,
    compareRepTotals(30107, 30050),
    'Season 3',
    '2026-09-21T12:55:00.000Z'
  );
  assert.equal(second.consecutiveMismatches, REP_DRIFT_FLAG_AFTER_CYCLES);
  assert.equal(second.flagged, true);
});
