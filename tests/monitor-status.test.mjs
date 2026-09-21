import test from 'node:test';
import assert from 'node:assert/strict';
import { getMonitorStatus } from '../app/lib/monitor-status.mjs';

test('monitor warns when no members are seen', () => {
  assert.equal(getMonitorStatus({ membersSeen: 0, memberErrors: 0 }), 'warning');
});

test('monitor warns when member errors exist', () => {
  assert.equal(getMonitorStatus({ membersSeen: 30, memberErrors: 1 }), 'warning');
});

test('monitor warns when ranking cache storage fails', () => {
  assert.equal(getMonitorStatus({ membersSeen: 30, memberErrors: 0, rankingCacheError: 'db failed' }), 'warning');
});

test('monitor succeeds with members and no errors', () => {
  assert.equal(getMonitorStatus({ membersSeen: 30, memberErrors: 0 }), 'success');
});
