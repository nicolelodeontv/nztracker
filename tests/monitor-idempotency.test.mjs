import test from 'node:test';
import assert from 'node:assert/strict';
import { MONITOR_WINDOW_MS, monitorWindowKey } from '../app/lib/monitor-idempotency.mjs';

test('monitor windows are stable within a one-minute slot', () => {
  const start = Math.floor(1_750_000_000_000 / MONITOR_WINDOW_MS) * MONITOR_WINDOW_MS;
  assert.equal(monitorWindowKey(start), monitorWindowKey(start + MONITOR_WINDOW_MS - 1));
  assert.notEqual(monitorWindowKey(start), monitorWindowKey(start + MONITOR_WINDOW_MS));
});
