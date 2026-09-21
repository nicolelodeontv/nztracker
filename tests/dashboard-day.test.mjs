import test from 'node:test';
import assert from 'node:assert/strict';
import { startOfTodayManila } from '../app/lib/rep-tracker.js';

test('dashboard today starts at midnight Asia/Manila', () => {
  const beforeManilaMidnight = new Date('2026-09-20T15:59:59.000Z');
  const afterManilaMidnight = new Date('2026-09-20T16:00:00.000Z');

  assert.equal(startOfTodayManila(beforeManilaMidnight).toISOString(), '2026-09-19T16:00:00.000Z');
  assert.equal(startOfTodayManila(afterManilaMidnight).toISOString(), '2026-09-20T16:00:00.000Z');
});
