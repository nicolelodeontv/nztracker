import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

function freshnessAt(iso, nowIso) {
  const ageMs = Math.max(0, Date.parse(nowIso) - Date.parse(iso));
  return ageMs <= 60_000 ? 'live' : ageMs <= 300_000 ? 'aging' : 'stale';
}

test('freshness classification uses the last successful sync timestamp', () => {
  const now = '2026-09-21T07:31:00.000Z';
  assert.equal(freshnessAt('2026-09-21T07:30:03.587Z', now), 'live');
  assert.equal(freshnessAt('2026-09-21T07:27:00.000Z', now), 'aging');
  assert.equal(freshnessAt('2026-09-21T07:00:14.531Z', now), 'stale');
});

test('dashboard freshness uses canonical sync health state', async () => {
  const source = await readFile(new URL('../app/lib/rep-tracker.js', import.meta.url), 'utf8');
  assert.match(source, /readSyncHealth\(\)/);
  assert.match(source, /syncFresh=freshness\(syncHealth\?\.lastMemberSuccessAt\|\|syncHealth\?\.lastHealthyAt\|\|syncStatus\?\.lastRunAt\|\|null\)/);
  assert.match(source, /lastSuccessfulSyncAt:syncHealth\?\.lastMemberSuccessAt\|\|syncHealth\?\.lastHealthyAt\|\|null/);
  assert.doesNotMatch(source, /from\('sync_runs'\)/);
  assert.doesNotMatch(source, /latestSync\?\.completed_at/);
});

test('member status is not derived from snapshot captured_at', async () => {
  const source = await readFile(new URL('../app/lib/rep-tracker.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /status:freshness\(row\.captured_at\)\.status/);
});