import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateRepPerHour, calculateTrackedHours, DEFAULT_MAX_TRACKED_GAP_MS } from '../app/lib/performance-metrics.mjs';

test('tracked hours sum consecutive observation gaps and ignore outages', () => {
  const points = [
    '2026-09-21T10:00:00.000Z',
    '2026-09-21T10:05:00.000Z',
    '2026-09-21T10:10:00.000Z',
    '2026-09-21T10:30:00.000Z'
  ];
  assert.equal(calculateTrackedHours(points), 1 / 6);
  assert.equal(calculateTrackedHours(points, 20 * 60 * 1000), 1 / 2);
  assert.equal(DEFAULT_MAX_TRACKED_GAP_MS, 10 * 60 * 1000);
});

test('REP per hour is zero without positive tracked time', () => {
  assert.equal(calculateRepPerHour(1000, 0), 0);
  assert.equal(calculateRepPerHour(1000, -1), 0);
  assert.equal(calculateRepPerHour(1000, 2), 500);
});
