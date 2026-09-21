import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

function freshnessAt(iso, nowIso) {
  const ageMs = Math.max(0, Date.parse(nowIso) - Date.parse(iso));
  return ageMs <= 60_000 ? 'live' : ageMs <= 300_000 ? 'aging' : 'stale';
}

test('freshness classification uses the last successful sync timestamp', () => {
  const now = '2026-09-21T06:26:00.000Z';
  assert.equal(freshnessAt('2026-09-21T06:25:20.000Z', now), 'live');
  assert.equal(freshnessAt('2026-09-21T06:23:30.000Z', now), 'aging');
  assert.equal(freshnessAt('2026-09-21T05:45:29.119Z', now), 'stale');
});

test('dashboard source uses canonical sync health instead of deleted legacy sync_runs', async () => {
  const source = await readFile(new URL('../app/lib/rep-tracker.js', import.meta.url), 'utf8');
  assert.match(source, /readSyncHealth\(\)/);
  assert.match(source, /syncFresh=freshness\(syncHealth\?\.lastHealthyAt\|\|syncStatus\?\.lastRunAt\|\|null\)/);
  assert.match(source, /lastSuccessfulSyncAt:syncHealth\?\.lastHealthyAt\|\|null/);
  assert.doesNotMatch(source, /from\('sync_runs'\)/);
  assert.doesNotMatch(source, /latestSync\?\.completed_at/);
});

test('member status is not derived from snapshot captured_at', async () => {
  const source = await readFile(new URL('../app/lib/rep-tracker.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /status:freshness\(row\.captured_at\)\.status/);
});