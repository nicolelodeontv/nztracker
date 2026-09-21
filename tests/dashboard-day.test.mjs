import test from 'node:test';
import assert from 'node:assert/strict';
import { startOfTodaySingapore } from '../app/lib/dashboard-time.mjs';

test('dashboard today starts at midnight Asia/Singapore', () => {
  const beforeSingaporeMidnight = new Date('2026-09-20T15:59:59.000Z');
  const afterSingaporeMidnight = new Date('2026-09-20T16:00:00.000Z');

  assert.equal(startOfTodaySingapore(beforeSingaporeMidnight).toISOString(), '2026-09-19T16:00:00.000Z');
  assert.equal(startOfTodaySingapore(afterSingaporeMidnight).toISOString(), '2026-09-20T16:00:00.000Z');
});
