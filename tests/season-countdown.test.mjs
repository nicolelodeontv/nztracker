import test from 'node:test';
import assert from 'node:assert/strict';
import { formatSeasonCountdown } from '../app/lib/season-countdown.js';

test('missing season end is shown as Unknown', () => {
  assert.equal(formatSeasonCountdown(null, Date.parse('2026-09-21T00:00:00Z')), 'Unknown');
  assert.equal(formatSeasonCountdown(undefined, Date.parse('2026-09-21T00:00:00Z')), 'Unknown');
});

test('valid season end is formatted as a countdown', () => {
  const now = Date.parse('2026-09-21T00:00:00Z');
  const end = Date.parse('2026-09-22T01:02:03Z');
  assert.equal(formatSeasonCountdown(end, now), '1d 01h 02m 03s');
});

test('invalid season end is shown as Unknown', () => {
  assert.equal(formatSeasonCountdown('not-a-date', Date.now()), 'Unknown');
});
